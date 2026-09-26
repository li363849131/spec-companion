@echo off
chcp 65001 >nul
echo ========================================
echo Spec Companion 依赖安装
echo ========================================
echo.

echo [步骤 1/6] 检查环境...
where node >nul 2>&1
if errorlevel 1 (
    echo ❌ 未找到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

node -v
npm -v
echo ✓ Node.js 环境正常
echo.

echo [步骤 2/6] 清理旧文件...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json
if exist .vite rmdir /s /q .vite
echo ✓ 清理完成
echo.

echo [步骤 3/6] 清理 npm 缓存...
call npm cache clean --force
echo ✓ 缓存已清理
echo.

echo [步骤 4/6] 设置淘宝镜像（加速下载）...
call npm config set registry https://registry.npmmirror.com
echo ✓ 镜像设置完成
echo.

echo [步骤 5/6] 安装依赖（这可能需要几分钟）...
echo 正在下载和安装包...
call npm install --legacy-peer-deps --loglevel=error

if errorlevel 1 (
    echo.
    echo ❌ 安装失败！
    echo.
    echo 尝试恢复默认镜像并重试...
    call npm config set registry https://registry.npmjs.org
    call npm install --legacy-peer-deps

    if errorlevel 1 (
        echo.
        echo ❌ 仍然失败，请检查网络连接
        pause
        exit /b 1
    )
)

echo ✓ 依赖安装完成
echo.

echo [步骤 6/6] 验证安装...
if not exist node_modules (
    echo ❌ node_modules 目录未创建
    pause
    exit /b 1
)

if not exist node_modules\react (
    echo ❌ React 未正确安装
    pause
    exit /b 1
)

if not exist node_modules\vite (
    echo ❌ Vite 未正确安装
    pause
    exit /b 1
)

echo ✓ 所有依赖验证通过
echo.

echo ========================================
echo ✅ 安装成功完成！
echo ========================================
echo.
echo 下一步操作：
echo   1. 运行 start-dev.bat 启动开发服务器
echo   2. 或在命令行输入: npm run dev
echo   3. 浏览器访问: http://localhost:3000
echo.
echo 如有问题，请查看 START_HERE.md
echo.
pause
