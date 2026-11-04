@echo off
rem ==============================================================================
rem FURY DESKTOP — LAUNCHER & DEVELOPER WORKFLOW SCRIPT
rem ==============================================================================
rem HƯỚNG DẪN DÀNH CHO DEVELOPER / AI LLM:
rem
rem 1. KHI NÀO CHỈ CẦN HOT-RELOAD (Frontend Vite - Cực nhanh, KHÔNG cần C++ compiler):
rem    - Khi bạn chỉ chỉnh sửa các file giao diện trong `desktop/src/` (TSX, CSS, theme).
rem    - Vite tự động phản chiếu thay đổi (HMR) vào cửa sổ đang mở trong 50ms.
rem    - Chỉ cần chạy script này ở chế độ mặc định (Double-click `run-app.bat`).
rem
rem 2. KHI NÀO BẮT BUỘC PHẢI BUILD LẠI (Cần MSVC C++ & Windows 11 SDK):
rem    - Khi sửa đổi code Rust trong `desktop/src-tauri/`, `agent/`, hoặc `shared-rs/`.
rem    - Khi sửa cấu hình native trong `desktop/src-tauri/tauri.conf.json`.
rem    - Khi xóa thư mục `target/` hoặc chạy `cargo clean`.
rem    - Cách kích hoạt build lại: Chạy `run-app.bat rebuild` hoặc chạy `npm run app`.
rem ==============================================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "WANT_REBUILD=0"
if /i "%1"=="rebuild" set "WANT_REBUILD=1"
if /i "%1"=="--rebuild" set "WANT_REBUILD=1"

where node >nul 2>nul
if errorlevel 1 (
  echo !! Node.js is not in PATH.
  goto :fail
)

if not exist "node_modules" (
  echo ==^> npm install
  call npm install
  if errorlevel 1 goto :fail
)

rem Ensure fury-agent sidecar exists
if not exist "src-tauri\binaries\fury-agent-x86_64-pc-windows-msvc.exe" (
  if exist "..\target\debug\fury-agent.exe" (
    if not exist "src-tauri\binaries" mkdir "src-tauri\binaries"
    copy /y "..\target\debug\fury-agent.exe" "src-tauri\binaries\fury-agent-x86_64-pc-windows-msvc.exe" >nul
  )
)

rem Mode 1: Fast Launch using pre-built binary + Vite Hot-Reload (Default)
if "%WANT_REBUILD%"=="0" (
  if exist "..\target\debug\fury-desktop.exe" (
    echo ===================================================================
    echo ==^> MODE: FAST LAUNCH ^(HOT-RELOAD ACTIVATED^)
    echo ==^> Found pre-built Fury Desktop binary.
    echo ==^> Frontend changes in desktop\src\ will auto-update in ~50ms.
    echo ===================================================================
    
    rem Check if Vite is already listening on port 5273
    netstat -ano | findstr /r /c:":5273 .*LISTENING" >nul 2>nul
    if errorlevel 1 (
      echo ==^> Starting Vite dev server on port 5273...
      start "Vite Server" /b npm run dev
      timeout /t 3 /nobreak >nul 2>nul
    ) else (
      echo ==^> Vite dev server is already running on port 5273.
    )
    
    echo ==^> Launching Fury Desktop window...
    start "" "..\target\debug\fury-desktop.exe"
    echo ==^> Fury Desktop started successfully!
    exit /b 0
  )
)

rem Mode 2: Full Rebuild with C++ compiler and Tauri
echo ===================================================================
echo ==^> MODE: COMPILATION WITH MSVC C++ ^& TAURI
echo ===================================================================

rem Load MSVC C++ & Windows SDK environment if available
set "VCVARS="
if exist "C:\Program Files\Microsoft Visual Studio\18\Professional\VC\Auxiliary\Build\vcvars64.bat" (
  set "VCVARS=C:\Program Files\Microsoft Visual Studio\18\Professional\VC\Auxiliary\Build\vcvars64.bat"
)
if not defined VCVARS (
  for /d %%A in ("%ProgramFiles%\Microsoft Visual Studio\*") do (
    for /d %%B in ("%%~A\*") do (
      if exist "%%~B\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=%%~B\VC\Auxiliary\Build\vcvars64.bat"
    )
  )
)

if defined VCVARS (
  echo ==^> Initializing MSVC C++ environment...
  call "%VCVARS%" 10.0.26100.0 >nul 2>nul
)

set "PATH=C:\Users\DTool\.cargo\bin;%PATH%"

echo ==^> Running tauri dev...
call npm run app
if errorlevel 1 goto :fail
exit /b 0

:fail
set "RC=%ERRORLEVEL%"
if "%RC%"=="0" set "RC=1"
echo.
echo !! run-app.bat stopped with exit code %RC%.
pause
exit /b %RC%
