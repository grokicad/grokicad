use axum::{routing::post, Router};
use std::sync::Arc;

use crate::controllers::repo::{get_commit_files, get_commit_info, get_commits, AppState};

pub fn router() -> Router<Arc<sqlx::PgPool>> {
    Router::new()
        .route("/commits", post(get_commits))
        .route("/commit/files", post(get_commit_files))
        .route("/commit/info", post(get_commit_info))
}
