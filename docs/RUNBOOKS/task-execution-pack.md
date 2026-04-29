# Runbook: Task Execution Pack / 任务级执行包

## 适用场景

用于为每个 `tasks/TASK-xxxx/` 任务建立一个最小可用的执行包，让任务在执行过程中具备：

- **可续接**：下次主 Agent / coder 能快速恢复到上一个稳定点
- **可回退**：如果修 A 带坏 B，知道怎么退
- **可交接**：reviewer / 主 Agent / 船长都能看懂当前状态

这不是任务管理系统，也不是状态机平台。**就是一套轻量任务目录标准。**

---

## 推荐目录结构

```text
tasks/
  _templates/
    task.README.template.md
    checkpoint.json.template
    rollback.md.template
    handoff.md.template
    validation.json.template
  TASK-xxxx/
    README.md
    checkpoint.json
    rollback.md
    validation.json
    handoff.md            # 可选
    artifacts/            # 可选，放截图、日志、输出样例
```

### 各文件职责

- `README.md`
  - 任务 spec / 背景 / 目标 / 范围边界
- `checkpoint.json`
  - **任务执行中间状态**：做到哪了、下一步是什么、当前卡点是什么
- `rollback.md`
  - **回退方案**：如果这轮改坏了，怎么回退代码 / 状态 / 测试包
- `validation.json`
  - **结构化验证结果**：跑了哪些检查、哪些通过、哪些待真机验证
- `handoff.md`
  - 长文本交接说明（需要时再写）
  - 重点补充“为什么停在这里、接手顺序、别踩哪些坑”

---

## checkpoint.json schema

推荐最小 schema：

```json
{
  "task_id": "TASK-0001",
  "phase": "implementing",
  "status": "implementing",
  "summary": "已完成 Windows restart recover 代码修改，待补 Dashboard 相邻回归验证",
  "current_focus": "补相邻模块回归检查并同步 Tauri server 镜像",
  "done_when": [
    "目标问题在功能验证层面确认修复",
    "reviewer verdict 不为 needs_changes / blocked"
  ],
  "completed_steps": [
    "定位 src/server.js / src/installer.js 的 restart 与状态检测链路",
    "完成主逻辑修改"
  ],
  "next_steps": [
    "执行 npm run prepare:tauri-server",
    "补 node --check",
    "更新 validation.json"
  ],
  "blockers": [],
  "artifacts": [
    "src/server.js",
    "src/installer.js"
  ],
  "related_runbooks": [
    "docs/RUNBOOKS/gateway-restart.md",
    "docs/RUNBOOKS/dashboard-url-detection.md",
    "docs/RUNBOOKS/tauri-server-sync.md"
  ],
  "rollback_anchor": {
    "baseline_commit": "7347d0a",
    "rollback_target": "7347d0a"
  },
  "blocked": {
    "is_blocked": false,
    "blocked_reason": "",
    "unblock_action": "",
    "owner": "",
    "reentry_condition": ""
  },
  "last_updated_by": "coder-agent",
  "last_updated_at": "2026-04-05T11:50:00+08:00"
}
```

---

## checkpoint 字段说明

### 必填核心字段
- `task_id`
- `phase`
  - 推荐值：`planning` / `implementing` / `validating` / `handoff` / `done`
- `status`
  - 当前最小任务状态枚举：
    - `queued`
    - `planning`
    - `implementing`
    - `awaiting_review`
    - `fixing`
    - `blocked`
    - `passed`
    - `rolled_back`
- `summary`
  - 一句话说明当前真实进度
- `current_focus`
  - 当前最重要的动作，不要写大而空
- `done_when`
  - 结构化完成条件；与 README 中的 `## done_when` 对齐
- `completed_steps`
  - 已完成步骤
- `next_steps`
  - 下一步 1-3 条最实际动作
- `blockers`
  - 卡点，没有就空数组
- `artifacts`
  - 当前阶段最相关的文件 / 产物 / 日志路径
- `related_runbooks`
  - 这轮任务依赖的 runbook
- `rollback_anchor`
  - 最小回退锚点：`baseline_commit` / `rollback_target`
- `blocked`
  - blocked 恢复闭环：`blocked_reason` / `unblock_action` / `owner` / `reentry_condition`
- `last_updated_by`
- `last_updated_at`

---

## rollback.md 模板

推荐模板：

