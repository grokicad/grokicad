use anyhow::Context;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::{DateTime, TimeZone, Utc};
use git2::build::RepoBuilder;
use git2::{
    Blob, Commit, DiffDelta, DiffOptions, ObjectType, Repository, Sort, TreeWalkMode,
    TreeWalkResult,
};
use kicad_db::{create_pool, retrieve_schematic, store_schematic};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug)]
pub struct CommitResponse {
    pub commit_hash: String,
    pub commit_date: Option<DateTime<Utc>>,
    pub git_message: Option<String>,
    pub blurb: Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OverviewResponse {
    pub blurb: Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct CreateResponse {
    pub processed: usize,
    pub errors: Vec<String>,
}

type AppState = Arc<PgPool>;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().init();

    let pool = create_pool()
        .await
        .context("Failed to create database pool")?;

    let app_state = Arc::new(pool);

    let app = Router::new()
        .route("/api/commits/*repo", get(get_commits))
        .route("/api/create/*repo", post(create_overviews))
        .route("/api/overview/:commit/*repo", get(get_overview))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(tower_http::cors::CorsLayer::permissive()) // For development
        .with_state(app_state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:443").await?;
    info!("Server listening on 0.0.0.0:443");

    axum::serve(listener, app).await?;

    Ok(())
}

async fn get_commits(
    Path(repo): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Vec<CommitResponse>>, StatusCode> {
    let repo = repo.trim_start_matches('/');
    let repo_url = format!("https://github.com/{}.git", repo);
    let commits = match fetch_relevant_commits(&repo, &repo_url, &state).await {
        Ok(c) => c,
        Err(e) => {
            error!("Error fetching commits for {}: {}", repo, e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    Ok(Json(commits))
}

async fn create_overviews(
    Path(repo): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<CreateResponse>, StatusCode> {
    let repo = repo.trim_start_matches('/');
    let repo_url = format!("https://github.com/{}.git", repo);
    let result = process_missing_overviews(&repo, &repo_url, &state)
        .await
        .map_err(|e| {
            error!("Error creating overviews for {}: {}", repo, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(result))
}

async fn get_overview(
    Path((commit, repo)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Json<OverviewResponse>, StatusCode> {
    let repo = repo.trim_start_matches('/');
    let repo_url = format!("https://github.com/{}.git", repo);
    let sch = retrieve_schematic(&state, &repo_url, &commit)
        .await
        .map_err(|e| {
            error!("Error retrieving overview for {}/{}: {}", repo, commit, e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(OverviewResponse {
        blurb: sch.blurb,
        description: sch.description,
    }))
}

// Helper to fetch or clone repo using spawn_blocking for sync git2
async fn get_git_repo(repo_slug: &str) -> anyhow::Result<Repository> {
    let repo_slug = repo_slug.to_string();
    let cache_path =
        std::env::temp_dir().join(format!("kicad-cache-{}", repo_slug.replace('/', "-")));

    let repo = tokio::task::spawn_blocking(move || -> anyhow::Result<Repository> {
        if !cache_path.exists() {
            let url = format!("https://github.com/{}.git", repo_slug);
            let repo = RepoBuilder::new().clone(&url, &cache_path)?;
            info!("Cloned repo {} to {:?}", repo_slug, cache_path);
            Ok(repo)
        } else {
            let repo = Repository::open(&cache_path)?;
            // Fetch updates
            let mut remote = repo.find_remote("origin").or_else(|_| {
                let url = format!("https://github.com/{}.git", repo_slug);
                repo.remote("origin", &url)
            })?;
            remote.fetch(&["refs/heads/*:refs/remotes/origin/*"], None, None)?;
            drop(remote);
            info!("Updated repo {} from cache {:?}", repo_slug, cache_path);
            Ok(repo)
        }
    })
    .await??;

    Ok(repo)
}

// Fetch commits that affect .kicad_sch files, with DB overviews
async fn fetch_relevant_commits(
    repo_slug: &str,
    repo_url: &str,
    pool: &PgPool,
) -> anyhow::Result<Vec<CommitResponse>> {
    let git_repo = get_git_repo(repo_slug).await?;

    let commits: Vec<CommitResponse> =
        tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<CommitResponse>> {
            let mut revwalk = git_repo.revwalk()?;
            revwalk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::REVERSE);
            revwalk.push_head()?;

            let mut res = Vec::new();
            let mut revwalk = git_repo.revwalk()?;
            revwalk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::REVERSE);
            revwalk.push_head()?;

            for oid in revwalk {
                let oid = oid.map_err(|e| anyhow::anyhow!(e))?;
                let commit = git_repo.find_commit(oid).map_err(|e| anyhow::anyhow!(e))?;
                let has_sch_change = has_schematic_changes(&git_repo, &commit)?;

                if has_sch_change {
                    let commit_hash = commit.id().to_string();
                    let commit_date = Some(
                        chrono::Utc
                            .timestamp_opt(commit.time().seconds(), 0)
                            .single()
                            .unwrap_or(chrono::Utc::now()),
                    );
                    let git_message = commit.summary().map(ToString::to_string);

                    res.push(CommitResponse {
                        commit_hash,
                        commit_date,
                        git_message,
                        blurb: None,
                        description: None,
                    });
                }
            }
            Ok(res)
        })
        .await??;

    // Now, for each commit, query DB to fill blurb/desc
    let mut filled_commits = Vec::new();
    for mut cr in commits {
        let sch = retrieve_schematic(pool, repo_url, &cr.commit_hash).await?;
        if let Some(s) = sch {
            cr.blurb = s.blurb;
            cr.description = s.description;
            cr.commit_date = s.commit_date;
            cr.git_message = s.git_message;
        }
        filled_commits.push(cr);
    }

    Ok(filled_commits)
}

fn has_schematic_changes(repo: &Repository, commit: &Commit) -> anyhow::Result<bool> {
    if let Some(parent) = commit.parents().next() {
        let tree1 = parent.tree()?;
        let tree2 = commit.tree()?;
        let diff = repo.diff_tree_to_tree(Some(&tree1), Some(&tree2), None)?;
        Ok(diff.deltas().any(|d| {
            // Check old file
            if let Some(p) = d.old_file().path() {
                if let Some(s) = p.to_str() {
                    if s.ends_with(".kicad_sch") {
                        return true;
                    }
                }
            }
            // Check new file
            if let Some(p) = d.new_file().path() {
                if let Some(s) = p.to_str() {
                    if s.ends_with(".kicad_sch") {
                        return true;
                    }
                }
            }
            false
        }))
    } else {
        // Root commit: check if tree has .kicad_sch
        let tree = commit.tree()?;
        let mut has = false;
        let _ = tree.walk(git2::TreeWalkMode::PreOrder, |_, entry| {
            if let Some(name) = entry.name() {
                if name.ends_with(".kicad_sch") && entry.kind() == Some(ObjectType::Blob) {
                    has = true;
                    return git2::TreeWalkResult::Abort;
                }
            }
            git2::TreeWalkResult::Ok
        });
        Ok(has)
    }
}

// Process missing overviews
async fn process_missing_overviews(
    repo_slug: &str,
    repo_url: &str,
    pool: &PgPool,
) -> anyhow::Result<CreateResponse> {
    let git_repo = get_git_repo(repo_slug).await?;

    let mut processed = 0;
    let mut errors = Vec::new();

    // Get all relevant commit hashes first
    let relevant_hashes = tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<String>> {
        let mut revwalk = git_repo.revwalk()?;
        revwalk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::REVERSE);
        revwalk.push_head()?;

        let mut hashes = Vec::new();
        for oid in revwalk {
            let oid = oid.map_err(|e| anyhow::anyhow!(e))?;
            let commit = git_repo.find_commit(oid).map_err(|e| anyhow::anyhow!(e))?;
            if has_schematic_changes(&git_repo, &commit)? {
                hashes.push(commit.id().to_string());
            }
        }
        Ok(hashes)
    })
    .await??;

    for commit_hash in relevant_hashes {
        let sch_opt = retrieve_schematic(pool, repo_url, &commit_hash).await?;
        if sch_opt
            .as_ref()
            .map(|s| s.blurb.is_none() || s.description.is_none())
            .unwrap_or(true)
        {
            if let Err(e) =
                generate_and_store_overview(repo_slug, repo_url, &commit_hash, pool).await
            {
                errors.push(format!("Commit {}: {}", commit_hash, e));
            } else {
                processed += 1;
            }
        }
    }

    Ok(CreateResponse { processed, errors })
}

// Generate overview for a commit
async fn generate_and_store_overview(
    repo_slug: &str,
    repo_url: &str,
    commit_hash: &str,
    pool: &PgPool,
) -> anyhow::Result<()> {
    let repo_slug = repo_slug.to_string();
    let commit_hash_owned = commit_hash.to_string();
    let (blurb, description, commit_date, git_message_str) = tokio::task::spawn_blocking(
        move || -> anyhow::Result<(String, String, Option<DateTime<Utc>>, Option<String>)> {
            let cache_path =
                std::env::temp_dir().join(format!("kicad-cache-{}", repo_slug.replace('/', "-")));
            let git_repo = Repository::open(&cache_path)?;
            let commit_oid = git_repo.revparse_single(&commit_hash_owned)?;
            let commit = git_repo.find_commit(commit_oid.id())?;
            let commit_date = Some(
                chrono::Utc
                    .timestamp_opt(commit.time().seconds(), 0)
                    .single()
                    .unwrap_or(chrono::Utc::now()),
            );
            let git_message = commit.summary().map(|s| s.to_string());

            let mut changed_files: Vec<(Option<String>, String, String)> = Vec::new();
            if let Some(parent) = commit.parents().next() {
                let tree1 = parent.tree()?;
                let tree2 = commit.tree()?;
                let diff = git_repo.diff_tree_to_tree(Some(&tree1), Some(&tree2), None)?;
                for delta in diff.deltas() {
                    let new_path_opt = delta
                        .new_file()
                        .path()
                        .and_then(|p| p.to_str().map(ToString::to_string));
                    if let Some(new_path) = new_path_opt {
                        if new_path.ends_with(".kicad_sch") {
                            let before_opt = delta.old_file().path().and_then(|old_p| {
                                old_p
                                    .to_str()
                                    .and_then(|s| get_file_content(&git_repo, &tree1, s).ok())
                            });
                            let after_opt = get_file_content(&git_repo, &tree2, &new_path).ok();
                            if let Some(after) = after_opt {
                                changed_files.push((before_opt, after, new_path));
                            }
                        }
                    }
                }
            } else {
                let tree = commit.tree()?;
                let mut cf = Vec::new();
                let _ = tree.walk(git2::TreeWalkMode::PreOrder, |_, entry| {
                    if let Some(name) = entry.name() {
                        if name.ends_with(".kicad_sch") {
                            if let Ok(obj) = entry.to_object(&git_repo) {
                                if let Ok(blob) = obj.into_blob() {
                                    let content =
                                        String::from_utf8_lossy(blob.content()).to_string();
                                    cf.push((None, content, name.to_string()));
                                }
                            }
                        }
                    }
                    git2::TreeWalkResult::Ok
                });
                changed_files = cf;
            }

            let (blurb, description) =
                generate_commit_overview(&changed_files, commit.summary().unwrap_or(""));
            Ok((blurb, description, commit_date, git_message))
        },
    )
    .await??;

    let empty_parts = HashMap::new();
    store_schematic(
        pool,
        repo_url,
        &commit_hash,
        commit_date,
        git_message_str.as_deref(),
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

fn generate_commit_overview(
    changed_files: &Vec<(Option<String>, String, String)>,
    commit_msg: &str,
) -> (String, String) {
    // TODO: Implement Grok query with special context: provide before/after for each changed .kicad_sch file
    // For now, placeholder
    let num_files = changed_files.len();
    let blurb = if num_files > 0 {
        format!(
            "Schematic changes in {} file(s): {}",
            num_files,
            commit_msg.split(' ').next().unwrap_or("Update")
        )
    } else {
        "Initial schematic commit".to_string()
    };
    let mut desc = format!("Commit message: {}\nChanged files: ", commit_msg);
    for (_, _, path) in changed_files {
        desc.push_str(path);
        desc.push_str(", ");
    }
    if let Some((before, after, _)) = changed_files.first() {
        desc.push_str(&format!(
            "\nExample diff lines: {} -> {}",
            before.as_ref().map(|b| b.lines().count()).unwrap_or(0),
            after.lines().count()
        ));
        // Could add simple diff here
    }
    desc.pop();
    desc.pop(); // trim ", "
    (blurb, desc)
}

fn get_file_content(repo: &Repository, tree: &git2::Tree, path: &str) -> anyhow::Result<String> {
    let entry = tree
        .get_path(std::path::Path::new(path))
        .map_err(|e| anyhow::anyhow!("Entry not found {}: {}", path, e))?;
    let obj = entry
        .to_object(repo)
        .map_err(|e| anyhow::anyhow!("Object not found {}: {}", path, e))?;
    let blob = obj
        .into_blob()
        .map_err(|_| anyhow::anyhow!("Not a blob {}", path))?;
    Ok(String::from_utf8_lossy(blob.content()).to_string())
}

// Note: In fetch_relevant_commits, the spawn_blocking collects basic info, then async query fills DB fields.
// For root commit check in has_schematic_changes, adjust if needed.
// This is a basic implementation; optimize for large repos (e.g., limit revwalk depth, use git log plumbing).
