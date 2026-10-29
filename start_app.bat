@echo off
setlocal
title Milio
cd /d "%~dp0"

REM Controleer of Python beschikbaar is
where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo Python is niet gevonden op dit systeem.
    echo Installeer Python 3 vanaf https://www.python.org/downloads/
    echo Vink tijdens installatie "Add Python to PATH" aan.
    echo.
    pause
    exit /b 1
)

REM Start de server; app.py opent zelf de browser
python app.py

REM Als app.py stopt met een fout, laat het venster open zodat je de melding ziet
if errorlevel 1 (
    echo.
    echo Milio is gestopt met een fout. Zie de melding hierboven.
    pause
)

endlocal
