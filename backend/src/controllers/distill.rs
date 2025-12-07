use axum::{extract::State, http::StatusCode, response::Json};
use std::sync::Arc;
use tracing::{error, info};

use crate::services::distill;
use crate::types::{ApiError, DistillRequest, DistillResponse};
use kicad_db::{retrieve_distilled_json, store_distilled_json, PgPool};

pub type AppState = Arc<PgPool>;

/// Distill schematic files from a repository at a specific commit
#[utoipa::path(
    post,
    path = "/api/distill",
    request_body = DistillRequest,
    responses(
        (status = 200, description = "Distilled schematic data", body = DistillResponse),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "distill"
)]
pub async fn distill_schematics(
    State(state): State<AppState>,
    Json(req): Json<DistillRequest>,
) -> Result<Json<DistillResponse>, (StatusCode, Json<ApiError>)> {
    info!("Distill request for {}/{}", req.repo, req.commit);

    let repo_url = format!("https://github.com/{}.git", req.repo);

    // Check cache first
    match retrieve_distilled_json(&state, &repo_url, &req.commit).await {
        Ok(Some(cached_json)) => {
            info!("Cache hit for {}/{}", req.repo, req.commit);
            return Ok(Json(DistillResponse {
                repo: req.repo,
                commit: req.commit,
                cached: true,
                distilled: cached_json,
            }));
        }
        Ok(None) => {
            info!(
                "Cache miss for {}/{}, running distillation",
                req.repo, req.commit
            );
        }
        Err(e) => {
            // Log but continue - we can still try to distill
            error!("Failed to check cache: {}", e);
        }
    }

    // Run distillation
    let distilled = distill::distill_repo_schematics(&req.repo, &req.commit)
        .await
        .map_err(|e| {
            error!("Distillation failed for {}/{}: {}", req.repo, req.commit, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!("Distillation failed: {}", e))),
            )
        })?;

    // Store in cache
    if let Err(e) = store_distilled_json(&state, &repo_url, &req.commit, &distilled).await {
        // Log but don't fail - we still have the result
        error!("Failed to cache distilled result: {}", e);
    } else {
        info!("Cached distilled result for {}/{}", req.repo, req.commit);
    }

    Ok(Json(DistillResponse {
        repo: req.repo,
        commit: req.commit,
        cached: false,
        distilled,
    }))
}
