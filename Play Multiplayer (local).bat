@echo off
title Rickshaw Racing - Local Multiplayer
cd /d "%~dp0"

echo ============================================
echo      RICKSHAW RACING - LOCAL MULTIPLAYER
echo ============================================
echo.

REM --- Make sure Node.js is available ---
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install it from https://nodejs.org ^(LTS version^), then run this again.
  echo.
  pause
  exit /b 1
)

REM --- Install dependencies on first run only ---
if not exist "node_modules" (
  echo First-time setup: installing dependencies. This can take a minute...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo Something went wrong during install. See the messages above.
    pause
    exit /b 1
  )
  echo.
)

echo Starting the multiplayer room server in a second window...
start "Rickshaw PartyKit Server" cmd /k npm run party:dev

echo.
echo   * Two windows will be open: this one (game) and the room server.
echo   * KEEP BOTH OPEN while you play.
echo   * On THIS computer, open http://localhost:5173 - click CREATE ROOM.
echo   * Friends on the SAME Wi-Fi: share the Network URL shown below and the room code.
echo.

REM Give the room server a moment to boot, then launch the game.
timeout /t 3 >nul
call npm run dev -- --open --host

echo.
echo The game server has stopped. You can close the room-server window too.
pause
