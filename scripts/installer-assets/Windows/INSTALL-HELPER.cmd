@echo off
setlocal

set SCRIPT_DIR=%~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%INSTALL.ps1"
if errorlevel 1 (
	echo.
	echo [Tategaki Installer]
	echo The installer exited with an error.
	pause
)
endlocal
