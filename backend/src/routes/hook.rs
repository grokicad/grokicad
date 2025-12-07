use axum::{routing::post, Router};
use std::sync::Arc;

use crate::controllers::hook::{update_repo, AppState};

pub fn router() -> Router<Arc<sqlx::PgPool>> {
    Router::new().route("/update/*repo", post(update_repo))
}
