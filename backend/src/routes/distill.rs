use axum::{routing::post, Router};
use std::sync::Arc;

use crate::controllers::distill::distill_schematics;

pub fn router() -> Router<Arc<sqlx::PgPool>> {
    Router::new().route("/", post(distill_schematics))
}
