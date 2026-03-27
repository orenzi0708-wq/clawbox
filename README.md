# 📦 ClawBox

一键部署 & 管理 OpenClaw 的图形化工具。

## 快速开始

### 全新系统（推荐）

```bash
# 1. 下载并解压
tar -xzf clawbox-v0.2.x.tar.gz
cd clawbox

# 2. 一键配置环境 + 启动
bash setup.sh && npm start
```

`setup.sh` 会自动安装：Node.js v22、ClawHub CLI、项目依赖

### 已有 Node.js 环境

```bash
cd clawbox
npm install
npm start
```

浏览器打开 `http://localhost:3456`

## 功能

- **一键安装 OpenClaw** — 自动处理 Node.js、build tools、OpenClaw 安装
- **卸载 OpenClaw** — 一键卸载，保留配置文件
- **模型配置** — 支持 MIMO、DeepSeek、Gemini、Claude、GPT 等主流模型
- **飞书通道** — 快速配置飞书机器人
- **Skills 市场** — 搜索并安装 ClawHub 技能

## 系统要求

- Ubuntu / Debian / CentOS / Fedora / macOS
- 无需预装 Node.js（setup.sh 会自动安装）

## 全局运行

首次启动会自动执行 `npm link`，之后任意目录输入 `clawbox` 即可启动。

## License

MIT
