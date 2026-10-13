@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" (
  echo .env 파일이 없어요. .env.example 을 복사해 .env 로 만들고 API 키를 넣어 주세요.
  pause
  exit /b
)
start "" http://localhost:8765
python server.py
pause
