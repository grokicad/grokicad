use kicad_db::{create_pool, store_schematic, retrieve_schematic};
use uuid::Uuid;
use std::collections::HashMap;
use serde_json::json;


// Note: Run with DB container up (database-up.sh)
// cargo test --test integration

#[tokio::test]
async fn test_store_and_retrieve() -> Result<(), Box<dyn std::error::Error>> {
    let pool = match create_pool().await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Warning: Could not connect to DB ({}). Skipping integration test. Run `./database-up.sh` first.", e);
            return Ok(());
        }
    };

    let test_repo = "test://repo";
    let test_commit = "test-commit";
    let mut parts = HashMap::new();
    let test_uuid = Uuid::new_v4();
    parts.insert(
        test_uuid,
        (Some("test blurb".to_string()), json!({"test": "prop"}))
    );

    // Store
    let _id = store_schematic(
        &pool,
        test_repo,
        test_commit,
        Some(b"test image bytes".to_vec()),
        Some("test summary"),
        Some("test overview"),
        parts.clone(),
    ).await?;

    // Retrieve
    let retrieved = retrieve_schematic(&pool, test_repo, test_commit).await?;
    assert!(retrieved.is_some());

    let sch = retrieved.unwrap();
    assert_eq!(sch.repo_url, test_repo);
    assert_eq!(sch.commit_hash, test_commit);
    assert_eq!(sch.schematic_image, Some(b"test image bytes".to_vec()));
    assert_eq!(sch.parts.len(), 1);
    let part = sch.parts.get(&test_uuid).unwrap();
    assert_eq!(part.blurb, Some("test blurb".to_string()));

    // Cleanup (optional for test)
    sqlx::query("DELETE FROM parts WHERE schematic_id IN (SELECT id FROM schematics WHERE commit_hash = $1)")
        .bind(test_commit)
        .execute(&pool)
        .await?;
    sqlx::query("DELETE FROM schematics WHERE commit_hash = $1")
        .bind(test_commit)
        .execute(&pool)
        .await?;

    Ok(())
}

// Add more integration tests as needed