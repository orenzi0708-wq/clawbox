# Runbook: Task Validation / 任务级验证结果

## 适用场景

用于任何一次 **bugfix / 小功能修改 / 回归修复 / 打包交付前收口**，目标是把“这轮到底改了什么、验证到了哪、还剩什么风险”沉淀成一个主 Agent 下次能直接读的结构化文件。

核心产物：
- `tasks/TASK-xxxx/validation.json`

这不是测试平台，也不是 CI 系统。**就是一个最小可用的任务验证层。**

---

## 前置条件

- 仓库路径：`/root/clawbox`
- 已有任务目录：`tasks/TASK-xxxx/`（若没有就新建）
- 本轮代码改动已完成或已到一个可验证阶段

---

## 当前项目已有的可复用检查能力

### 1) 语法检查
当前项目最稳定、最低门槛的检查方式是：
```bash
node --check <file>
```

常用对象：
- `src/server.js`
- `src/installer.js`
- `public/js/app.js`
- `scripts/prepare-tauri-server.js`
- `src-tauri/server/src/server.js`
- `src-tauri/server/src/installer.js`

### 2) Tauri 镜像同步检查
```bash
npm run prepare:tauri-server
```

这是当前项目里非常关键的“相邻回归检查”。

### 3) 安装 / 状态 / Gateway / Dashboard 相关手工 smoke check
项目当前已经有成套 runbook：
- `status-detection.md`
- `gateway-restart.md`
- `dashboard-url-detection.md`
- `install-openclaw.md`
- `preinstall-cleanup-and-repair.md`
- `package-test-bundle.md`
- `windows-test-handoff.md`
- `bugfix-workflow.md`
- `reviewer-checklist.md`

### 4) Windows 真机验收口径
当前项目已明确：
- Linux 侧负责代码修改、静态校验、产包
- Windows 真机结果由船长验收

这意味着 validation 必须能记录：
- 哪些是 Linux 已验证
- 哪些是 Windows 待验证

---

## 建议的 validation.json 结构

当前项目建议采用 **两阶段验证结构**：
- `feature_validation`
- `packaging_validation`

最小 schema：

```json
{
  "task_id": "TASK-0001",
  "task_type": "bugfix",
  "target": {
    "area": "gateway-restart",
    "summary": "修复 Windows 下 Gateway restart 后状态未恢复",
    "platform": ["windows", "linux"]
  },
  "files_touched": [
    "src/server.js",
    "src/installer.js"
  ],
  "checks_run": [
    {
      "name": "node-check-server",
      "kind": "syntax",
      "command": "node --check src/server.js",
      "result": "passed",
      "notes": ""
    }
  ],
  "lint": {
    "status": "not_configured",
    "notes": "项目当前无统一 lint 脚本"
  },
  "typecheck": {
    "status": "not_applicable",
    "notes": "当前主逻辑为 JS，未配置 TypeScript typecheck"
  },
  "feature_validation": {
    "status": "passed",
    "checks_run": [],
    "regression_checks": [],
    "smoke_checks": []
  },
  "packaging_validation": {
    "status": "pending",
    "platforms": {
      "linux": { "status": "pending", "notes": "待进入打包验证阶段" },
      "windows": { "status": "pending", "notes": "后续真机构建/安装验证" },
      "macos": { "status": "pending", "notes": "后续人工或发布前验证" }
    },
    "pending_reason": "当前按先功能验证、后打包验证策略执行"
  },
  "reviewer_result": {
    "status": "needs_windows_validation",
    "summary": "代码审阅通过，需船长在 Windows 真机验证 restart / dashboard / 状态刷新",
    "reviewer": "main-agent"
  },
  "risk_level": "medium",
  "status_summary": "功能验证已通过，打包验证待后续阶段",
  "open_issues": [
    "Windows 真机尚未验证 Gateway restart 是否彻底稳定"
  ],
  "next_action": "功能验证通过后，如需发布，再进入打包验证阶段",
  "generated_at": "2026-04-05T12:20:00+08:00"
}
```

---

## 字段说明（当前项目口径）

### 必填核心字段
- `task_id`
- `task_type`
- `target`
- `files_touched`
- `checks_run`
- `lint`
- `typecheck`
- `feature_validation.status`
- `feature_validation.checks_run`
- `feature_validation.regression_checks`
- `feature_validation.smoke_checks`
- `packaging_validation.status`
- `packaging_validation.platforms`
- `packaging_validation.pending_reason`
- `evidence.commit_sha`
- `evidence.checked_at`
- `evidence.environment`
- `evidence.commands_run`
- `evidence.review_basis`
- `reviewer_result`
- `risk_level`
- `status_summary`
- `open_issues`
- `next_action`
- `generated_at`

