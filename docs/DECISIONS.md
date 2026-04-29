# ClawBox Decisions

> 记录当前项目中已经形成、应优先以 repo 文档为准的重要决策。

## D-001 任务真相优先于长期记忆

### 决策
续接任务、新任务、重开对话时，默认优先读取：
1. `tasks/TASK-xxxx/*`
2. 相关 `docs/RUNBOOKS/*.md`
3. 项目文档
4. 最后才补长期记忆

### 原因
- 长期记忆容易带旧结论
- 任务状态与验证结果本质属于 repo 真相

### 影响
- 当前任务结论应优先写入 task 文件
- 长期记忆退回背景层与调度经验层

---

## D-002 先功能验证，后打包验证

### 决策
当前 bugfix 流程采用两阶段：
1. **feature_validation**
2. **packaging_validation**

默认不要求先打包再判断 bugfix 是否成立。

### 原因
- Linux 云服务器是当前主开发与基础验证环境
- 功能问题与打包/安装问题不应混在同一关卡

### 影响
- reviewer 必须区分：
  - 本轮功能修复是否通过
  - 打包验证是否仍待后续关卡
- `validation.json` 必须显式区分 `feature_validation` / `packaging_validation`

---

## D-003 reviewer 必须独立审查

### 决策
reviewer 不应复述 coder 自评，而应基于：
- spec
- validation
- handoff
- diff
- runbook

进行独立判断。

### 原因
- 防止“修好 A 又带坏 B”
- 防止验证描述与实际检查不一致

### 影响
- reviewer 有固定输入顺序
- reviewer 有固定 verdict：
  - `pass`
  - `pass_with_followup`
  - `needs_changes`
  - `blocked`

---

## D-004 打包验证 pending 不自动否决功能修复

### 决策
如果 `packaging_validation` 仍是 pending，但理由清楚、且当前仍处于功能验证关，则 reviewer **不应自动否决本轮 bugfix**。

### 原因
- 当前流程明确先过功能关，再进打包关
- 否则会把两阶段设计重新打回一锅粥

### 影响
- reviewer 常用 verdict 会是 `pass_with_followup`
- 但 reviewer 仍需明确后续 packaging 关卡不可省略

---

## D-005 handoff 不是长期知识库

### 决策
handoff 只服务当前任务续接，不承担长期项目真相存储。

### 原因
- handoff 易碎、时效性强
- 不适合承载稳定操作方法与项目结构真相

### 影响
- 稳定操作方法 → `docs/RUNBOOKS/`
- 稳定项目结构 → `docs/ARCHITECTURE.md`
- 已知长期问题 → `docs/KNOWN_ISSUES.md`
