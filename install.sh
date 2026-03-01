#!/bin/bash
# ClawControl — First-time setup
# Usage: ./install.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🦞 ClawControl Setup"
echo "====================="

# Check prerequisites
echo ""
echo "Checking prerequisites..."

# Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org/"
    exit 1
fi
echo "  ✅ Node.js $(node --version)"

# Python 3.10+
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found."
    exit 1
fi
PYVER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "  ✅ Python $PYVER"

# Create data directory
echo ""
echo "Setting up data directory..."
mkdir -p "${OPENCLAW_HOME:-$HOME/.openclaw}/clawcontrol"
echo "  ✅ Data directory ready"

# Backend setup
echo ""
echo "Setting up backend..."
cd backend

# Create venv if it doesn't exist
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo "  ✅ Virtual environment created"
else
    echo "  ✅ Virtual environment exists"
fi

source .venv/bin/activate
pip install -q -r requirements.txt
echo "  ✅ Python dependencies installed"

# Create .env from example if not exists
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  ✅ Created .env from .env.example (edit as needed)"
else
    echo "  ✅ .env already exists"
fi

# Run migrations (creates SQLite database + tables)
alembic upgrade head
echo "  ✅ Database migrations applied"

cd ..

# Frontend setup
echo ""
echo "Setting up frontend..."
cd ui

npm install --silent
echo "  ✅ Node dependencies installed"

# Create .env from example if not exists
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  ✅ Created .env from .env.example"
else
    echo "  ✅ .env already exists"
fi

cd ..

echo ""
echo "====================="
echo "✅ ClawControl is ready!"
echo ""
echo "To start:"
echo "  ./start.sh"
echo ""
echo "Then open http://localhost:5174"
echo ""
echo "Optional: Customise your agents in config/agents.yaml"
