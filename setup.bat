@echo off
REM ViBe Windows 빠른 시작 가이드

echo 🎤 ViBe 설정 시작...
echo.

REM Node.js 설치 확인
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js가 설치되어 있지 않습니다.
    echo Node.js를 설치하세요: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i

echo ✅ Node.js 버전: %NODE_VERSION%
echo ✅ npm 버전: %NPM_VERSION%
echo.

REM 의존성 설치
echo 📦 의존성 설치 중...
call npm install

if %errorlevel% equ 0 (
    echo.
    echo ✅ 설치 완료!
    echo.
    echo 🚀 서버 시작:
    echo    npm start          # 일반 모드
    echo    npm run dev        # 개발 모드 (자동 재시작)
    echo.
    echo 🌐 브라우저에서 접속:
    echo    http://localhost:3000
    echo.
    echo 💡 팁:
    echo    - 여러 탭/창에서 localhost:3000 열기
    echo    - 각각 다른 이름으로 참여
    echo    - 같은 회의 ID로 참여
) else (
    echo ❌ 설치 중 오류가 발생했습니다.
    pause
    exit /b 1
)

pause
