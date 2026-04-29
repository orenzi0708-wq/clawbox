# Runbook: Reviewer Independent Review / Reviewer 独立审查

## 适用场景

用于当前项目的 reviewer agent / 主 Agent 在 **bugfix 第一阶段：功能验证关** 做独立审查。

目标不是复述 coder 的自评，而是基于：
- task spec
- validation.json
- handoff
- diff / changed files
- 相关 runbook
- 固定 rubric

做出**独立判断**。

> 核心要求：
> - reviewer 必须把 **“本轮功能修复是否成立”** 与 **“跨平台打包验证是否已完成”** 分开判断
> - packaging_validation 仍为 pending 时，不能自动否决本轮功能修复
> - 但也不能因为 feature_validation 通过，就假装后续平台/打包验证不重要

---

## 建议的 reviewer rubric

reviewer 至少从以下六个维度独立审查：

### A. 任务目标
- 本次修改是否真的解决了 spec 中的目标问题？
- 是否偏离了 spec？
- 是否夹带了未声明的额外改动？

### B. 修改范围
- 修改的文件是否在合理范围内？
- 是否越过本轮 scope？
- 是否改到了不该碰的模块？

### C. 功能验证质量
- 是否先准备了复现步骤、最小验证脚本，或至少明确的 smoke 步骤？
- `feature_validation` 是否完整？
- regression checks 是否覆盖目标问题及相邻风险？
- smoke checks 是否覆盖受影响功能？
- 是否存在“修好了 A，但带坏了 B”的迹象？

### D. validation.json 质量
- 字段是否完整？
- checks_run 是否像真实跑过，而不是空话？
- `open_issues` / `next_action` 是否明确？
- `feature_validation` 与 `packaging_validation` 是否正确区分？

### E. 打包验证状态
- 如果 `packaging_validation` 还是 pending，理由是否合理？
- 是否明确写成后续关卡，而不是漏测？
- 是否错误地把“Linux 功能验证通过”表述成“全平台已通过”？

### F. 文档与沉淀
- 本轮是否需要更新 runbook？
- 是否需要补 decision log / known issues / architecture notes？
- handoff 是否足以支持下一轮续接？

---

## reviewer 的默认输入清单（固定读取顺序）

reviewer 默认按以下顺序读取：

1. **当前任务的 `spec.md` / `README.md`**
2. **当前任务的 `validation.json`**
3. **当前任务的 `handoff.md`**
4. **当前任务相关 diff / changed files summary**
5. **相关 runbook**
6. **必要时再读 `checkpoint.json` 或项目文档**

### 说明
- `README.md` / spec 是目标真相
- `validation.json` 是验证真相
- `handoff.md` 是长文本补充
- diff 是事实边界
- runbook 是做法基线
- `checkpoint.json` 与项目文档是补充，不应先于上述核心输入

---

## reviewer 输出模板

建议 reviewer 输出采用以下结构：

```json
{
  "verdict": "pass_with_followup",
  "task_goal_status": {
    "status": "met",
    "notes": "本轮目标问题已在功能验证层面解决"
  },
  "scope_check": {
    "status": "within_scope",
    "notes": "修改集中在 src/server.js 与相邻状态检测模块，未见明显越界"
  },
  "feature_validation_assessment": {
    "status": "sufficient",
    "notes": "feature_validation 已覆盖目标问题与相邻回归项"
  },
  "packaging_validation_assessment": {
    "status": "pending_but_expected",
    "notes": "当前阶段按流程尚未进入打包验证，理由明确且合理"
  },
  "regression_risk": {
    "level": "medium",
    "notes": "Windows 真机与后续 packaging_validation 仍需补充"
  },
  "missing_evidence": [
    "尚无 Windows 真机 packaging validation 结果"
  ],
  "required_followups": [
    "功能验证通过后，进入按平台 packaging_validation"
  ],
  "documentation_updates_needed": [
    "无需新增 runbook；后续若新增平台差异，再补充现有文档"
  ],
  "summary": "本轮功能修复在当前验证边界内成立，可通过功能关，但后续仍需进入打包验证关。"
}
```

