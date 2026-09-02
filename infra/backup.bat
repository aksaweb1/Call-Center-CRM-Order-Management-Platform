@echo off
REM Nightly backup for Call Center CRM — Windows Side Laptop
REM Creates backups\callcenter_YYYY-MM-DD.sql.gz  and keeps last 14 days

setlocal EnableDelayedExpansion

REM Go to repo root (where this .bat lives / infra)
cd /d "%~dp0.."

if not exist backups mkdir backups

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set dt=%%I
set YYYY=%dt:~0,4%
set MM=%dt:~4,2%
set DD=%dt:~6,2%
if "%YYYY%"=="" set YYYY=%date:~10,4%& set MM=%date:~4,2%& set DD=%date:~7,2%
set STAMP=%YYYY%-%MM%-%DD%
set FILE=backups\callcenter_%STAMP%.sql

echo [%date% %time%] Dumping DB to %FILE% ...

REM Try compose project name variations (default is callcenter-crm)
set COMPOSE_DB=callcenter-crm-db-1
docker ps --format "{{.Names}}" | findstr /I "db" >nul && (
  for /f "delims=" %%N in ('docker ps --format "{{.Names}}" ^| findstr /I "db"') do set COMPOSE_DB=%%N
)

docker exec %COMPOSE_DB% pg_dump -U callcenter callcenter > "%FILE%" 2>nul
if errorlevel 1 (
  echo Backup failed — is Docker running? Tried container %COMPOSE_DB%
  exit /b 1
)

REM Compress with powershell (no extra tools needed)
powershell -command "Compress-Archive -Force '%FILE%' '%FILE%.gz'"
if exist "%FILE%.gz" del "%FILE%"

echo Backup OK: %FILE%.gz

REM Keep last 14 backups
forfiles /p backups /m callcenter_*.sql.gz /d -14 /c "cmd /c del @path" 2>nul

REM Optional: copy to Google Drive if installed at default path
if exist "%USERPROFILE%\Google Drive" (
  copy /Y "%FILE%.gz" "%USERPROFILE%\Google Drive\" >nul
  echo Also copied to Google Drive
)

endlocal
