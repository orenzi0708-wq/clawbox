# ClawBox Tauri 构建指南

## 设计思路

不打包 Node.js（节省 ~120MB），改用首次启动检测：
- **有 Node.js** → 直接启动 ClawBox 服务
- **没有 Node.js** → 显示安装引导页面（按平台推荐安装方式）

## 前置依赖

各平台都需要：
1. Node.js 18+（首次启动会引导安装）
2. Rust：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. Tauri CLI：`npm install -g @tauri-apps/cli`

### Linux 额外依赖
```bash
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

### macOS 额外依赖
```bash
xcode-select --install
```

### Windows 额外依赖
- Microsoft Visual Studio C++ Build Tools
- WebView2（Win10/11 自带）

## 构建步骤

### 1. 准备服务器资源

```bash
mkdir -p src-tauri/server/src src-tauri/server/public
cp src/server.js src-tauri/server/src/
cp -r public/* src-tauri/server/public/
cp package.json src-tauri/server/
cp -r node_modules src-tauri/server/
```

### 2. 生成平台图标（可选，需要 1024x1024 源图标）

```bash
npx tauri icon src-tauri/icons/source.png
```

自动生成 .png / .ico / .icns 全套。

### 3. 构建

```bash
npx tauri build
```

产物位置：
- Linux: `src-tauri/target/release/bundle/deb/` 或 `appimage/`
- macOS: `src-tauri/target/release/bundle/macos/`
- Windows: `src-tauri/target/release/bundle/msi/` 或 `nsis/`

## 各平台快捷命令

### Linux（当前服务器已搞定）
```bash
cd /root/clawbox && npx tauri build
```

### macOS
```bash
git clone <repo> && cd clawbox && npm install
mkdir -p src-tauri/server/src src-tauri/server/public
cp src/server.js src-tauri/server/src/
cp -r public/* src-tauri/server/public/
cp -r node_modules src-tauri/server/
npx tauri build
```

### Windows (PowerShell)
```powershell
git clone <repo>; cd clawbox; npm install
New-Item -ItemType Directory -Force -Path src-tauri\server\src, src-tauri\server\public
Copy-Item src\server.js src-tauri\server\src\
Copy-Item -Recurse public\* src-tauri\server\public\
Copy-Item -Recurse node_modules src-tauri\server\
npx tauri build
```

## 首次启动流程

```
App 启动
  ├─ 检测 node --version
  │   ├─ >= v18 → 启动 ClawBox → 打开 localhost:3456
  │   └─ 未找到 → 显示安装引导页
  │       ├─ macOS: brew install node
  │       ├─ Windows: winget install OpenJS.NodeJS.LTS
  │       └─ Linux: nvm install --lts
  │       + npm install -g clawhub
  │       → 用户安装后点"刷新重试"
  └─ 用户可在面板内一键安装 OpenClaw
```

## 包体积参考

| 平台 | 格式 | 大小 |
|------|------|------|
| Linux | .deb | ~3.2MB |
| Linux | .rpm | ~3.2MB |
| Linux | .AppImage | ~73MB |
| macOS | .dmg | ~3-5MB（预估） |
| Windows | .msi/.exe | ~3-5MB（预估） |
