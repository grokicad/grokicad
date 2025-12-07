#!/bin/bash

set -e

echo "Testing database..."

# Check if container is running
if ! docker-compose ps | grep -q "Up"; then
    echo "Error: Database container is not running. Run database-up.sh first."
    exit 1
fi

echo "Container is running."

# Test connection and tables
docker-compose exec -T db psql -U kicad -d kicad -c "
SELECT 'Connection OK' as status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
"

# Check if tables exist
TABLES=$(docker-compose exec -T db psql -U kicad -d kicad -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('schematics', 'parts');" | xargs)

if [ "$TABLES" != "2" ]; then
    echo "Error: Expected 2 tables (schematics, parts), found $TABLES"
    exit 1
fi

echo "Tables exist."

# Basic insert/retrieve test
docker-compose exec -T db psql -U kicad -d kicad -c "
INSERT INTO schematics (repo_url, commit_hash, change_summary, project_overview) 
VALUES ('test-repo', 'test-commit', 'test summary', 'test overview') 
RETURNING id;
"

SCHEMATIC_ID=$(docker-compose exec -T db psql -U kicad -d kicad -t -c "
SELECT id FROM schematics WHERE commit_hash = 'test-commit' ORDER BY id DESC LIMIT 1;
" | xargs)

if [ -z "$SCHEMATIC_ID" ]; then
    echo "Error: Failed to insert schematic"
    exit 1
fi

echo "Inserted schematic with id: $SCHEMATIC_ID"

# Insert part
docker-compose exec -T db psql -U kicad -d kicad -c "
INSERT INTO parts (schematic_id, part_uuid, blurb) 
VALUES ($SCHEMATIC_ID, 'test-part-uuid', 'test blurb');
"

# Check retrieve
COUNT=$(docker-compose exec -T db psql -U kicad -d kicad -t -c "SELECT count(*) FROM parts WHERE schematic_id = $SCHEMATIC_ID;" | xargs)

if [ "$COUNT" != "1" ]; then
    echo "Error: Expected 1 part, found $COUNT"
    exit 1
fi

echo "Basic insert/retrieve test passed."

# Cleanup test data
docker-compose exec -T db psql -U kicad -d kicad -c "
DELETE FROM parts WHERE schematic_id = $SCHEMATIC_ID;
DELETE FROM schematics WHERE id = $SCHEMATIC_ID;
"

echo "Test suite completed successfully. Database is running and all keys (tables) exist."
