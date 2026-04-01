# 2026-03-31 ClawBox 跨平台适配 handoff

## 主题

ClawBox 安装/卸载/服务管理流程的 macOS + Windows 跨平台适配。

## 完成的改动

### Commit: `5c48463` — feat: cross-platform adaptation for macOS and Windows
改动文件：4 个，+393 / -98 行

### 1. macOS 适配

| 改动点 | 原来 | 现在 |
|--------|------|------|
| `readlink -f` (3处) | macOS 没有 | macOS 用 `fs.realpathSync()` |
| 卸载路径 | 只有 `/usr/bin/` | 加 `/opt/homebrew/` |
| 服务清理 | 只有 systemd | macOS 走 `launchctl bootout` + 删 plist |
| npm rm -g | 硬加 sudo | macOS 不加 sudo |

### 2. Windows 适配

| 改动点 | 原来 | 现在 |
|--------|------|------|
| OS 检测 | Windows 直接拒绝 | 放行 |
| 安装 OpenClaw | 只有 `install.sh` | Windows 走 `install.ps1` |
| `which` 命令 | Linux only | Windows 用 `where` |
| `2>/dev/null` | 所有平台 | Windows 用 `2>nul` |
| 卸载 Node | Linux 只有 apt | Windows 走 winget/choco/scoop |
| 卸载 ClawHub | `which` + `find` | Windows 用 `where` + `dir /s` |
| 卸载 ClawBox | bash 脚本 | Windows 走 PowerShell 后台删除 |
| 服务清理 | 只有 systemd | Windows 走 `sc.exe` |
| Dashboard URL | `2>/dev/null` | Windows 用 `2>nul` |

### 3. 新文件

- `setup.ps1` — Windows 版引导脚本，支持 4 种 Node 安装方式（winget / Chocolatey / Scoop / msi 直接下载）

### 4. 已有支持（未改）

- `isRoot()` — 已有 Windows admin 检查（`net session`）
- `getExtendedPathDirs()` — 已有 Windows 路径（scoop、choco、npm）
- `resolveOpenClawPath()` — 已有 Windows 路径（`.exe`、`.cmd`）
- `resolveClawHubBinary()` — 已有 Windows 路径
- `openclaw gateway install` — OpenClaw CLI 内部处理 Windows 服务
- 浏览器打开 — 已有 Windows `start` 命令

## 当前状态

- ✅ macOS 适配完成（待真机测试）
- ✅ Windows 适配完成（待真机测试）
- ⚠️ 版本号仍为 0.4.5，未 bump
- ⚠️ 未推送到远程仓库

## 待验证

- 在 macOS 虚拟机上测试完整安装/卸载流程
- 在 Windows 上测试完整安装/卸载流程
- 验证 `openclaw gateway install` 在 Windows 上的注册效果

## 当日其他工作

- 修复了 ClawBox 重启网关失败问题（Node 22 symlink + DBUS 环境变量）
- OpenRouter mimo-v2-pro 临时不可用，fallback 到 mimo-v2-omni
