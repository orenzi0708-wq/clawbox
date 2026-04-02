# ClawBox Tauri 构建指南

## 设计思路

- **不把 Node.js 直接打进安装包**，减小包体积
- **首次启动优先检测系统 Node.js**
- **如果系统没有 Node.js**：
  - Linux / macOS：应用内自动下载 Node.js 到 app data 目录
  - Windows：应用内通过 PowerShell 下载 Node.js 到 app data 目录
- **Tauri 包内仍需携带 ClawBox server 运行资源**，不能只放 `server.js`

## 前置依赖

各平台都需要：
1. Node.js 18+（仅构建阶段；最终用户首次运行可自动补齐）
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

必须把 **server 运行依赖文件** 一起复制进去：

```bash
mkdir -p src-tauri/server/src src-tauri/server/public
cp src/server.js src-tauri/server/src/
cp src/config.js src-tauri/server/src/
cp src/installer.js src-tauri/server/src/
cp -r public/. src-tauri/server/public/
cp package.json src-tauri/server/
cd src-tauri/server && npm install --omit=dev --ignore-scripts && cd ../..
```

> 只复制 `server.js` 不够；Tauri 启动时会因为缺少 `./config` / `./installer` 在运行时直接报错。

### 2. 生成平台图标（可选，需要 1024x1024 源图标）

```bash
npx tauri icon src-tauri/icons/source.png
```

自动生成 `.png / .ico / .icns` 全套。

### 3. 构建

```bash
npx tauri build
```

产物位置：
- Linux: `src-tauri/target/release/bundle/deb/` 或 `rpm/`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Windows: `src-tauri/target/release/bundle/msi/` 或 `nsis/`

## 各平台快捷命令

### Linux
```bash
cd /root/clawbox
mkdir -p src-tauri/server/src src-tauri/server/public
cp src/server.js src-tauri/server/src/
cp src/config.js src-tauri/server/src/
cp src/installer.js src-tauri/server/src/
cp -r public/. src-tauri/server/public/
cp package.json src-tauri/server/
cd src-tauri/server && npm install --omit=dev --ignore-scripts && cd ../..
npx tauri build
```

### macOS
```bash
git clone <repo> && cd clawbox && npm install
mkdir -p src-tauri/server/src src-tauri/server/public
cp src/server.js src-tauri/server/src/
cp src/config.js src-tauri/server/src/
cp src/installer.js src-tauri/server/src/
cp -r public/. src-tauri/server/public/
cp package.json src-tauri/server/
cd src-tauri/server && npm install --omit=dev --ignore-scripts && cd ../..
npx tauri build
```

### Windows (PowerShell)
```powershell
git clone <repo>; cd clawbox; npm install
New-Item -ItemType Directory -Force -Path src-tauri\server\src, src-tauri\server\public
Copy-Item src\server.js src-tauri\server\src\
Copy-Item src\config.js src-tauri\server\src\
Copy-Item src\installer.js src-tauri\server\src\
Copy-Item -Recurse public\* src-tauri\server\public\
Copy-Item package.json src-tauri\server\
cd src-tauri\server; npm install --omit=dev --ignore-scripts; cd ..\..
npx tauri build
```

## 首次启动流程

```text
App 启动
  ├─ 检测 node --version
  │   ├─ 找到系统 Node.js → 启动 ClawBox → 打开 localhost:3456
  │   └─ 未找到 → 自动下载 Node.js 到 app_data_dir/node
  │       ├─ Linux/macOS: curl 下载
  │       └─ Windows: PowerShell Invoke-WebRequest 下载
  └─ 若 30 秒内 server 未起来 → 显示错误引导页
```

## 发布前最低检查

发布前至少确认这几项：

1. `src-tauri/server/src/` 里存在：
   - `server.js`
   - `config.js`
   - `installer.js`
2. `src-tauri/server/package.json` 版本号与根目录一致
3. `node src-tauri/server/src/server.js` 能正常启动，不报 `Cannot find module './installer'`
4. Windows 首次启动分支不依赖 `sh`

## 包体积参考

| 平台 | 格式 | 大小 |
|------|------|------|
| Linux | .deb | ~3.2MB |
| Linux | .rpm | ~3.2MB |
| macOS | .dmg | ~3-5MB（预估） |
| Windows | .msi/.exe | ~3-5MB（预估） |
