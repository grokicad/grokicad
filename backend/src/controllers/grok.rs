use axum::{
    extract::State,
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        Json,
    },
};
use futures_util::{stream::Stream, StreamExt};
use std::{convert::Infallible, sync::Arc, time::Duration};
use tracing::{error, info};

use crate::services::git;
use crate::types::{
    ApiError, GrokCommitSummaryRequest, GrokCommitSummaryResponse, GrokRepoSummaryRequest,
    GrokRepoSummaryResponse, GrokSelectionSummaryRequest, GrokSelectionSummaryResponse,
};
// use kicad_db::PgPool;
use kicad_db::{
    utilities::load_environment_file::load_environment_file,
    xai_client::{InputMessage, ResponsesRequest, Tool, XaiClient},
    PgPool,
};

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

    // Load environment file to get XAI_API_KEY
    load_environment_file(None).map_err(|e| {
        error!("Failed to load environment file: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!("Failed to load environment: {}", e))),
        )
    })?;

    // Create XAI client
    let xai_client = XaiClient::new().map_err(|e| {
        error!("Failed to create XAI client: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!("Failed to initialize XAI client: {}", e))),
        )
    })?;

    // Construct GitHub commit URL
    let github_url = format!("https://github.com/{}/commit/{}", req.repo, req.commit);
    
    // Create user message with GitHub URL
    let user_message = format!(
        "Search online for the changes in the commit {} and summarize the changes",
        github_url
    );


    // Create input message for responses API
    let input = vec![InputMessage::user(user_message)];

    // Create tools - use both web_search and x_search for comprehensive results
    let tools = vec![Tool::web_search(), Tool::x_search()];

    // Create responses request with hardcoded model
    let responses_request = ResponsesRequest::new(
        "grok-4-1-fast".to_string(),
        input,
        tools,
    );

    // Make API call using responses endpoint
    let api_response = xai_client.responses(&responses_request).await.map_err(|e| {
        error!("XAI API call failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!("Failed to get AI summary: {}", e))),
        )
    })?;


    // TODO: Implement this or not.
    // Get changed files for context
    // let changed_files = git::get_changed_schematic_files(&req.repo, &req.commit)
    //     .await
    //     .map_err(|e| {
    //         (
    //             StatusCode::INTERNAL_SERVER_ERROR,
    //             Json(ApiError::internal(format!(
    //                 "Failed to fetch changed files: {}",
    //                 e
    //             ))),
    //         )
    //     })?;


    // Extract response content from tool results
    // The responses API returns tool call results, so we need to extract meaningful information
    let summary = if let Some(output) = &api_response.output {
        // Try to extract text from tool results
        let mut result_parts = Vec::new();
        
        for item in output {
            if let Some(name) = &item.name {
                result_parts.push(format!("Tool: {}", name));
            }
            if let Some(status) = &item.status {
                result_parts.push(format!("Status: {}", status));
            }
            if let Some(result) = &item.result {
                result_parts.push(format!("Result: {}", serde_json::to_string(result).unwrap_or_else(|_| "N/A".to_string())));
            }
            if let Some(content) = &item.content {
                result_parts.push(format!("Content: {}", serde_json::to_string(content).unwrap_or_else(|_| "N/A".to_string())));
            }
        }
        
        if result_parts.is_empty() {
            format!(
                "Found {} tool result(s) for commit {}/{}",
                output.len(),
                req.repo,
                req.commit
            )
        } else {
            result_parts.join("\n")
        }
    } else {
        format!(
            "No results returned for commit {}/{}",
            req.repo,
            req.commit
        )
    };

    // For details, include more information about the response
    let details = format!(
        "Response ID: {:?}\nModel: {:?}\nTool Results: {}\n\n{}",
        api_response.id,
        api_response.model,
        api_response.output.as_ref().map(|o| o.len()).unwrap_or(0),
        summary
    );

    info!(
        "Successfully generated summary for {}/{}",
        req.repo, req.commit
    );


    // Mock response - TODO: integrate with actual Grok API
    // let summary = format!(
    //     "[MOCK] This commit modified {} schematic file(s) in the {} repository.",
    //     changed_files.len(),
    //     req.repo
    // );

    // let details = format!(
    //     "[MOCK] Detailed analysis of commit {}:\n\n\
    //     Changed files:\n{}\n\n\
    //     This is a placeholder response. In production, this would contain \
    //     AI-generated insights about the schematic changes, including:\n\
    //     - Component additions/removals\n\
    //     - Net connectivity changes\n\
    //     - Design rule modifications\n\
    //     - Potential impact on board layout",
    //     req.commit,
    //     changed_files
    //         .iter()
    //         .map(|f| format!("  - {}", f))
    //         .collect::<Vec<_>>()
    //         .join("\n")
    // );

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

/// Stream an AI chat response using Server-Sent Events
#[utoipa::path(
    get,
    path = "/api/grok/chat/stream",
    responses(
        (status = 200, description = "Streaming AI chat response via SSE"),
        (status = 500, description = "Internal server error", body = ApiError)
    ),
    tag = "grok"
)]
pub async fn chat_stream(
    State(_state): State<AppState>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, Json<ApiError>)> {
    info!("Grok chat_stream called");

    // Load environment file to get XAI_API_KEY
    load_environment_file(None).map_err(|e| {
        error!("Failed to load environment file: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to load environment: {}",
                e
            ))),
        )
    })?;

    // Create XAI client
    let xai_client = XaiClient::new().map_err(|e| {
        error!("Failed to create XAI client: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError::internal(format!(
                "Failed to initialize XAI client: {}",
                e
            ))),
        )
    })?;

    // TODO: Accept messages from request body. Currently using static prompts for testing.
    // This endpoint should be converted to POST with a request body containing the user's
    // selection context and question. For now, we use a hardcoded prompt to verify streaming works.
    let messages = vec![
        Message::system(
            "You are Grok, an expert AI assistant specialized in electronics and PCB design. \
            You help users understand KiCad schematics, components, and circuit design. \
            Be concise but informative. Use technical terms when appropriate.".to_string()
        ),
        Message::user(
            "Give me a brief overview of what to look for when reviewing a KiCad schematic for an embedded system.".to_string()
        ),
    ];

    // Create chat completion request with streaming
    let chat_request = ChatCompletionRequest::with_stream(messages, "grok-3-fast".to_string(), true);

    // Get the stream
    let stream = xai_client
        .chat_completion_stream(&chat_request)
        .await
        .map_err(|e| {
            error!("Failed to create XAI stream: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError::internal(format!(
                    "Failed to start AI stream: {}",
                    e
                ))),
            )
        })?;

    // Convert the stream to SSE events
    let sse_stream = async_stream::stream! {
        tokio::pin!(stream);

        while let Some(result) = stream.next().await {
            match result {
                Ok(content) => {
                    yield Ok(Event::default().data(content));
                }
                Err(e) => {
                    error!("Stream error: {}", e);
                    yield Ok(Event::default().data(format!("[ERROR: {}]", e)));
                    break;
                }
            }
        }

        // Send a done event
        yield Ok(Event::default().data("[DONE]"));
    };

    Ok(Sse::new(sse_stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    ))
}
