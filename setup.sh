#!/bin/bash
# ClawBox Bootstrap Script
# 在全新系统上一键安装所有依赖（Node.js、clawhub），然后启动 ClawBox
# 用法: curl -fsSL <url>/setup.sh | bash
#    或: bash setup.sh

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
error() { echo -e "\n${BOLD}✗ $*${NC}"; }

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║     📦 ClawBox Bootstrap          ║"
echo "  ║   环境检测 & 依赖安装              ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# 检测 OS
OS="unknown"
if [ "$(uname)" = "Darwin" ]; then
  OS="macos"
elif [ "$(uname)" = "Linux" ]; then
  OS="linux"
fi

if [ "$OS" = "unknown" ]; then
  echo ""
  echo "  不支持的操作系统。请使用 Windows PowerShell 运行:"
  echo "    powershell -ExecutionPolicy Bypass -File setup.ps1"
  echo ""
  exit 1
fi
info "检测到: $OS"

# 检测是否 root
IS_ROOT=false
if [ "$(id -u)" -eq 0 ]; then
  IS_ROOT=true
  info "运行模式: root（无需 sudo）"
fi

# ========== 安装 Node.js ==========
install_node() {
  info "正在安装 Node.js（通过官方 install.sh）..."

  if [ "$OS" = "macos" ]; then
    if command -v brew &>/dev/null; then
      brew install node@22
      brew link node@22 --overwrite --force
    else
      error "macOS 需要先安装 Homebrew: https://brew.sh"
      exit 1
    fi
  elif [ "$OS" = "linux" ]; then
    # 先下载再执行，避免 bash <(curl ...) 的 /dev/fd 问题
    curl -fsSL https://openclaw.ai/install.sh -o /tmp/openclaw_install.sh
    if $IS_ROOT; then
      bash /tmp/openclaw_install.sh --no-onboard
    else
      sudo bash /tmp/openclaw_install.sh --no-onboard
    fi
    rm -f /tmp/openclaw_install.sh
  fi

  info "Node.js $(node -v) 安装完成"
}

# ========== 初始化 OpenClaw 配置 ==========
init_openclaw_config() {
  if command -v openclaw &>/dev/null; then
    info "初始化 OpenClaw 配置..."
    openclaw config set gateway.mode local 2>/dev/null || true
    openclaw config set gateway.auth.mode none 2>/dev/null || true
    info "OpenClaw 配置完成 ✓"
  fi
}

# 检查 Node.js
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    info "Node.js $(node -v) 已安装 ✓"
    NODE_OK=true
  else
    warn "Node.js $(node -v) 版本过低，需要 >= 18"
  fi
else
  warn "Node.js 未安装"
fi

if ! $NODE_OK; then
  install_node
fi

# ========== 初始化 OpenClaw 配置 ==========
init_openclaw_config

# ========== 安装 ClawHub CLI ==========
install_clawhub() {
  info "正在安装 ClawHub CLI..."
  if $IS_ROOT; then
    npm --loglevel error --no-fund --no-audit install -g clawhub 2>/dev/null || \
    pnpm add -g clawhub 2>/dev/null || {
      warn "clawhub 安装失败，Skills 市场将不可用"
      return 1
    }
  else
    sudo npm --loglevel error --no-fund --no-audit install -g clawhub 2>/dev/null || \
    pnpm add -g clawhub 2>/dev/null || {
      warn "clawhub 安装失败，Skills 市场将不可用"
      return 1
    }
  fi
  # 确保有执行权限
  CLAWHUB_BIN=$(command -v clawhub 2>/dev/null || echo "")
  if [ -n "$CLAWHUB_BIN" ]; then
    chmod +x "$CLAWHUB_BIN" 2>/dev/null || true
  fi
  info "ClawHub CLI 安装完成 ✓"
}

# 检查 ClawHub
if command -v clawhub &>/dev/null; then
  info "ClawHub CLI 已安装 ✓"
else
  install_clawhub || true
fi

# ========== 安装 ClawBox 依赖 ==========
CLAWBOX_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$CLAWBOX_DIR/package.json" ]; then
  info "安装 ClawBox 依赖..."
  cd "$CLAWBOX_DIR"

  # 检测可用的包管理器
  if command -v pnpm &>/dev/null; then
    pnpm install --no-frozen-lockfile 2>/dev/null || npm install
  else
    npm install --registry https://registry.npmjs.org/
  fi

  info "ClawBox 依赖安装完成 ✓"
fi

# ========== 完成 ==========
echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║     ✅ 环境准备就绪                ║"
echo "  ╚═══════════════════════════════════╝"
echo ""
echo "  启动 ClawBox:"
echo "    cd $CLAWBOX_DIR && npm start"
echo ""
echo "  然后在浏览器打开: http://127.0.0.1:3456"
echo ""
