# Runbook: Reviewer Checklist / 审查清单

## 适用场景

用于 reviewer / 主 Agent 在 bugfix 收口时快速检查：
- spec 是否清楚
- 修复是否只解决表面问题
- A 修好后有没有带坏 B
- validation 是否把“功能验证”和“打包验证”混在一起
- 本轮是否已达成功能修复、但打包验证仍待后续阶段

---

## reviewer 默认输入顺序

1. `README.md` / spec
2. `validation.json`
3. `handoff.md`
4. diff / changed files
5. 相关 runbook
6. 必要时再读 `checkpoint.json` 或项目文档

---

## 必查项

### 1. spec / 任务目标
- `README.md` 是否写清目标和范围？
- 当前 diff 是否超出 spec 边界？
- 是否存在未声明的额外改动？

### 2. checkpoint
- `checkpoint.json` 是否能让下一个 agent 续接？
- `next_steps` 是否具体，而不是空话？

### 3. rollback
- `rollback.md` 是否真的写了触发条件和回退方法？
- 是否说明回退后要复检什么？

### 4. validation
- `feature_validation.status` 是否明确？
- `feature_validation.checks_run` 是否是真实跑过的检查？
- `feature_validation.regression_checks` 是否覆盖相邻风险？
- `feature_validation.smoke_checks` 是否说明环境和结果？
- `packaging_validation` 是否与 `feature_validation` 区分开？
- `open_issues` / `next_action` 是否明确？

### 5. 平台边界
- Linux 通过是否被错误表述成 Windows/macOS 通过？
- 未做的平台验证是否明确标 pending？
- packaging pending 是流程性后续项，还是其实漏测？

### 6. 相邻模块
- 当前 bugfix 对哪些相邻模块有影响？
- validation 是否已经覆盖这些回归检查？
- 是否有“修好 A 但带坏 B”的迹象？

### 7. verdict 口径
- `reviewer_result` 是否和 validation 内容一致？
- `risk_level` 是否合理？
- 当前应判 `pass` / `pass_with_followup` / `needs_changes` / `blocked` 哪一种？
- 是否明确区分：
  - 功能验证是否已通过
  - 打包验证是否仍待后续关卡

---

## 最低通过标准

至少满足：
1. spec 清楚
2. checkpoint 可续接
3. rollback 可回退
4. feature_validation 清楚
5. packaging_validation 没冒充已完成
6. reviewer 结论与 open_issues 一致
7. reviewer 明确分开写出：功能修复结论 vs 打包验证结论
