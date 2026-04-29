# Runbook: Bugfix Workflow / 缺陷修复工作流

## 适用场景

用于 ClawBox 项目的日常 bugfix，目标是建立一个 **先功能验证、后打包验证** 的最小但严格流程，减少“修好了 A，又带坏了 B”。

本 runbook 明确：
- **本轮默认不把 Tauri 打包作为第一验证方式**
- 先验证功能闭环与回归闭环
- 功能验证通过后，才进入后续打包验证阶段

---

## 当前项目已有的功能验证能力

### 1) 代码级静态检查
当前最稳定的基础能力：

```bash
node --check src/server.js
node --check src/installer.js
node --check public/js/app.js
node --check scripts/prepare-tauri-server.js
node --check src-tauri/server/src/server.js
node --check src-tauri/server/src/installer.js
```

### 2) Tauri 开发模式能力（不等于打包）
当前 Tauri 侧已具备 dev/root 探测逻辑：
- `src-tauri/src/main.rs -> find_server_root()`
- 在开发环境会优先从：
  - `src-tauri/server`
  - 项目根目录 `src/`
  读取 server 资源

这意味着：
- **可以把 Tauri dev 作为功能验证入口**
- 不需要一开始就做 `cargo tauri build`

> 待补充点：当前仓库里没有统一的 `tauri dev` 启动脚本；本轮先把它作为“可用能力 / 后续接入点”写清，而不强行加重流程。

### 3) 现有功能 smoke / regression 基础
当前项目已经有这些可直接转化为功能验证项的 runbook：
- `status-detection.md`
- `gateway-restart.md`
- `dashboard-url-detection.md`
- `install-openclaw.md`
- `preinstall-cleanup-and-repair.md`
- `tauri-server-sync.md`

### 4) 任务级结构化文件
当前项目已具备：
- `checkpoint.json`
- `rollback.md`
- `validation.json`
- `handoff.md`

这正适合承接 bugfix 流程中的状态、回退、验证和交接。

---

## 当前项目已有的打包 / 构建能力

### 1) Tauri 打包能力
- `src-tauri/BUILD.md`
- `.github/workflows/build.yml`
- `cargo tauri build --target ... --bundles ...`

### 2) Tauri server 资源同步
```bash
npm run prepare:tauri-server
```

### 3) 测试包能力
- `docs/RUNBOOKS/package-test-bundle.md`
- `/tmp/clawbox-releases/*`

### 4) 当前明确边界
- Linux 云服务器是主开发 / 基础验证环境
- Windows/macOS 打包与安装 smoke **不是本轮默认阻塞项**
- 但必须在 validation 里预留平台验证入口

---

## 建议的“两阶段 bugfix 流程”

## 第一阶段：功能验证关（本轮重点）

### Step 1. 先生成 spec / 任务骨架
用任务目录承接本轮 bugfix：

```bash
npm run task:init-validation -- TASK-xxxx --type bugfix --area <area> --summary "<一句话目标>" --platform linux,windows
```

当前初始化脚本已支持按常见 bugfix area 预填：
- 相关 runbook
- 默认 regression checks
- 默认 smoke checks
- checkpoint 的建议 next steps

然后补 `README.md` 作为 spec。

---

### Step 2. 优先生成最小复现测试或验证脚本
优先级：
1. 能写最小复现脚本，就先写脚本
2. 写不了脚本，就写明确 smoke 步骤
3. 如果当前只能人工验证，也要写进任务文件和 validation

> 重点不是追求“测试框架全家桶”，而是避免这次 bug 连复现方法都丢掉。

---

### Step 3. 修改代码
修改源码时同步维护：
- `checkpoint.json`
- 必要时补 `rollback.md`

---

### Step 4. 运行 unit / integration 级检查（就现有能力而言）
当前项目没有统一 unit/integration test runner，所以本轮采用“最小可执行检查集”：

- `node --check ...`
- 必要的脚本级验证
- 与目标 bug 直接相关的最小功能验证

若后续引入真实 unit/integration test，可直接填进 `feature_validation.checks_run`。

---

### Step 5. 使用 Tauri 开发模式 / 开发态资源进行功能验证
默认优先：
- 项目根目录源码运行
- `src-tauri/server` 镜像同步后的开发态验证
- Tauri dev（如果当前环境可直接拉起）

