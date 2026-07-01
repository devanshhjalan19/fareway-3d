@echo off
title Rickshaw Racing
cd /d "%~dp0"

echo ============================================
echo            RICKSHAW RACING
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

echo Starting the game - a browser tab will open automatically.
echo.
echo   * KEEP THIS WINDOW OPEN while you play.
echo   * Close this window ^(or press Ctrl+C^) to stop the game.
echo.

REM --- Launch the dev server and open the browser ---
call npm run dev -- --open

echo.
echo The game server has stopped.
pause
