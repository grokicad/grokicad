use utoipa::OpenApi;

use crate::controllers::{digikey, distill, grok, hook, repo};
use crate::types::{
    ApiError, CommitFilesRequest, CommitFilesResponse, CommitInfo, CommitInfoRequest,
    CommitInfoResponse, DigiKeyParameter, DigiKeyPartInfo, DigiKeySearchRequest,
    DigiKeySearchResponse, DistillRequest, DistillResponse, GrokCommitSummaryRequest,
    GrokCommitSummaryResponse, GrokRepoSummaryRequest, GrokRepoSummaryResponse,
    GrokSelectionStreamRequest, GrokSelectionSummaryRequest, GrokSelectionSummaryResponse,
    HookUpdateResponse, RepoCommitsRequest, RepoCommitsResponse, SchematicFile,
};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "KiCAD Watch API",
        version = "1.0.0",
        description = "API for tracking and analyzing KiCAD schematic changes in GitHub repositories"
    ),
    paths(
        repo::get_commits,
        repo::get_commit_files,
        repo::get_commit_info,
        hook::update_repo,
        hook::refresh_repo,
        hook::github_webhook,
        grok::summarize_commit,
        grok::summarize_selection,
        grok::summarize_repo,
        grok::chat_stream,
        grok::selection_stream,
        distill::distill_schematics,
        digikey::search_parts,
        digikey::get_status,
    ),
    components(schemas(
        RepoCommitsRequest,
        RepoCommitsResponse,
        CommitInfo,
        CommitFilesRequest,
        CommitFilesResponse,
        SchematicFile,
        CommitInfoRequest,
        CommitInfoResponse,
        HookUpdateResponse,
        GrokCommitSummaryRequest,
        GrokCommitSummaryResponse,
        GrokSelectionStreamRequest,
        GrokSelectionSummaryRequest,
        GrokSelectionSummaryResponse,
        GrokRepoSummaryRequest,
        GrokRepoSummaryResponse,
        DistillRequest,
        DistillResponse,
        DigiKeySearchRequest,
        DigiKeySearchResponse,
        DigiKeyPartInfo,
        DigiKeyParameter,
        ApiError,
    )),
    tags(
        (name = "repo", description = "Repository and commit information endpoints"),
        (name = "hook", description = "Webhook endpoints for triggering updates"),
        (name = "grok", description = "AI-powered analysis endpoints"),
        (name = "distill", description = "Schematic distillation endpoints"),
        (name = "digikey", description = "DigiKey part lookup endpoints")
    )
)]
pub struct ApiDoc;
