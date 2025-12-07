use axum::{extract::State, http::StatusCode, response::Json};
use std::sync::Arc;
use tracing::{error, info};

use crate::services::{distill, git};
use crate::types::{
    ApiError, CommitFilesRequest, CommitFilesResponse, CommitInfoRequest, CommitInfoResponse,
    RepoClearCacheRequest, RepoClearCacheResponse, RepoCommitsRequest, RepoCommitsResponse,
    RepoInitRequest, RepoInitResponse,
};
use kicad_db::{
    clear_distilled_json, retrieve_distilled_json, retrieve_schematic, store_distilled_json,
    PgPool,
};

pub type AppState = Arc<PgPool>;

/// Get all commits (with flag indicating schematic changes)
#[utoipa::path(
    post,
    path = "/api/repo/commits",
    request_body = RepoCommitsRequest,
    responses(
        (status = 200, description = "List of all commits with schematic change flags", body = RepoCommitsResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "repo"
)]
pub async fn get_commits(
    State(_state): State<AppState>,
    Json(req): Json<RepoCommitsRequest>,
) -> Result<Json<RepoCommitsResponse>, (StatusCode, Json<ApiError>)> {
    let commits = git::get_all_commits(&req.repo).await.map_err(|e| {
        error!("Failed to get commits for {}: {}", req.repo, e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to fetch commits: {}",
                e
            ))),
        )
    })?;

    Ok(Json(RepoCommitsResponse {
        repo: req.repo,
        commits,
    }))
}

/// Get all .kicad_sch files at a specific commit
#[utoipa::path(
    post,
    path = "/api/repo/commit/files",
    request_body = CommitFilesRequest,
    responses(
        (status = 200, description = "List of schematic files at this commit", body = CommitFilesResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "repo"
)]
pub async fn get_commit_files(
    State(_state): State<AppState>,
    Json(req): Json<CommitFilesRequest>,
) -> Result<Json<CommitFilesResponse>, (StatusCode, Json<ApiError>)> {
    let files = git::get_schematic_files(&req.repo, &req.commit)
        .await
        .map_err(|e| {
            error!("Failed to get files for {}/{}: {}", req.repo, req.commit, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!("Failed to fetch files: {}", e))),
            )
        })?;

    Ok(Json(CommitFilesResponse {
        repo: req.repo,
        commit: req.commit,
        files,
    }))
}

/// Get summary information about a specific commit
#[utoipa::path(
    post,
    path = "/api/repo/commit/info",
    request_body = CommitInfoRequest,
    responses(
        (status = 200, description = "Commit information with AI-generated summary", body = CommitInfoResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "repo"
)]
pub async fn get_commit_info(
    State(state): State<AppState>,
    Json(req): Json<CommitInfoRequest>,
) -> Result<Json<CommitInfoResponse>, (StatusCode, Json<ApiError>)> {
    // Get git commit info
    let commit_info = git::get_commit_info(&req.repo, &req.commit)
        .await
        .map_err(|e| {
            error!(
                "Failed to get commit info for {}/{}: {}",
                req.repo, req.commit, e
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to fetch commit info: {}",
                    e
                ))),
            )
        })?;

    // Get changed files
    let changed_files = git::get_changed_schematic_files(&req.repo, &req.commit)
        .await
        .map_err(|e| {
            error!(
                "Failed to get changed files for {}/{}: {}",
                req.repo, req.commit, e
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to fetch changed files: {}",
                    e
                ))),
            )
        })?;

    // Try to get stored blurb/description from database
    let repo_url = format!("https://github.com/{}.git", req.repo);
    let stored = retrieve_schematic(&state, &repo_url, &req.commit)
        .await
        .ok()
        .flatten();

    let (blurb, description) = match stored {
        Some(s) => (s.blurb, s.description),
        None => (None, None),
    };

    Ok(Json(CommitInfoResponse {
        repo: req.repo,
        commit: req.commit,
        commit_date: commit_info.commit_date,
        message: commit_info.message,
        blurb,
        description,
        changed_files,
    }))
}

