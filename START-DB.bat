@echo off
title Starting PostgreSQL...
echo ========================================
echo  Starting PostgreSQL Database
echo ========================================
"C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "C:\Users\Daniel\Desktop\Daniel API ticker\pgdata" -l "C:\Users\Daniel\Desktop\Daniel API ticker\pgdata\startup.log" start
echo.
echo Database start command issued. Check startup.log if anything goes wrong.
timeout /t 3