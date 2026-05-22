@echo off
REM 🚀 MathU RaceGame — Quick Test Launcher (Windows)
REM This batch script starts both backend and frontend

setlocal enabledelayedexpansion

set BASEDIR=%~dp0
set BACKEND_PORT=8080
set FRONTEND_PORT=5173

echo.
echo ========================================================
echo 🎮 MathU RaceGame — Quick Test Start (Windows)
echo ========================================================
echo.

REM Check if MySQL is running
echo 🔍 Checking MySQL connection...
mysql -h localhost -u root -p1234 -e "USE mathu_racegame;" >nul 2>&1
if errorlevel 1 (
    echo.
    echo ❌ Database not found. Initialize it with:
    echo    mysql -u root -p1234 ^< src\main\resources\db\schema.sql
    echo    mysql -u root -p1234 ^< src\main\resources\db\seed.sql
    pause
    exit /b 1
)

echo 🔄 Database check passed
echo.
echo 🛠️  Building...

REM Clean and build backend
echo 📦 Compiling backend...
cd /d "%BASEDIR%"
call mvn clean compile -q -DskipTests
if errorlevel 1 (
    echo ❌ Backend compilation failed
    pause
    exit /b 1
)

REM Build frontend
echo 📦 Building frontend...
cd /d "%BASEDIR%mathu-frontend"
call npm install -q --prefer-offline 2>nul || call npm install -q
call npm run build -q
if errorlevel 1 (
    echo ❌ Frontend build failed
    pause
    exit /b 1
)

echo.
echo ========================================================
echo 🚀 Starting services...
echo ========================================================
echo.
echo Backend will start on   → http://localhost:%BACKEND_PORT%
echo Frontend will start on  → http://localhost:%FRONTEND_PORT%
echo.
echo 📚 Demo Accounts:
echo    Teacher: teacher_demo / TeachMe2024!
echo    Student: student_alice / Learn2024!
echo.
echo ⏹️  Close windows to stop services
echo.

REM Start backend in new window
cd /d "%BASEDIR%"
start "MathU Backend - Spring Boot" cmd /k "mvn spring-boot:run -DskipTests -q"

REM Start frontend in new window (wait a bit for backend to initialize)
timeout /t 3 /nobreak
cd /d "%BASEDIR%mathu-frontend"
start "MathU Frontend - React/Vite" cmd /k "npm run dev"

echo.
echo ✅ Services started! Check the new windows.
echo.
pause
