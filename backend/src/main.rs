use anyhow::Context;
use axum::Router;
use sqlx::PgPool;
use std::sync::Arc;
use tracing::info;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

mod controllers;
mod openapi;
mod routes;
mod services;
mod types;

use openapi::ApiDoc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().init();

    let pool = kicad_db::create_pool()
        .await
        .context("Failed to create database pool")?;

    let app_state = Arc::new(pool);

    let app = Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .nest("/api/repo", routes::repo::router())
        .nest("/api/hook", routes::hook::router())
        .nest("/api/grok", routes::grok::router())
        .nest("/api/distill", routes::distill::router())
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(app_state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:443").await?;
    info!("Server listening on 0.0.0.0:443");
    info!("Swagger UI available at http://localhost:443/swagger-ui/");

    axum::serve(listener, app).await?;

    Ok(())
}