---

## 各 verdict 的判定标准

### 1. `pass`
适用条件：
- 任务目标已达成
- 修改范围合理
- feature_validation 充分
- 无明显未覆盖的相邻回归风险
- packaging_validation 即使未开始，也不影响本轮“功能修复已完成”的结论，且没有重要遗漏

适用语义：
- **本轮功能关通过，且当前没有明显遗留风险**

---

### 2. `pass_with_followup`
适用条件：
- 本轮功能修复基本成立
- feature_validation 已通过或基本充分
- 但仍存在明确后续动作，例如：
  - packaging_validation 待做
  - Windows/macOS 平台验证待做
  - 少量文档沉淀待补

适用语义：
- **本轮功能关通过，但后续还有清晰的非阻断动作**

> 这是当前项目在“先功能验证，后打包验证”策略下最常用的 verdict。

---

### 3. `needs_changes`
适用条件：
- 本轮修复尚不足以证明目标问题解决
- validation 不完整或不可信
- 有明显“修好 A 但带坏 B”的风险或证据
- 修改范围偏离 spec

适用语义：
- **当前不能过功能关，需要回去补代码或补验证**

---

### 4. `blocked`
适用条件：
- 缺 spec / 缺 validation / 缺 diff / 缺关键输入
- 测试不可运行
- 依赖条件不满足
- 证据不足，reviewer 无法做可靠判断

适用语义：
- **不是说一定错了，而是当前无法给出可靠结论**

当 reviewer 给出 `blocked` 时，必须同时明确：
- `blocked_reason`
- `unblock_action`
- `owner`
- `reentry_condition`

并推动任务状态进入 `blocked`，等待主 Agent 调度恢复。

---

## 与当前两阶段 bugfix 流程的衔接方式

### 第一阶段：功能验证关
reviewer 在本阶段主要判断：
- 本轮是否达成 **功能修复通过**
- feature_validation 是否足够可信
- 是否存在相邻回归问题

### 第二阶段：打包验证关
reviewer 不要求在第一阶段就把 packaging_validation 做完。
但 reviewer 必须明确指出：
- packaging_validation 当前是 `pending` 还是 `not_started`
- 这是**流程设计使然**还是**验证遗漏**
- 后续是否仍需要进入打包验证关

### 明确分离原则
reviewer 输出时必须分开表达：
1. **本轮是否完成功能修复**
2. **是否已经完成发布前跨平台打包验证**

这两件事不能混为一谈。

---

## reviewer 默认关注的固定问题清单

每次至少回答这些问题：

1. 这次是否真的解决了 spec 里的问题？
2. 改动范围是否合理？
3. validation 是真实可信，还是只是 coder 自述？
4. regression checks 是否覆盖最容易连带受影响的模块？
5. packaging_validation pending 是否合理、是否清楚？
6. 下一个人接手时，文档是否足够？

---

## 需要新增或修改的规则、skill、模板或文档

本 runbook 建议配套：
- `docs/RUNBOOKS/bugfix-workflow.md`
- `docs/RUNBOOKS/reviewer-checklist.md`
- `docs/RUNBOOKS/task-validation.md`
- `tasks/_templates/validation.json.template`

如后续要进一步增强 reviewer agent，可再补：
- reviewer 专用 prompt 模板
- task review guard 脚本

但本轮先不引入重型系统。

---

## 最小执行口径

reviewer 每次收到 bugfix 审查任务时，默认流程：

1. 读 `README.md` / spec
2. 读 `validation.json`
3. 读 `handoff.md`
4. 看 diff / changed files
5. 读相关 runbook
6. 可先运行：`npm run task:review-guard -- TASK-xxxx`
7. 按固定 rubric 给 verdict
8. 明确写：
   - 功能关是否通过
   - packaging_validation 是否仍待后续关卡

推荐配套使用：
- `docs/RUNBOOKS/reviewer-quickstart.md`
- `tasks/_templates/reviewer-note.template.md`
