#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "Setting up Python virtual environment for schematic-distiller..."

if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed or not in PATH"
    exit 1
fi

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
else
    echo "Virtual environment already exists at $VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing kicad-sch-api package..."
pip install -e "$SCRIPT_DIR"

echo "Verifying installation..."
python -c "import kicad_sch_api; print(\"kicad-sch-api installed successfully\")"

echo ""
echo "Setup complete!"
echo "Virtual environment: $VENV_DIR"
echo "Python executable: $VENV_DIR/bin/python"
