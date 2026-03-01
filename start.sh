#!/bin/bash
# ClawControl - Startup Script
# Starts backend (port 8088) and UI dev server (port 5174)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT=8088
UI_PORT=5177

echo "🚀 ClawControl Startup"
echo "=========================="

# Pre-flight checks
if [ ! -d "$SCRIPT_DIR/backend/.venv" ]; then
    echo "❌ Backend virtual environment not found."
    echo "   Run ./install.sh first."
    exit 1
fi

# Check ports are free
if lsof -ti:$BACKEND_PORT > /dev/null 2>&1; then
    echo "❌ Port $BACKEND_PORT is already in use."
    echo "   Stop the existing process or choose a different port."
    exit 1
fi
if lsof -ti:$UI_PORT > /dev/null 2>&1; then
    echo "❌ Port $UI_PORT is already in use."
    echo "   Stop the existing process or choose a different port."
    exit 1
fi

# Start backend
echo "Starting backend on port $BACKEND_PORT..."
cd "$SCRIPT_DIR/backend"
# source .venv/bin/activate
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo "  Waiting for backend..."
for i in {1..10}; do
  if curl -s "http://localhost:$BACKEND_PORT/api/health" > /dev/null 2>&1; then
    echo "  Backend ready ✅"
    break
  fi
  sleep 1
done

# Start UI
echo "Starting UI on port $UI_PORT..."
cd "$SCRIPT_DIR/ui"
npx vite --host 0.0.0.0 --port $UI_PORT &
UI_PID=$!
echo "  UI PID: $UI_PID"

echo ""
echo "=========================="
echo "✅ ClawControl running!"
echo "   Backend: http://localhost:$BACKEND_PORT"
echo "   UI:      http://localhost:$UI_PORT"
echo ""
echo "Press Ctrl+C to stop both."

# Trap Ctrl+C to kill both processes
trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $UI_PID 2>/dev/null; exit 0" INT TERM

# Wait for either to exit
wait
