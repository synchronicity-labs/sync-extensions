@echo off
REM uninstall.bat - Uninstalls Sync Extension for Windows

echo uninstalling the sync. extension...

REM Helper to remove a directory if it exists
:rmrf
if exist "%~1" (
    echo Removing %~1
    rmdir /s /q "%~1"
)
goto :eof

REM Helper to remove a file if it exists
:rmf
if exist "%~1" (
    echo Removing %~1
    del /q "%~1"
)
goto :eof

REM Kill processes on port 3000
:kill_port_3000
echo Looking for processes running on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo Killing process %%a
    taskkill /PID %%a /F
)
goto :eof

REM Remove all known extension folder names (new & old, panels, etc.)
:remove_all_panel_variants
set base_dir=%~1
call :rmrf "%base_dir%\com.sync.extension"
call :rmrf "%base_dir%\com.sync.extension.ae"
call :rmrf "%base_dir%\com.sync.extension.ppro"
call :rmrf "%base_dir%\com.sync.extension.ae.panel"
call :rmrf "%base_dir%\com.sync.extension.ppro.panel"
call :rmrf "%base_dir%\com.sync.extension.premiere.panel"
goto :eof

REM =========================
REM Windows paths

REM User CEP location
set USER_CEP_DIR=%APPDATA%\Adobe\CEP\extensions
call :remove_all_panel_variants "%USER_CEP_DIR%"

REM All Users CEP location
set ALLUSER_CEP_DIR=%ProgramFiles(x86)%\Common Files\Adobe\CEP\extensions
call :rmrf "%ALLUSER_CEP_DIR%\com.sync.extension"
call :rmrf "%ALLUSER_CEP_DIR%\com.sync.extension.ae"
call :rmrf "%ALLUSER_CEP_DIR%\com.sync.extension.ppro"
call :rmrf "%ALLUSER_CEP_DIR%\com.sync.extension.ae.panel"
call :rmrf "%ALLUSER_CEP_DIR%\com.sync.extension.ppro.panel"
call :rmrf "%ALLUSER_CEP_DIR%\com.sync.extension.premiere.panel"

REM Remove Application Support data (user)
set USER_DATA_DIR=%APPDATA%\sync. extensions
call :rmrf "%USER_DATA_DIR%"

REM Remove Application Support data (all users)
set ALLUSER_DATA_DIR=%ProgramData%\sync. extensions
echo Removing %ALLUSER_DATA_DIR%
call :rmrf "%ALLUSER_DATA_DIR%"

REM Kill server
call :kill_port_3000

echo uninstall complete.
pause