### 设计原则
1. **功能验证与打包验证必须分开**
2. Linux 功能通过，不能冒充 Windows/macOS 通过
3. 当前没有 lint / typecheck，也要明确写状态，而不是省略
4. 打包验证未做时，应写 `pending`，不要假装绿灯
5. validation 不只写结论，还要保留最小证据锚点，方便下轮判断结果是否可信

---

## 推荐的文件位置和命名规则

### 目录
```text
tasks/TASK-xxxx/
```

### 文件
```text
tasks/TASK-xxxx/validation.json
```

### 同目录建议共存文件
- `tasks/TASK-xxxx/README.md` — 任务简述 / spec
- `tasks/TASK-xxxx/checkpoint.json` — 当前执行进度与下一步
- `tasks/TASK-xxxx/rollback.md` — 回退方案
- `tasks/TASK-xxxx/validation.json` — 结构化验证结果（核心）
- `tasks/TASK-xxxx/handoff.md` — 需要长文本交接时再加（可选）

> 原则：
> - **checkpoint.json** 负责“做到哪了、下一步是什么”
> - **rollback.md** 负责“出问题怎么退”
> - **validation.json** 负责“验证结果如何”
> - **handoff.md** 负责“必要文字上下文”

---

## 生成 / 更新流程

### 阶段 1：任务启动时
创建 `validation.json`，默认：
- `feature_validation.status = pending`
- `packaging_validation.status = pending`
- 若 `task:init-validation --area <known-area>` 命中预设 profile，则自动预填：
  - `feature_validation.regression_checks`
  - `feature_validation.smoke_checks`
  - `checkpoint.related_runbooks`
  - `checkpoint.next_steps`

### 阶段 2：coder 完成代码改动后
coder 更新：
- `files_touched`
- `checks_run`
- `feature_validation.checks_run`
- `feature_validation.regression_checks`
- `feature_validation.smoke_checks`
- `evidence.commit_sha`
- `evidence.checked_at`
- `evidence.environment`
- `evidence.commands_run`
- `evidence.evidence_paths`
- `evidence.artifacts`
- `status_summary`
- `open_issues`
- `next_action`

### 阶段 3：reviewer 审查后
reviewer / 主 Agent 更新：
- `reviewer_result`
- `risk_level`
- `feature_validation.status`
- `evidence.review_basis`
- `open_issues`
- `next_action`

### 阶段 4：进入打包验证后（后续关卡）
若功能验证通过，再更新：
- `packaging_validation.status`
- `packaging_validation.platforms.*`
- `packaging_validation.pending_reason`

---

## 主 Agent / coder / reviewer 的使用方式

### coder agent
负责：
- 修改代码
- 记录真实跑过的功能验证
- 未做的平台验证必须保持 pending

### reviewer agent / 主 Agent
负责：
- 判断功能验证是否覆盖 spec 与相邻回归
- 判断 packaging 是否尚未进入，不得混写
- 给出 reviewer 结论

### 主 Agent 下次对话恢复时
优先读取：
1. `tasks/TASK-xxxx/validation.json`
2. 看 `feature_validation`
3. 再看 `packaging_validation`
4. 看 `evidence` 判断结果是否可信、是否过时
5. 再看 `handoff.md` 与相关 runbook

---

## 成功判定标准

- validation 结果能清楚区分功能验证与打包验证
- 主 Agent 读文件后能迅速知道当前在哪一阶段
- 平台边界不会被模糊化
- 不需要引入复杂基础设施

---

## 风险点与简化建议

### 风险点
1. 把 Linux 功能验证写成全平台通过
2. 把 packaging_validation 提前当成默认必做阻塞项
3. 没有真实测试框架时，假装 unit/integration 已经存在
4. reviewer 只看 diff，不看 validation 结构

### 简化建议
1. 先把 feature_validation 写扎实
2. packaging_validation 先作为后续接口保留
3. 当前以 runbook 驱动的 smoke/regression checks 为主
4. 证据字段只保留最小锚点：commit / 时间 / 环境 / 命令 / reviewer 依据
5. 真正新增测试框架时，再往 `feature_validation.checks_run` 里接入