/// Initialize a repository by distilling its schematic files
///
/// This endpoint fetches the schematic files from the repository, runs the
/// Python distillation script to extract semantic information, and caches
/// the result in the database. Call this when a user first loads a repository.
#[utoipa::path(
    post,
    path = "/api/repo/init",
    request_body = RepoInitRequest,
    responses(
        (status = 200, description = "Repository initialized with distilled schematic data", body = RepoInitResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "repo"
)]
pub async fn init_repo(
    State(state): State<AppState>,
    Json(req): Json<RepoInitRequest>,
) -> Result<Json<RepoInitResponse>, (StatusCode, Json<ApiError>)> {
    info!("Initializing repo: {}", req.repo);

    // Get the commit hash - use provided or fetch latest
    let commit = match req.commit {
        Some(c) => c,
        None => git::get_latest_commit(&req.repo).await.map_err(|e| {
            error!("Failed to get latest commit for {}: {}", req.repo, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to fetch latest commit: {}",
                    e
                ))),
            )
        })?,
    };

    let repo_url = format!("https://github.com/{}.git", req.repo);

    // Check if we already have distilled data cached
    let cached_distilled = retrieve_distilled_json(&state, &repo_url, &commit)
        .await
        .ok()
        .flatten();

    let (distilled, cached, schematic_files) = if let Some(cached_json) = cached_distilled {
        info!("Using cached distilled data for {}/{}", req.repo, commit);

        // Get schematic file list for response
        let files = git::get_schematic_files(&req.repo, &commit)
            .await
            .map_err(|e| {
                error!("Failed to get schematic files: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiError::internal(format!(
                        "Failed to fetch schematic files: {}",
                        e
                    ))),
                )
            })?;

        let file_paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
        (cached_json, true, file_paths)
    } else {
        info!(
            "Distilling schematics for {}/{} (no cache)",
            req.repo, commit
        );

        // Get schematic files first
        let files = git::get_schematic_files(&req.repo, &commit)
            .await
            .map_err(|e| {
                error!("Failed to get schematic files: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiError::internal(format!(
                        "Failed to fetch schematic files: {}",
                        e
                    ))),
                )
            })?;

        let file_paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();

        if files.is_empty() {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ApiError::not_found(format!(
                    "No .kicad_sch files found in {}/{}",
                    req.repo, commit
                ))),
            ));
        }

        // Run distillation
        let distilled_json = distill::distill_repo_schematics(&req.repo, &commit)
            .await
            .map_err(|e| {
                error!("Distillation failed for {}/{}: {}", req.repo, commit, e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiError::internal(format!("Distillation failed: {}", e))),
                )
            })?;

        // Cache the result
        if let Err(e) = store_distilled_json(&state, &repo_url, &commit, &distilled_json).await {
            error!("Failed to cache distilled result: {}", e);
            // Continue anyway - we have the data
        } else {
            info!("Cached distilled result for {}/{}", req.repo, commit);
        }

        (distilled_json, false, file_paths)
    };

    // Extract counts from distilled data
    // Components can be a dict (from Python distiller) or an array
    let component_count = distilled
        .get("components")
        .map(|c| {
            if let Some(obj) = c.as_object() {
                obj.len()
            } else if let Some(arr) = c.as_array() {
                arr.len()
            } else {
                0
            }
        })
        .unwrap_or(0);

    let net_count = distilled
        .get("nets")
        .and_then(|n| n.as_object())
        .map(|obj| obj.len())
        .unwrap_or(0);

    info!(
        "Initialized {}/{}: {} components, {} nets, {} files",
        req.repo,
        &commit[..8.min(commit.len())],
        component_count,
        net_count,
        schematic_files.len()
    );

    Ok(Json(RepoInitResponse {
        repo: req.repo,
        commit,
        cached,
        component_count,
        net_count,
        schematic_files,
        distilled,
    }))
}

/// Clear cached distilled schematic data for a repository
///
/// This endpoint clears the cached distilled JSON for a repository,
/// forcing a re-distillation on the next init call.
#[utoipa::path(
    post,
    path = "/api/repo/clear-cache",
    request_body = RepoClearCacheRequest,
    responses(
        (status = 200, description = "Cache cleared successfully", body = RepoClearCacheResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "repo"
)]
pub async fn clear_cache(
    State(state): State<AppState>,
    Json(req): Json<RepoClearCacheRequest>,
) -> Result<Json<RepoClearCacheResponse>, (StatusCode, Json<ApiError>)> {
    info!(
        "Clearing cache for repo: {}, commit: {:?}",
        req.repo, req.commit
    );

    let repo_url = format!("https://github.com/{}.git", req.repo);

    let rows_affected =
        clear_distilled_json(&state, &repo_url, req.commit.as_deref())
            .await
            .map_err(|e| {
                error!("Failed to clear cache: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiError::internal(format!("Failed to clear cache: {}", e))),
                )
            })?;

    let message = if let Some(ref commit) = req.commit {
        format!(
            "Cleared cache for {}/{} ({} records)",
            req.repo, commit, rows_affected
        )
    } else {
        format!(
            "Cleared all cache for {} ({} records)",
            req.repo, rows_affected
        )
    };

    info!("{}", message);

    Ok(Json(RepoClearCacheResponse {
        repo: req.repo,
        cleared: rows_affected > 0,
        message,
    }))
}
