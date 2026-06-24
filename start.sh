#!/bin/bash

# SmartCV startup script
cd "$(dirname "$0")"

echo " Starting SmartCV..."

# Check dependencies
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not installed. Get it from https://nodejs.org"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Python3 not installed."; exit 1; }

# Install npm deps if needed
if [ ! -d "node_modules" ]; then
  echo "Installing npm packages..."
  npm install
fi

# Install python deps if needed
python3 -c "import flask, flask_cors" 2>/dev/null || {
  echo "Installing Python packages..."
  pip install flask flask-cors --break-system-packages -q
}

# Install docx globally if needed
node -e "require('docx')" 2>/dev/null || {
  echo "Installing docx..."
  npm install -g docx
}

# Start Flask server in background
echo "Starting DOCX server on port 7821..."
python3 docx_server.py &
FLASK_PID=$!

# Start Vite dev server
echo "Starting app on http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop everything."
echo ""
npm run dev &
VITE_PID=$!

# On Ctrl+C, kill both
trap "echo ''; echo 'Stopping...'; kill $FLASK_PID $VITE_PID 2>/dev/null; exit" INT
wait
