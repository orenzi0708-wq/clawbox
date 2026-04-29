# ClawBox Architecture

> 目标：把 **项目结构真相** 固定在 repo 里，减少主 Agent 对长期记忆的依赖。

## 1. 项目分层

ClawBox 当前可按 3 层理解：

### A. 源码主运行层
- `src/server.js`
- `src/installer.js`
- `src/config.js`
- `public/*`

这是当前 Web / 本地服务主逻辑来源，也是多数 bugfix 的第一修改面。

### B. Tauri server 镜像层
- `src-tauri/server/src/*`
- `src-tauri/server/public/*`
- `src-tauri/server/package.json`

这层不是独立真相源，而是 **从源码主运行层同步出来的镜像层**。

当前同步入口：
```bash
npm run prepare:tauri-server
```

### C. Tauri 壳层
- `src-tauri/src/main.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

这层负责：
- 查找 server 资源
- 启动 Node / server
- 桌面壳生命周期
- 构建与分发

---

## 2. 开发态 vs 打包态

### 开发态
当前 Tauri 代码会优先尝试在以下位置找 server 资源：
1. `src-tauri/server/`
2. 项目根目录 `src/`
3. 上级目录中的项目根

这意味着：
- **开发态功能验证可以先基于源码层 / 镜像层完成**
- 不需要默认先打包

### 打包态
打包后的桌面应用依赖：
- `resource_dir()/server`
- 打进包内的 server 资源

因此：
- **功能验证通过 ≠ 打包态通过**
- 打包态问题应在 `packaging_validation` 阶段单独处理

---

## 3. 当前高耦合模块

以下模块当前耦合度高，修改其一时应主动检查相邻功能：

### A. Gateway restart / status detection / dashboard URL
涉及：
- `src/server.js`
- `src/installer.js`
- 相关 runbook：
  - `docs/RUNBOOKS/gateway-restart.md`
  - `docs/RUNBOOKS/status-detection.md`
  - `docs/RUNBOOKS/dashboard-url-detection.md`

风险：
- 修 restart 时容易带坏 status detection
- 修 status detection 时容易影响 Dashboard 地址获取
- 修 Dashboard 解析时容易误判 Gateway running 状态

### B. 安装流程 / 清场修复 / 安装后状态刷新
涉及：
- `src/installer.js`
- `src/server.js`
- `public/js/app.js`
- runbook：
  - `docs/RUNBOOKS/install-openclaw.md`
  - `docs/RUNBOOKS/preinstall-cleanup-and-repair.md`
  - `docs/RUNBOOKS/status-detection.md`

风险：
- 修安装流程时容易漏掉安装后 verify / 状态刷新
- 修清场逻辑时容易误伤 ClawHub 或误报 residue

### C. 源码层 / Tauri 镜像层同步
涉及：
- `src/*`
- `public/*`
- `src-tauri/server/*`
- `scripts/prepare-tauri-server.js`
- runbook：
  - `docs/RUNBOOKS/tauri-server-sync.md`

风险：
- 只改 `src/*` 不同步镜像层，会导致源码版与桌面版行为错位

---

## 4. 任务真相与项目真相的边界

### 任务真相
放在：
- `tasks/TASK-xxxx/README.md`
- `checkpoint.json`
- `rollback.md`
- `validation.json`
- `handoff.md`

用于回答：
- 当前任务目标是什么
- 改到哪了
- 验证到哪了
- 怎么回退
- 如何续接

### 项目真相
放在：
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/KNOWN_ISSUES.md`
- `docs/RUNBOOKS/*.md`
- `projects/clawbox.md`

用于回答：
- 项目结构是什么
- 为什么这样做
- 目前有哪些稳定结论与已知问题
- 某类操作应该怎么做

---

## 5. 当前推荐读取顺序

续接 ClawBox 时，推荐顺序：

1. `tasks/TASK-xxxx/*`
2. 相关 `docs/RUNBOOKS/*.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DECISIONS.md`
5. `docs/KNOWN_ISSUES.md`
6. `projects/clawbox.md`
7. 最后才补长期记忆

---

## 6. 不应主要依赖 MEMORY 的内容

以下内容不应再主要靠主 Agent 长期记忆维护：
- gateway restart 的具体分析结论
- status detection 的具体判断细节
- package test bundle 的具体步骤
- 当前任务的已验证 / 未验证状态
- 当前代码库中的现行脚本与模板结构

这些应以 repo 文档和任务文件为准。
