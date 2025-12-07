use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{error, info};

use crate::services::git;
use crate::types::{ApiError, HookUpdateResponse};
use kicad_db::{retrieve_schematic, store_schematic, PgPool};

pub type AppState = Arc<PgPool>;

/// Process a repository and generate overviews for commits missing them
#[utoipa::path(
    post,
    path = "/api/hook/update/{repo}",
    params(
        ("repo" = String, Path, description = "GitHub repository in owner/repo format")
    ),
    responses(
        (status = 200, description = "Repository processed successfully", body = HookUpdateResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "hook"
)]
pub async fn update_repo(
    State(state): State<AppState>,
    Path(repo): Path<String>,
) -> Result<Json<HookUpdateResponse>, (StatusCode, Json<ApiError>)> {
    let repo = repo.trim_start_matches('/').to_string();
    let repo_url = format!("https://github.com/{}.git", repo);

    info!("Processing update hook for repo: {}", repo);

    // Get all commits with schematic changes
    let commits = git::get_schematic_commits(&repo).await.map_err(|e| {
        error!("Failed to get commits for {}: {}", repo, e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to fetch commits: {}",
                e
            ))),
        )
    })?;

    let mut processed = 0;
    let mut errors = Vec::new();

    for commit_info in commits {
        // Check if we already have an overview for this commit
        let existing = retrieve_schematic(&state, &repo_url, &commit_info.commit_hash)
            .await
            .ok()
            .flatten();

        let needs_processing = existing
            .as_ref()
            .map(|s| s.blurb.is_none() || s.description.is_none())
            .unwrap_or(true);

        if needs_processing {
            match generate_and_store_overview(
                &state,
                &repo,
                &repo_url,
                &commit_info.commit_hash,
                commit_info.commit_date,
                commit_info.message.as_deref(),
            )
            .await
            {
                Ok(_) => {
                    processed += 1;
                    info!(
                        "Generated overview for {}/{}",
                        repo, commit_info.commit_hash
                    );
                }
                Err(e) => {
                    let err_msg = format!("Commit {}: {}", commit_info.commit_hash, e);
                    error!("Failed to generate overview: {}", err_msg);
                    errors.push(err_msg);
                }
            }
        }
    }

    Ok(Json(HookUpdateResponse {
        repo,
        processed,
        errors,
    }))
}

/// Generate a placeholder overview and store it in the database
async fn generate_and_store_overview(
    pool: &PgPool,
    repo_slug: &str,
    repo_url: &str,
    commit_hash: &str,
    commit_date: Option<chrono::DateTime<chrono::Utc>>,
    git_message: Option<&str>,
) -> anyhow::Result<()> {
    // Get changed files for context
    let changed_files = git::get_changed_schematic_files(repo_slug, commit_hash).await?;

    // Generate placeholder overview (TODO: integrate with Grok)
    let num_files = changed_files.len();
    let blurb = if num_files > 0 {
        format!(
            "Schematic changes in {} file(s): {}",
            num_files,
            git_message
                .unwrap_or("Update")
                .split_whitespace()
                .take(5)
                .collect::<Vec<_>>()
                .join(" ")
        )
    } else {
        "Initial schematic commit".to_string()
    };

    let mut description = format!(
        "Commit message: {}\nChanged files:\n",
        git_message.unwrap_or("(no message)")
    );
    for path in &changed_files {
        description.push_str(&format!("  - {}\n", path));
    }

    let empty_parts = HashMap::new();
    store_schematic(
        pool,
        repo_url,
        commit_hash,
        commit_date,
        git_message,
        None, // image
        None, // summary
        None, // overview
        Some(&blurb),
        Some(&description),
        empty_parts,
    )
    .await?;

    Ok(())
}
