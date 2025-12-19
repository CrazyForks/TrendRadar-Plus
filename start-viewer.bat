@echo off
chcp 65001 >nul
echo ╔════════════════════════════════════════╗
echo ║  TrendRadar News Viewer 启动脚本       ║
echo ╚════════════════════════════════════════╝
echo.

REM 检查虚拟环境
if not exist ".venv" (
    echo ❌ [错误] 虚拟环境未找到
    echo 请先运行 setup-windows.bat 进行部署
    echo.
    pause
    exit /b 1
)

echo [启动] News Viewer Web 服务器
echo [地址] http://localhost:8080/viewer
echo [提示] 按 Ctrl+C 停止服务
echo.

REM 检查是否有数据
if not exist "output" (
    echo ⚠️  [警告] 未检测到新闻数据
    echo 请先运行爬虫获取新闻数据
    echo.
)

REM 启动 Web 服务器
uv run python -m trendradar.web.server --host 0.0.0.0 --port 8080

pause
