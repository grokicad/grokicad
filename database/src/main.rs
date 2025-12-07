use kicad_db::{create_pool, retrieve_schematic, find_schematics_by_part};
use uuid::Uuid;

use tokio;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = create_pool().await?;

    // Example store (commented; run with DB up)
    /*
    let mut parts = HashMap::new();
    parts.insert(
        Uuid::parse_str("00000000-0000-0000-0000-00005e6bfc95")?,
        (Some("Main MCU".to_string()), json!({"reference": "U6", "value": "ESP32"}))
    );
    let id = store_schematic(
        &pool,
        "https://github.com/evanhekman/hackathon.git",
        "main",
        None,  // image bytes
        Some("Initial commit"),
        Some("Smartwatch project"),
        parts,
    ).await?;
    println!("Stored with id: {}", id);
    */

    // Example retrieve
    if let Some(sch) = retrieve_schematic(&pool, "https://github.com/evanhekman/hackathon.git", "main").await? {
        println!("Retrieved: {:?} parts: {}", sch.commit_hash, sch.parts.len());
    } else {
        println!("No schematic found");
    }

    // Example query by part
    let part_uuid = Uuid::parse_str("00000000-0000-0000-0000-00005e6bfc95")?;
    let commits = find_schematics_by_part(&pool, part_uuid).await?;
    println!("Schematics with part: {:?}", commits);

    Ok(())
}