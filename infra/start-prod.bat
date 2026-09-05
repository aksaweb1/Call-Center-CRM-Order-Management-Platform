@echo off
REM One-click start/update for PROD side laptop. Double-click this file.
REM Pulls latest main, rebuilds, starts, shows status. Safe: never deletes data.
cd /d "%~dp0.."
echo === 1/4 git pull origin main ===
git pull origin main
if errorlevel 1 (
  echo Git pull failed. Fix git first, then run again.
  pause
  exit /b 1
)
echo.
echo === 2/4 docker compose up -d --build (takes a few minutes first time) ===
docker compose up -d --build
if errorlevel 1 (
  echo Docker build failed. See errors above.
  pause
  exit /b 1
)
echo.
echo === 3/4 status ===
docker compose ps
echo.
echo === 4/4 api health (wait 30s for startup, then check) ===
timeout /t 30 /nobreak >nul
docker compose logs api --tail 5
echo.
echo Done. Open http://localhost:3001 on this laptop,
echo or http://YOUR-IP:3001 (from ipconfig) on other office laptops.
echo If api shows Restarting, run: docker compose logs api --tail 50
pause
