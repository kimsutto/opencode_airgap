@echo off
setlocal DisableDelayedExpansion
set "company_bundle=%~dp0"
set "company_profile=%LOCALAPPDATA%\opencode-company\v1"
if defined OPENCODE_COMPANY_HOME set "company_profile=%OPENCODE_COMPANY_HOME%"
for %%D in (data config cache state tmp home) do if not exist "%company_profile%\%%D" mkdir "%company_profile%\%%D"
set "PATH=%company_bundle%;%PATH%"
set "XDG_DATA_HOME=%company_profile%\data"
set "XDG_CONFIG_HOME=%company_profile%\config"
set "XDG_CACHE_HOME=%company_profile%\cache"
set "XDG_STATE_HOME=%company_profile%\state"
set "TEMP=%company_profile%\tmp"
set "TMP=%company_profile%\tmp"
set "OPENCODE_TEST_HOME=%company_profile%\home"
set "OPENCODE_CONFIG_DIR=%company_bundle%config"
set "OPENCODE_DISABLE_AUTOUPDATE=true"
set "OPENCODE_DISABLE_MODELS_FETCH=true"
set "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true"
if not "%~1"=="" goto with_args
set "company_project=%USERPROFILE%"
set /p "company_project=Project folder (Enter = home): "
set "company_project=%company_project:"=%"
if not exist "%company_project%\." goto missing_project
"%company_bundle%opencode.exe" "%company_project%"
set "company_exit=%errorlevel%"
if not "%company_exit%"=="0" pause
exit /b %company_exit%
:with_args
"%company_bundle%opencode.exe" %*
exit /b %errorlevel%
:missing_project
echo Folder not found: "%company_project%"
pause
exit /b 1
