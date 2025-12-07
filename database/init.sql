CREATE TABLE IF NOT EXISTS schematics (
    id SERIAL PRIMARY KEY,
    repo_url TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    commit_date TIMESTAMPTZ,
    git_message TEXT,
    UNIQUE(repo_url, commit_hash),
    schematic_image BYTEA,
    change_summary TEXT,
    project_overview TEXT,
    blurb TEXT,
    description TEXT,
    distilled_json JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parts (
    id SERIAL PRIMARY KEY,
    schematic_id INTEGER REFERENCES schematics(id) ON DELETE CASCADE,
    part_uuid TEXT NOT NULL,
    blurb TEXT,
    properties JSONB DEFAULT '{}',
    UNIQUE(schematic_id, part_uuid)
);
