#!/bin/bash
# ClawBox macOS 快速启动
# 用法: ./start.sh

set -e

echo "⚓ ClawBox 启动中..."

# 检查 Node.js
if ! command -v node &>/dev/null; then
    echo "❌ 未检测到 Node.js，正在通过 Homebrew 安装..."
    if ! command -v brew &>/dev/null; then
        echo "请先安装 Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi
    brew install node
fi

echo "✅ Node.js $(node --version)"

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install --production
fi

# 启动服务
echo "🚀 启动 ClawBox 服务 (端口 3456)..."
PORT=3456 node src/server.js &
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
