#!/bin/bash
# 🚀 MathU RaceGame — Quick Test Launcher
# This script starts both backend and frontend in parallel

set -e

BASEDIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT=${BACKEND_PORT:-8080}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

echo "════════════════════════════════════════════════════════"
echo "🎮 MathU RaceGame — Quick Test Start"
echo "════════════════════════════════════════════════════════"
echo ""

# Check MySQL
echo "🔍 Checking MySQL..."
if ! command -v mysql &> /dev/null; then
    echo "⚠️  MySQL client not found. Ensure MySQL is running on localhost:3306"
else
    mysql -h localhost -u root -p1234 -e "USE mathu_racegame;" 2>/dev/null || {
        echo "⚠️  Database not initialized. Run schema.sql and seed.sql first:"
        echo "   mysql -u root -p1234 < src/main/resources/db/schema.sql"
        echo "   mysql -u root -p1234 < src/main/resources/db/seed.sql"
        exit 1
    }
fi

echo ""
echo "🛠️  Building..."
cd "$BASEDIR"

# Build backend
echo "📦 Compiling backend..."
mvn clean compile -q -DskipTests

# Build frontend
echo "📦 Building frontend..."
cd "$BASEDIR/mathu-frontend"
npm install -q --prefer-offline 2>/dev/null || npm install -q
npm run build -q

echo ""
echo "════════════════════════════════════════════════════════"
echo "🚀 Starting services..."
echo "════════════════════════════════════════════════════════"
echo ""
echo "Backend will start on   → http://localhost:$BACKEND_PORT"
echo "Frontend will start on  → http://localhost:$FRONTEND_PORT"
echo ""
echo "📚 Demo Accounts:"
echo "   Teacher: teacher_demo / TeachMe2024!"
echo "   Student: student_alice / Learn2024!"
echo ""
echo "⏹️  Press Ctrl+C to stop both services"
echo ""

# Start backend in background
cd "$BASEDIR"
echo "⏳ Starting backend (Spring Boot)..."
mvn spring-boot:run -DskipTests -q &
BACKEND_PID=$!

# Give backend time to start
sleep 3

# Start frontend in background
cd "$BASEDIR/mathu-frontend"
echo "⏳ Starting frontend (Vite)..."
npm run dev &
FRONTEND_PID=$!

# Wait for both
wait $BACKEND_PID $FRONTEND_PID
