@echo off
setlocal

set SCRIPT_DIR=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%UNINSTALL.ps1"
if errorlevel 1 (
	echo.
	echo [Tategaki Uninstaller]
	echo The uninstaller exited with an error.
	pause
)
endlocal