**不要默认先打包。**

本阶段的目标是验证：
- 功能是否恢复
- 相邻功能是否被带坏
- 开发态是否能复现或证明修复

---

### Step 6. 运行必要 regression checks 和 smoke checks
这一步必须与 bug 范围绑定。

示例：
- 修 Gateway restart
  - regression：状态检测、Dashboard URL、状态刷新
- 修安装清场
  - regression：ClawHub 不误删、OpenClaw 安装提示、EBUSY 提示

---

### Step 7. reviewer 基于 spec、diff、validation.json 做独立审查
reviewer 默认输入顺序：
1. `README.md` / spec
2. `validation.json`
3. `handoff.md`
4. `git diff` / changed files
5. 对应 runbook
6. 必要时再看 `checkpoint.json` 或项目文档

review 重点：
- 修的点是否符合 spec
- 验证是否覆盖相邻风险
- Linux 已验证 ≠ Windows/macOS 已验证
- 必须分开判断：
  - 本轮功能修复是否通过
  - packaging_validation 是否仍待后续关卡

---

### Step 8. 产出结构化 validation.json
本轮强制把功能验证结果落进：
- `feature_validation`
- `reviewer_result`
- `risk_level`
- `open_issues`
- `next_action`

---

## 第二阶段：打包验证关（本轮先设计接口）

### 进入条件
只有当 **feature_validation.status = passed** 或至少达到 `ready_for_packaging` 时，才进入打包验证。

### 记录方式
打包验证单独记录在：
- `packaging_validation.status`
- `packaging_validation.platforms`
- `packaging_validation.pending_reason`

### 平台口径
- Linux：构建 / 安装 smoke 可较早接入
- Windows：后续发布关卡接入
- macOS：若自动化能力不足，应明确标为人工 / 后续验证项

---

## validation.json 结构建议（bugfix 口径）

当前建议把 validation 分成两层：

```json
{
  "task_id": "TASK-0001",
  "task_type": "bugfix",
  "target": { "area": "gateway-restart", "summary": "...", "platform": ["linux", "windows"] },
  "files_touched": [],
  "checks_run": [],
  "lint": { "status": "not_configured", "notes": "..." },
  "typecheck": { "status": "not_applicable", "notes": "..." },
  "feature_validation": {
    "status": "passed",
    "checks_run": [],
    "regression_checks": [],
    "smoke_checks": []
  },
  "packaging_validation": {
    "status": "pending",
    "platforms": {
      "linux": { "status": "pending", "notes": "待进入打包关卡" },
      "windows": { "status": "pending", "notes": "后续真机构建/安装验证" },
      "macos": { "status": "pending", "notes": "后续人工或发布前验证" }
    },
    "pending_reason": "当前按先功能验证、后打包验证策略执行"
  },
  "reviewer_result": { "status": "approved", "summary": "...", "reviewer": "main-agent" },
  "risk_level": "medium",
  "status_summary": "功能验证已通过，打包验证待后续阶段",
  "open_issues": [],
  "next_action": "如需发布，再进入 packaging_validation 阶段",
  "generated_at": "2026-04-05T12:20:00+08:00"
}
```

---

## 需要新增或修改的模板 / skill / 规则

### 本轮建议修改
- `tasks/_templates/validation.json.template`
- `docs/RUNBOOKS/task-validation.md`
- 新增 `docs/RUNBOOKS/bugfix-workflow.md`
- 新增 `docs/RUNBOOKS/reviewer-checklist.md`

### 本轮不做重设计
- 不重构整个 task 系统
- 不引入 CI 编排层
- 不要求先完成跨平台打包验证

---

## 本轮最小可用落地方案

1. **把 validation 模板升级为两阶段结构**
2. **新增 bugfix workflow runbook**
3. **新增 reviewer checklist**
4. **以后 bugfix 默认先过 feature_validation，再谈 packaging_validation**

---

## 风险点与注意事项

1. **Linux 功能通过 ≠ Windows/macOS 通过**
2. **Tauri dev 通过 ≠ 打包安装通过**
3. 当前没有统一 unit/integration test runner，不能假装已经有
4. 如果某平台当前无法自动验证，应明确写成 `pending` / `manual-later`
