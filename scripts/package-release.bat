@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo === DIT release packaging ===

for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set VERSION=%%v
if "%VERSION%"=="" (
    echo Could not read version from package.json, aborting.
    exit /b 1
)
echo Version: %VERSION%

echo.
echo [1/5] npm run build
call npm run build
if errorlevel 1 (
    echo Build failed, aborting.
    exit /b 1
)

echo.
echo [2/5] npm run test
call npm run test
if errorlevel 1 (
    echo Tests failed, aborting.
    exit /b 1
)

set STAGE=releases\_staging
if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"

echo.
echo [3/5] Staging release contents (dist + double-click launcher)
xcopy /e /i /y dist\* "%STAGE%\" >nul
if errorlevel 1 (
    echo Staging dist\ failed, aborting.
    exit /b 1
)
copy /y scripts\start-dit.bat "%STAGE%\" >nul
copy /y scripts\start-dit.ps1 "%STAGE%\" >nul
copy /y scripts\START-HERE.txt "%STAGE%\" >nul
copy /y LICENSE "%STAGE%\LICENSE.txt" >nul

set ZIPNAME=releases\dit-dialogue-is-teacher-v%VERSION%.zip
if exist "%ZIPNAME%" del /f /q "%ZIPNAME%"

echo.
echo [4/5] Zipping -^> %ZIPNAME%
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%ZIPNAME%' -Force"
if errorlevel 1 (
    echo Zip step failed, aborting.
    exit /b 1
)

echo.
echo [5/5] Cleaning up staging directory
rmdir /s /q "%STAGE%"

echo.
echo Done: %ZIPNAME%
echo Unzip anywhere and double-click start-dit.bat to run it — no install needed.
endlocal
