#!/bin/bash
# ClawBox macOS 快速启动
# 用法: ./start.sh

set -e

echo "⚓ ClawBox 启动中..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node &>/dev/null || [ ! -d "node_modules" ]; then
    echo "📦 先执行统一自举脚本..."
    bash "$SCRIPT_DIR/setup.sh"
fi

echo "✅ Node.js $(node --version)"

# 启动服务
echo "🚀 启动 ClawBox 服务 (端口 3456)..."
HOST=127.0.0.1 PORT=3456 node src/server.js &
SERVER_PID=$!

# 等服务就绪
sleep 2
if curl -s http://127.0.0.1:3456 > /dev/null 2>&1; then
    echo "✅ ClawBox 已启动: http://127.0.0.1:3456"
    echo ""
    echo "按 Ctrl+C 停止服务"
    # 如果在终端里，打开浏览器
    open http://127.0.0.1:3456 2>/dev/null || true
    wait $SERVER_PID
else
    echo "❌ 启动失败，请检查日志"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi
