use anyhow::{Context, Result};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;
use tracing::{error, info};

use crate::services::git;
use crate::types::SchematicFile;

/// Get the path to the schematic-distiller directory.
///
/// Tries multiple strategies in order:
/// 1. CARGO_MANIFEST_DIR (set during cargo build/run)
/// 2. DISTILLER_PATH environment variable
/// 3. Relative to current executable
/// 4. Relative to current working directory
/// 5. Parent of current working directory (if running from backend/)
fn get_distiller_path() -> PathBuf {
    // Try CARGO_MANIFEST_DIR first (set during cargo build/run)
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let path = PathBuf::from(manifest_dir)
            .parent()
            .map(|p| p.join("schematic-distiller"))
            .unwrap_or_else(|| PathBuf::from("schematic-distiller"));
        if path.exists() {
            return path;
        }
    }

    // Try DISTILLER_PATH env var (can be set explicitly)
    if let Ok(distiller_path) = std::env::var("DISTILLER_PATH") {
        let path = PathBuf::from(distiller_path);
        if path.exists() {
            return path;
        }
    }

    // Try relative to current executable
    if let Ok(exe_path) = std::env::current_exe() {
        // Executable might be in target/debug or target/release
        let path = exe_path
            .parent() // binary location
            .and_then(|p| p.parent()) // target
            .and_then(|p| p.parent()) // backend
            .and_then(|p| p.parent()) // grokicad
            .map(|p| p.join("schematic-distiller"));
        if let Some(ref path) = path {
            if path.exists() {
                return path.clone();
            }
        }
    }

    // Try relative to current working directory
    if let Ok(cwd) = std::env::current_dir() {
        let cwd_path = cwd.join("schematic-distiller");
        if cwd_path.exists() {
            return cwd_path;
        }

        // Try parent of cwd (if running from backend/)
        if let Some(parent) = cwd.parent() {
            let parent_path = parent.join("schematic-distiller");
            if parent_path.exists() {
                return parent_path;
            }
        }
    }

    // Fallback - return the relative path and let it fail with a clear error
    PathBuf::from("schematic-distiller")
}

/// Get the path to the Python executable in the venv.
fn get_python_path() -> PathBuf {
    get_distiller_path()
        .join(".venv")
        .join("bin")
        .join("python")
}

/// Get the path to the distill_demo.py script.
fn get_distill_script_path() -> PathBuf {
    get_distiller_path()
        .join("examples")
        .join("distill")
        .join("distill_demo.py")
}

/// Run the distill_demo.py script on a directory and return the JSON output.
async fn run_distill_script(directory: &Path) -> Result<Value> {
    let python_path = get_python_path();
    let script_path = get_distill_script_path();

    info!(
        "Running distill script: {:?} {:?} --dir {:?}",
        python_path, script_path, directory
    );

    if !python_path.exists() {
        anyhow::bail!(
            "Python venv not found at {:?}. Run setup_venv.sh first.",
            python_path
        );
    }

    if !script_path.exists() {
        anyhow::bail!("Distill script not found at {:?}", script_path);
    }

    let output = Command::new(&python_path)
        .arg(&script_path)
        .arg("--dir")
        .arg(directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .context("Failed to execute distill script")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("Distill script failed: {}", stderr);
        anyhow::bail!("Distill script failed: {}", stderr);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).context("Failed to parse distill script output as JSON")
}

/// Write schematic files to a temporary directory, preserving directory structure.
async fn write_schematic_files_to_temp(
    files: &[SchematicFile],
    repo_slug: &str,
    commit_hash: &str,
) -> Result<PathBuf> {
    let temp_dir = std::env::temp_dir()
        .join("kicad-distill")
        .join(repo_slug.replace('/', "-"))
        .join(commit_hash);

    // Clean up any existing temp dir for this repo/commit
    if temp_dir.exists() {
        tokio::fs::remove_dir_all(&temp_dir)
            .await
            .context("Failed to clean up existing temp directory")?;
    }

    tokio::fs::create_dir_all(&temp_dir)
        .await
        .context("Failed to create temp directory")?;

    for file in files {
        let file_path = temp_dir.join(&file.path);

        // Create parent directories if needed
        if let Some(parent) = file_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .context("Failed to create parent directories")?;
        }

        tokio::fs::write(&file_path, &file.content)
            .await
            .with_context(|| format!("Failed to write schematic file: {}", file.path))?;

        info!("Wrote schematic file: {:?}", file_path);
    }

    Ok(temp_dir)
}

/// Distill all schematic files from a repo at a specific commit.
///
/// Fetches schematic files from the repository, writes them to a temp directory,
/// runs the Python distill script, and returns the JSON output.
pub async fn distill_repo_schematics(repo_slug: &str, commit_hash: &str) -> Result<Value> {
    info!("Distilling schematics for {}/{}", repo_slug, commit_hash);

    let files = git::get_schematic_files(repo_slug, commit_hash)
        .await
        .context("Failed to fetch schematic files from repo")?;

    if files.is_empty() {
        anyhow::bail!(
            "No .kicad_sch files found in repo {} at commit {}",
            repo_slug,
            commit_hash
        );
    }

    info!("Found {} schematic file(s) to distill", files.len());

    let temp_dir = write_schematic_files_to_temp(&files, repo_slug, commit_hash)
        .await
        .context("Failed to write schematic files to temp directory")?;

    let distilled = run_distill_script(&temp_dir).await?;

    info!(
        "Distillation complete for {}/{}: {} file(s) processed",
        repo_slug,
        commit_hash,
        files.len()
    );

    Ok(distilled)
}
