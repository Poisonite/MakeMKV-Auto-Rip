@echo off

::Start Info
echo ---Welcome to DVD drive loader---
ping 192.0.2.2 -n 1 -w 300 > nul
echo.
ping 192.0.2.2 -n 1 -w 300 > nul
echo ---Developed by Zac Ingoglia (Poisonite101)---
ping 192.0.2.2 -n 1 -w 300 > nul
echo.

::Select Run Mode
ping 192.0.2.2 -n 1 -w 400 > nul
echo What Would you like to do?
ping 192.0.2.2 -n 1 -w 200 > nul
echo Press 1 to load all DVDs.
echo Press 2 to eject all DVDs.
echo Press 3 to exit drive loader.
set /p Mode= Input Mode:

::Load (1)
if /i %Mode% == 1 (
echo.
echo ---Initializing---
ping 192.0.2.2 -n 1 -w 400 > nul
echo ---Please Wait---
ping 192.0.2.2 -n 1 -w 400 > nul
goto :LoadDVDs
) else (
goto :2
)
::Eject (2)
:2
if /i %Mode% == 2 (
echo.
echo ---Initializing---
ping 192.0.2.2 -n 1 -w 400 > nul
echo ---Please Wait---
ping 192.0.2.2 -n 1 -w 400 > nul
goto :EjectDVDs
) else (
goto :3
)
::Exit (3)
:3
if /i %Mode% == 3 (
:Stop
echo Exiting
ping 192.0.2.2 -n 1 -w 1000 > nul
exit
) else (
goto :Stop
)

::LoadDVDs
:LoadDVDs
echo.
echo ---Loading All DVDs---
ping 192.0.2.2 -n 1 -w 400 > nul
node Load.js
goto :ESQ-1

::Copy Movies (For Option 2)
:CopyDel
echo.
echo ---Ejecting All DVDs---
ping 192.0.2.2 -n 1 -w 400 > nul
node Eject.js
goto :ESQ-2

::End Sequence for Option 1
:ESQ-1
echo.
echo ---All DVDs Were Loaded---
echo.
goto :Endr

::End Sequence for Option 2
:ESQ-2
echo.
echo ---All DVDs Were Ejected---
echo.
goto :Endr

:Endr
pause