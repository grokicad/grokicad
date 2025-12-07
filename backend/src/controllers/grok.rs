use axum::{extract::State, http::StatusCode, response::Json};
use std::sync::Arc;
use tracing::info;

use crate::services::git;
use crate::types::{
    ApiError, GrokCommitSummaryRequest, GrokCommitSummaryResponse, GrokRepoSummaryRequest,
    GrokRepoSummaryResponse, GrokSelectionSummaryRequest, GrokSelectionSummaryResponse,
};
use kicad_db::PgPool;

pub type AppState = Arc<PgPool>;

/// Get an AI-generated summary for a specific commit
#[utoipa::path(
    post,
    path = "/api/grok/summary/commit",
    request_body = GrokCommitSummaryRequest,
    responses(
        (status = 200, description = "AI-generated commit summary", body = GrokCommitSummaryResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn summarize_commit(
    State(_state): State<AppState>,
    Json(req): Json<GrokCommitSummaryRequest>,
) -> Result<Json<GrokCommitSummaryResponse>, (StatusCode, Json<ApiError>)> {
    info!(
        "Grok summarize_commit called for {}/{}",
        req.repo, req.commit
    );

    // Get changed files for context
    let changed_files = git::get_changed_schematic_files(&req.repo, &req.commit)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to fetch changed files: {}",
                    e
                ))),
            )
        })?;

    // Mock response - TODO: integrate with actual Grok API
    let summary = format!(
        "[MOCK] This commit modified {} schematic file(s) in the {} repository.",
        changed_files.len(),
        req.repo
    );

    let details = format!(
        "[MOCK] Detailed analysis of commit {}:\n\n\
        Changed files:\n{}\n\n\
        This is a placeholder response. In production, this would contain \
        AI-generated insights about the schematic changes, including:\n\
        - Component additions/removals\n\
        - Net connectivity changes\n\
        - Design rule modifications\n\
        - Potential impact on board layout",
        req.commit,
        changed_files
            .iter()
            .map(|f| format!("  - {}", f))
            .collect::<Vec<_>>()
            .join("\n")
    );

    Ok(Json(GrokCommitSummaryResponse {
        repo: req.repo,
        commit: req.commit,
        summary,
        details,
    }))
}

/// Get an AI-generated summary for selected components
#[utoipa::path(
    post,
    path = "/api/grok/summary/selection",
    request_body = GrokSelectionSummaryRequest,
    responses(
        (status = 200, description = "AI-generated component selection summary", body = GrokSelectionSummaryResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn summarize_selection(
    State(_state): State<AppState>,
    Json(req): Json<GrokSelectionSummaryRequest>,
) -> Result<Json<GrokSelectionSummaryResponse>, (StatusCode, Json<ApiError>)> {
    info!(
        "Grok summarize_selection called for {}/{} with {} components",
        req.repo,
        req.commit,
        req.component_ids.len()
    );

    // Mock response - TODO: integrate with actual Grok API
    let summary = format!(
        "[MOCK] Analysis of {} selected component(s) in commit {}.",
        req.component_ids.len(),
        &req.commit[..8.min(req.commit.len())]
    );

    let details = format!(
        "[MOCK] Detailed analysis of selected components:\n\n\
        Selected IDs: {}\n\n\
        This is a placeholder response. In production, this would contain \
        AI-generated insights about the selected components, including:\n\
        - Component specifications and datasheets\n\
        - Pin connectivity and net associations\n\
        - Related components in the design\n\
        - Suggestions for alternatives or improvements",
        req.component_ids.join(", ")
    );

    Ok(Json(GrokSelectionSummaryResponse {
        repo: req.repo,
        commit: req.commit,
        component_ids: req.component_ids,
        summary,
        details,
    }))
}

/// Get an AI-generated summary for an entire repository (latest commit on main)
#[utoipa::path(
    post,
    path = "/api/grok/summary/repo",
    request_body = GrokRepoSummaryRequest,
    responses(
        (status = 200, description = "AI-generated repository summary", body = GrokRepoSummaryResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn summarize_repo(
    State(_state): State<AppState>,
    Json(req): Json<GrokRepoSummaryRequest>,
) -> Result<Json<GrokRepoSummaryResponse>, (StatusCode, Json<ApiError>)> {
    info!("Grok summarize_repo called for {}", req.repo);

    // Get the latest commit
    let latest_commit = git::get_latest_commit(&req.repo).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to fetch latest commit: {}",
                e
            ))),
        )
    })?;

    // Get schematic files at latest commit
    let files = git::get_schematic_files(&req.repo, &latest_commit)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to fetch schematic files: {}",
                    e
                ))),
            )
        })?;

    // Mock response - TODO: integrate with actual Grok API
    let summary = format!(
        "[MOCK] Repository {} contains {} schematic file(s) at the latest commit.",
        req.repo,
        files.len()
    );

    let details = format!(
        "[MOCK] Repository overview for {}:\n\n\
        Latest commit: {}\n\
        Schematic files:\n{}\n\n\
        This is a placeholder response. In production, this would contain \
        AI-generated insights about the entire project, including:\n\
        - Overall design architecture\n\
        - Key components and subsystems\n\
        - Design complexity metrics\n\
        - Potential areas for improvement",
        req.repo,
        latest_commit,
        files
            .iter()
            .map(|f| format!("  - {}", f.path))
            .collect::<Vec<_>>()
            .join("\n")
    );

    Ok(Json(GrokRepoSummaryResponse {
        repo: req.repo,
        summary,
        details,
    }))
}
