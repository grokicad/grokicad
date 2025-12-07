use axum::{extract::State, http::StatusCode, response::Json};
use std::sync::Arc;
use tracing::error;

use crate::services::git;
use crate::types::{
    ApiError, CommitFilesRequest, CommitFilesResponse, CommitInfoRequest, CommitInfoResponse,
    RepoCommitsRequest, RepoCommitsResponse,
};
use kicad_db::{retrieve_schematic, PgPool};

pub type AppState = Arc<PgPool>;

/// Get all commits that modified .kicad_sch files
#[utoipa::path(
    post,
    path = "/api/repo/commits",
    request_body = RepoCommitsRequest,
    responses(
        (status = 200, description = "List of commits with schematic changes", body = RepoCommitsResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "repo"
)]
pub async fn get_commits(
    State(_state): State<AppState>,
    Json(req): Json<RepoCommitsRequest>,
) -> Result<Json<RepoCommitsResponse>, (StatusCode, Json<ApiError>)> {
    let commits = git::get_schematic_commits(&req.repo).await.map_err(|e| {
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
