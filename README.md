# ClawBox

ClawBox 是一个用于安装、配置和管理 OpenClaw 的图形化工具。当前源码版本为 `0.5.26`。

它包含两种运行形态：

- Web 模式：用 Node.js 启动本地 Express 服务，浏览器访问 `http://127.0.0.1:3456`。
- 桌面模式：用 Tauri v2 打包桌面壳，启动时拉起内置 ClawBox server，再打开本地页面。

## 当前状态

这个版本已经具备 Linux、macOS 和 Windows 的适配代码与打包配置，但发布前仍建议做对应平台的真机安装 smoke。

已配置的构建目标：

- Linux x64：`deb`、`rpm`
- macOS arm64：`dmg`
- Windows x64：`msi`、`nsis`

注意：

- macOS Intel x64 暂未放在当前 CI 矩阵里。
- 仓库中可能包含历史 Linux 二进制或任务交接文件；正式发布请以 GitHub Actions 产物或本地重新打包结果为准。
- Windows/macOS 的完整安装、卸载、Gateway 注册等流程建议在真机上最终验收。

## 主要功能

- 一键安装、更新、卸载 OpenClaw。
- 检测 OpenClaw、ClawHub、Node.js 和 Gateway 状态。
- 管理 Gateway 启动、重启、Dashboard 地址检测和恢复流程。
- 配置模型供应商、默认模型和 API Key。
- 管理消息通道配置，目前重点覆盖飞书手动配置与状态同步。
- 搜索和安装 ClawHub Skills。
- Windows 安装前环境修复与残留清理辅助。

## 源码运行

推荐使用 Node.js 22；源码运行最低要求为 Node.js 18+。

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
.\run.bat
```

也可以直接运行：

```powershell
npm install
node src\server.js
```

### Linux / macOS

```bash
bash setup.sh
npm start
```

已有 Node.js 环境时也可以直接：

```bash
npm install
npm start
```

启动后打开：

```text
http://127.0.0.1:3456
```

## 桌面打包

打包前先同步 Tauri 内置 server 资源：

```bash
npm run prepare:tauri-server -- --install
```

然后进入 `src-tauri` 构建：

```bash
cd src-tauri
cargo tauri build
```

GitHub Actions 的 `Build ClawBox` workflow 已经按平台准备了 Linux、macOS arm64 和 Windows x64 的构建命令。

## 常用脚本

```bash
npm start
npm run dev
npm run prepare:tauri-server
npm run task:init-validation -- TASK-xxxx --type bugfix --area <area> --summary "<summary>" --platform linux,windows
npm run task:review-guard
```

## 验证建议

基础源码检查：

```bash
node --check src/server.js
node --check src/installer.js
node --check src/config.js
node --check bin/clawbox.js
```

发布前建议至少确认：

- `npm start` 能正常启动 Web 模式。
- `npm run prepare:tauri-server -- --install` 能生成完整 `src-tauri/server` 资源。
- 目标平台的安装包能启动、自动找到或下载 Node.js，并能打开 ClawBox 页面。
- OpenClaw 安装、Gateway 注册、Dashboard 地址检测、卸载流程在目标平台上完成 smoke。

## 目录说明

- `src/`：ClawBox server、安装器和配置逻辑。
- `public/`：浏览器端页面、样式和交互逻辑。
- `src-tauri/`：Tauri 桌面应用配置与 Rust 启动逻辑。
- `scripts/`：资源同步、任务验证和 smoke 脚本。
- `docs/`：架构说明、runbook 和验证流程。
- `tasks/`：历史任务、验证记录和模板。

## License

MIT
