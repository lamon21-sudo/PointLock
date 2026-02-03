@echo off
REM Regenerate Prisma Client - Windows Script
REM Run this after updating schema.prisma

echo ========================================
echo Prisma Client Regeneration Script
echo ========================================
echo.

cd /d "%~dp0\.."

echo [1/4] Checking for running Node processes...
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo WARNING: Node.exe processes are running.
    echo Please close your IDE and dev servers, then run this script again.
    echo.
    echo Press any key to see running Node processes...
    pause >nul
    tasklist /FI "IMAGENAME eq node.exe"
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)
echo OK: No node.exe processes found.
echo.

echo [2/4] Removing old Prisma client cache...
if exist "..\..\node_modules\.prisma\client" (
    rmdir /s /q "..\..\node_modules\.prisma\client"
    echo Removed: node_modules\.prisma\client
) else (
    echo No cache found, skipping.
)
echo.

echo [3/4] Generating Prisma client...
call npx prisma generate
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Prisma generate failed.
    echo.
    echo Possible causes:
    echo   - File is locked by antivirus or system process
    echo   - IDE language server is running
    echo   - Dev server is still running
    echo.
    echo Suggested actions:
    echo   1. Restart your computer
    echo   2. Disable antivirus temporarily
    echo   3. Run this script as Administrator
    echo.
    pause
    exit /b 1
)
echo.

echo [4/4] Verifying TypeScript compilation...
call npx tsc --noEmit
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARNING: TypeScript compilation has errors.
    echo Please review the errors above.
    echo.
    pause
    exit /b 1
)
echo.

echo ========================================
echo SUCCESS: Prisma client regenerated!
echo ========================================
echo.
echo You can now start your dev server.
echo.
pause
