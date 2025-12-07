use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

// ============================================================================
// Repo Endpoint Types
// ============================================================================

#[derive(Debug, Deserialize, ToSchema)]
pub struct RepoCommitsRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CommitInfo {
    /// Full commit hash
    pub commit_hash: String,
    /// Timestamp of the commit
    pub commit_date: Option<DateTime<Utc>>,
    /// Commit message summary
    pub message: Option<String>,
    /// Whether this commit modified .kicad_sch files
    pub has_schematic_changes: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RepoCommitsResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// List of all commits (includes flag for schematic changes)
    pub commits: Vec<CommitInfo>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CommitFilesRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SchematicFile {
    /// File path relative to repository root
    pub path: String,
    /// Raw file content
    pub content: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CommitFilesResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// List of .kicad_sch files at this commit
    pub files: Vec<SchematicFile>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CommitInfoRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CommitInfoResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// Timestamp of the commit
    pub commit_date: Option<DateTime<Utc>>,
    /// Commit message summary
    pub message: Option<String>,
    /// Short AI-generated summary
    pub blurb: Option<String>,
    /// Detailed AI-generated description
    pub description: Option<String>,
    /// List of changed .kicad_sch file paths
    pub changed_files: Vec<String>,
}

// ============================================================================
// Hook Endpoint Types
// ============================================================================

#[derive(Debug, Serialize, ToSchema)]
pub struct HookUpdateResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Number of commits successfully processed
    pub processed: usize,
    /// List of errors encountered during processing
    pub errors: Vec<String>,
}

// ============================================================================
// Grok Endpoint Types
// ============================================================================

#[derive(Debug, Deserialize, ToSchema)]
pub struct GrokCommitSummaryRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GrokCommitSummaryResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// Short AI-generated summary
    pub summary: String,
    /// Detailed AI-generated analysis
    pub details: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct GrokSelectionSummaryRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// List of component IDs to analyze
    pub component_ids: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GrokSelectionSummaryResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Full commit hash
    pub commit: String,
    /// List of component IDs that were analyzed
    pub component_ids: Vec<String>,
    /// Short AI-generated summary
    pub summary: String,
    /// Detailed AI-generated analysis
    pub details: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct GrokRepoSummaryRequest {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GrokRepoSummaryResponse {
    /// GitHub repository in "owner/repo" format
    pub repo: String,
    /// Short AI-generated summary
    pub summary: String,
    /// Detailed AI-generated analysis
    pub details: String,
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiError {
    /// Error code
    pub error: String,
    /// Human-readable error message
    pub message: String,
}

impl ApiError {
    pub fn new(error: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("not_found", message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal_error", message)
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new("bad_request", message)
    }
}
