# KiCAD Schematic Database

This directory contains a PostgreSQL database setup in a Docker container to store KiCAD schematic information per Git commit.

## Setup

1. Make scripts executable:
   ```bash
   chmod +x *.sh
   ```

2. Start the database:
   ```bash
   ./database-up.sh
   ```
   This will start the container. If already running, confirm to refresh (recreate).

3. Create new DB (removes data):
   ```bash
   ./database-create.sh
   ```

4. Stop database:
   ```bash
   ./database-down.sh
   ```

5. Test database:
   ```bash
   ./database-test.sh
   ```
   Checks container running, tables exist, basic CRUD.

## Rust Functionality

This is now a Rust library crate `kicad-db` for DB interactions (using sqlx for Postgres).

- **Idiomatic Representations**: See `src/lib.rs` for structs like `Schematic`, `Part`, `FullSchematic` (Derive Serialize/Deserialize, sqlx::FromRow; use UUID for parts from KiCAD).

1. Build & Run:
   ```bash
   cd database
   cargo build
   cargo run  # Example binary (requires DB up via database-up.sh)
   ```

2. Tests:
   - Unit: `cargo test` (passes without DB; e.g., serde/UUID validation).
   - Integration: `cargo test --test integration` (requires `./database-up.sh` first; skips gracefully if DB unreachable, tests full CRUD/query by commit hash; cleans up data).

3. Usage Example (lib functions; add to your Cargo.toml: `kicad-db = { path = "path/to/database" }`):
   ```rust
   use kicad_db::{create_pool, store_schematic, retrieve_schematic, find_schematics_by_part, FullSchematic};
   use uuid::Uuid;
   use std::collections::HashMap;
   use serde_json::json;
   use tokio;

   #[tokio::main]
   async fn main() -> Result<(), Box<dyn std::error::Error>> {
       let pool = create_pool().await?;
       let mut parts = HashMap::new();
       let pu = Uuid::parse_str("00000000-0000-0000-0000-00005e6bfc95")?;  // Example KiCAD UUID
       parts.insert(pu, (Some("ESP32 MCU blurb".to_string()), json!({"reference": "U6", "lib_id": "RF_Module:ESP32-WROOM-32"})));
       let id = store_schematic(&pool, "https://github.com/evanhekman/hackathon.git", "abc123", Some(b"png bytes...".to_vec()), Some("commit changes"), Some("project overview"), parts).await?;
       println!("Stored ID: {}", id);

       if let Some(sch: FullSchematic) = retrieve_schematic(&pool, "https://github.com/evanhekman/hackathon.git", "abc123").await? {
           println!("Retrieved {} parts for commit {}", sch.parts.len(), sch.commit_hash);
       }

       // Query by part UUID (cross-commits)
       let commits = find_schematics_by_part(&pool, pu).await?;
       println!("Commits with part: {:?}", commits);

       Ok(())
   }
   ```

- **Functions**:
  - `store_schematic(...) -> Result<i32>`: Upserts schematic + parts (by repo+commit UUID).
  - `retrieve_schematic(repo, commit) -> Option<FullSchematic>`: Fetches all data.
  - `find_schematics_by_part(part_uuid) -> Vec<(repo, commit)>`: Query commits containing part.
  - `create_pool() -> PgPool`: Connection pool (hardcoded URL; customize via env).

For full integration tests later: Extend `tests/integration.rs` (e.g., query tests, error handling). Use `testcontainers` crate for DB-in-container tests if needed (add to dev-deps).

## DB Model

- **schematics**: repo_url, commit_hash (unique), schematic_image (BYTEA), change_summary, project_overview
- **parts**: linked to schematic_id, part_uuid (from KiCAD symbol uuid), blurb, properties (JSONB)

Part UUIDs are the (uuid ...) fields in KiCAD .kicad_sch symbol instances.

## Notes

- Password is 'password' - change in docker-compose.yml and db.py if needed.
- To populate, you'll need to parse .kicad_sch for parts, generate image (using KiCAD tools), generate summaries (e.g., via LLM).
- For production, secure passwords, use env vars.