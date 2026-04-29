# Reviewer Brief - TASK-9010（机工）

## 你的任务
对 **TASK-9010** 做第一轮独立审查，目标不是复述木匠的自评，而是判断：

1. 本轮是否真的解决了当前功能关目标
2. 是否存在“修好了 Gateway restart，但带坏了 status / dashboard”的情况
3. `validation.json` 是否完整可信
4. 当前是否只是功能关通过，而 packaging 仍待后续关卡

---

## 你必须优先读取的文件
按这个顺序读：
1. `tasks/TASK-9010/README.md`
2. `tasks/TASK-9010/validation.json`
3. `tasks/TASK-9010/handoff.md`
4. diff / changed files
5. runbook：
   - `docs/RUNBOOKS/gateway-restart.md`
   - `docs/RUNBOOKS/status-detection.md`
   - `docs/RUNBOOKS/dashboard-url-detection.md`
   - `docs/RUNBOOKS/reviewer-independent-review.md`
   - `docs/RUNBOOKS/reviewer-quickstart.md`
6. 必要时再看 `checkpoint.json` / `rollback.md`

---

## 你必须重点检查的点

### A. 任务目标
- 当前修改是否真的围绕 `README.md` 中的任务目标展开？
- 有没有偏离 scope 或夹带额外改动？

### B. 回归风险
- `status-detection` 是否被检查？
- `dashboard-url-detection` 是否被检查？
- 有没有“主问题看似修了，但相邻模块被带坏”的迹象？

### C. validation 可信度
- `feature_validation` 是否完整？
- `checks_run` 是否像真实跑过？
- `evidence` 是否具备最小可信锚点？
- `open_issues` / `next_action` 是否明确？

### D. packaging 边界
- 如果 `packaging_validation` 仍是 pending，理由是否合理？
- 是否明确这是后续关卡，而不是漏测？
- 不要把“功能关通过”误写成“Windows 已完全通过”

---

## verdict 规则
你只能在这四种中选择：
- `pass`
- `pass_with_followup`
- `needs_changes`
- `blocked`

### 特别提醒
- **不要因为 packaging_validation 还是 pending 就自动否掉本轮功能修复**
- **也不要因为 feature_validation 通过，就默认后续平台验证不重要**

---

## 建议动作
正式给结论前，建议先跑：

```bash
npm run task:review-guard -- TASK-9010
```

并使用模板：

```text
tasks/_templates/reviewer-note.template.md
```

来组织你的审查输出。

---

## 你交付时至少要明确写出
1. 本轮功能修复是否通过
2. packaging_validation 是否仍待后续关卡
3. 当前最大的回归风险是什么
4. 缺失的关键证据是什么
5. 后续必须动作是什么
