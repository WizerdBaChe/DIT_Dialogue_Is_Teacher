@echo off
title DIT - Dialogue Is Teacher
echo.
echo 正在啟動 DIT 本地伺服器...
echo Starting the DIT local server...
echo.
echo （若跳出 Windows 防火牆詢問，選擇「允許」即可 — 僅限本機連線，不會對外開放）
echo (If Windows Firewall asks, click "Allow" — this only listens on 127.0.0.1, nothing is exposed externally)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dit.ps1"
echo.
echo 伺服器已停止。按任意鍵關閉這個視窗。
echo Server stopped. Press any key to close this window.
pause >nul
