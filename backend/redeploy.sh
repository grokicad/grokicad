#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Backend Redeploy Script ===${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DISTILLER_DIR="$PROJECT_ROOT/schematic-distiller"

cd "$PROJECT_ROOT"

# Step 1: Pull latest changes
echo -e "\n${GREEN}[1/5] Pulling latest changes...${NC}"
git pull

# Step 2: Setup schematic-distiller Python venv
echo -e "\n${GREEN}[2/5] Setting up schematic-distiller Python environment...${NC}"
if [ ! -f "$DISTILLER_DIR/.venv/bin/python" ]; then
    echo "Creating Python virtual environment..."
    cd "$DISTILLER_DIR"
    python3.11 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -e .
    deactivate
    echo "Python venv created and dependencies installed."
else
    echo "Python venv already exists."
    # Check if we need to update dependencies (if pyproject.toml changed)
    if [ "$DISTILLER_DIR/pyproject.toml" -nt "$DISTILLER_DIR/.venv/bin/pip" ]; then
        echo "pyproject.toml changed, updating dependencies..."
        cd "$DISTILLER_DIR"
        source .venv/bin/activate
        pip install -e .
        deactivate
    fi
fi
cd "$PROJECT_ROOT"

# Step 3: Stop existing backend process
echo -e "\n${GREEN}[3/5] Stopping existing backend...${NC}"
# Find and kill any process running kicad-backend
if pgrep -f "kicad-backend" > /dev/null; then
    echo "Found running kicad-backend process(es), stopping..."
    pkill -f "kicad-backend" || true
    sleep 2
    # Force kill if still running
    if pgrep -f "kicad-backend" > /dev/null; then
        echo "Force killing..."
        pkill -9 -f "kicad-backend" || true
        sleep 1
    fi
    echo "Backend stopped."
else
    echo "No existing backend process found."
fi

# Step 4: Build the backend
echo -e "\n${GREEN}[4/5] Building backend (release mode)...${NC}"
cd "$SCRIPT_DIR"
cargo build --release

# Step 5: Start the backend
echo -e "\n${GREEN}[5/5] Starting backend...${NC}"
nohup ./target/release/kicad-backend > nohup.out 2>&1 &
NEW_PID=$!
sleep 2

# Verify it's running
if ps -p $NEW_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend started successfully (PID: $NEW_PID)${NC}"
    echo -e "  Logs: ${SCRIPT_DIR}/nohup.out"
    echo -e "  Port: ${PORT:-8080}"
else
    echo -e "${RED}✗ Backend failed to start. Check nohup.out for errors:${NC}"
    tail -20 nohup.out
    exit 1
fi

echo -e "\n${GREEN}=== Redeploy Complete ===${NC}"