```md
# Rollback Plan - TASK-0001

## 任务目标
- 一句话描述本轮任务目标

## 涉及改动
- 代码文件：
  - src/server.js
  - src/installer.js
- 任务文件：
  - tasks/TASK-0001/checkpoint.json
  - tasks/TASK-0001/validation.json

## 需要回退的触发条件
- 例：修复 Gateway restart 后，Dashboard 地址探测失效
- 例：Windows 测试包验证出现新的阻断问题

## 代码回退方法
### 未提交时
```bash
git checkout -- <files>
```

### 已提交时
```bash
git log --oneline -- <files>
git revert <commit>
```

## 状态/产物回退方法
- 删除错误测试包：`/tmp/clawbox-releases/...`
- 重新执行 `npm run prepare:tauri-server`
- 必要时重新生成 validation / checkpoint

## 回退后必须复检的项目
- node --check
- Tauri 镜像同步
- 受影响的相邻 runbook 检查

## 不应回退的内容
- 已确认正确的任务文档结构
- 与本任务无关的其他修复

## 回退后的下一步
- 回到哪个 checkpoint
- 重新验证哪几个最小步骤
```

---

## 生成与更新时机

### 1. 任务创建阶段
主 Agent 创建任务目录时，至少落：
- `README.md`
- `checkpoint.json`
- `rollback.md`
- `validation.json`

### 2. coder 开始执行前
更新 `checkpoint.json`：
- `status=planning` 或 `implementing`
- `current_focus`
- `done_when`
- `next_steps`
- `related_runbooks`

### 3. coder 每完成一个稳定小阶段后
更新 `checkpoint.json`：
- `completed_steps`
- `next_steps`
- `artifacts`
- `last_updated_at`

> 原则：**只在“可恢复点”更新 checkpoint**，不要每打一行代码就写一次。

### 4. 出现明显新风险时
更新 `rollback.md`：
- 补触发条件
- 补代码回退方法
- 补回退后复检项

### 5. reviewer 收口时
检查：
- `checkpoint.json` 是否能让下一个 agent 快速续接
- `rollback.md` 是否真的能指导回退
- `validation.json` 是否与 checkpoint 状态一致
- reviewer verdict 对状态流转的影响是否明确：
  - `pass` / `pass_with_followup` → 可进入 `passed`
  - `needs_changes` → 转 `fixing`
  - `blocked` → 转 `blocked`

### 6. 任务完成或交接时
- `checkpoint.json` 更新到 `status=passed`、`phase=handoff` 或 `done`
- `validation.json` 写实最终结果
- `handoff.md` 只在确实需要长文本时再补

---

## 主 Agent / coder / reviewer 的使用方式

### 主 Agent
负责：
- 创建任务骨架
- 设置初始状态（通常为 `queued` / `planning`）
- 续接时优先读取 `checkpoint.json` 与 `validation.json`
- 若出问题，优先看 `rollback.md`
- 当任务 blocked 时，根据 `owner` / `unblock_action` 决定派工与重新进入哪一状态

### coder agent（木匠）
负责：
- 在实现过程中更新 `checkpoint.json`
- 将状态推进到 `implementing` / `awaiting_review` / `fixing`
- 发现新风险时更新 `rollback.md`
- 完成检查后更新 `validation.json`
- 执行层面被卡住时填写 `blocked_reason` / `unblock_action`

### reviewer agent（机工）
负责：
- 判断 checkpoint 是否足够支持下一个人续接
- 判断 rollback 是否真实可执行
- 判断 validation 是否覆盖了相邻回归风险
- 通过 verdict 影响状态流转：`pass|pass_with_followup` / `needs_changes` / `blocked`

---

## 轻量检查建议

在 reviewer 收口前，可先运行：

```bash
npm run task:review-guard -- TASK-xxxx
```

它不是复杂审查系统，只做最小字段闭环检查，例如：
- `done_when` 是否仍是占位
- `checkpoint.status` 是否在允许枚举内
- `feature_validation` / `packaging_validation` 是否存在
- `evidence` 是否具备最小可信锚点
- `rollback.md` 是否有基本锚点
- `blocked` 状态下是否填写恢复条件

## 成功判定标准

- 新任务都能快速生成执行包
- 中途停下后，下个 agent 能通过 `checkpoint.json` 快速恢复
- 出问题时能按 `rollback.md` 回退，而不是靠猜
- `checkpoint` / `rollback` / `validation` 三者分工清晰，不互相污染

---

## 风险点与简化建议

### 风险点
1. checkpoint 写成流水账，信息量太低
2. rollback 写成空模板，遇事还是不会退
3. validation、checkpoint、handoff 内容重复
4. 想做成复杂状态机，结果没人维护

### 简化建议
1. checkpoint 只记录 **当前状态 + 下一步 + 卡点 + 关键产物**
2. rollback 只记录 **何时退 + 怎么退 + 退完查什么**
3. validation 保持只记录验证结果，不记录过程碎碎念
4. 每个任务先保证这 3 个文件可用，再考虑扩展
