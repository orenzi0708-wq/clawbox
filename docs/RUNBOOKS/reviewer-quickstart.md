# Runbook: Reviewer Quickstart / 机工审查启动卡

> 用途：给机工（reviewer）一张默认动作卡，避免 review 再次退化成“看一眼木匠结论就点头”。

---

## 1. 什么时候使用

以下场景默认使用本卡：
- bugfix 功能验证关收口
- reviewer 接手独立审查任务
- 主 Agent 让机工判断是否可过当前功能关

---

## 2. 默认读取顺序（不要跳）

1. `tasks/TASK-xxxx/README.md`
2. `tasks/TASK-xxxx/validation.json`
3. `tasks/TASK-xxxx/handoff.md`
4. diff / changed files
5. 相关 `docs/RUNBOOKS/*.md`
6. 必要时再看 `checkpoint.json` 或项目文档

> 原则：先看任务目标，再看验证，再看交接，再看代码事实，再看做法基线。

---

## 3. 机工必须回答的 8 个问题

### A. 任务目标
1. 当前修改是否真的解决了 spec 中的目标？
2. 是否偏离了 spec，或夹带了未声明的额外改动？

### B. 修改范围
3. 改动文件是否还在合理范围内？
4. 是否动到了不该动的相邻模块？

### C. 功能验证质量
5. `feature_validation` 是否完整可信？
6. regression / smoke 是否足够覆盖“修好了 A 又带坏了 B”的风险？

### D. 打包验证状态
7. `packaging_validation` 还是 pending 的话，理由是否合理、是否明确是后续关卡？

### E. 文档与续接
8. handoff / validation / rollback 是否足够支撑下一轮继续工作？

---

## 4. verdict 选择规则

### `pass`
- 本轮功能修复成立
- feature_validation 充分
- 没有明显遗留风险

### `pass_with_followup`
- 本轮功能修复成立
- 但后续仍有明确动作
- 最常见情况：`packaging_validation` 待后续平台关卡

### `needs_changes`
- 修复不足
- feature_validation 不可信或不完整
- 有明显回归风险
- scope 偏离 spec

### `blocked`
- 缺 spec / 缺 validation / 缺 diff / 缺关键输入
- 证据不足，当前无法给可靠结论

> 注意：**packaging pending 不能自动等于 needs_changes / blocked。**

---

## 5. 机工的最小输出要求

review 输出时至少明确写出：

1. **本轮功能修复是否通过**
2. **packaging_validation 是否仍待后续关卡**
3. **当前最大的回归风险是什么**
4. **如果不过，差的证据是什么**
5. **如果通过但要跟进，后续动作是什么**

---

## 6. 收口前的轻检查（推荐）

在正式给 verdict 前，先跑：

```bash
npm run task:review-guard -- TASK-xxxx
```

如果 guard 报缺项，优先先补基础闭环，再给最终审查结论。

---

## 7. 机工最容易犯的错

1. 只看木匠的自述，不看 diff
2. 只看 feature_validation，忽略相邻回归面
3. 因 packaging pending 就误判本轮不过
4. 因 feature_validation 通过就误以为全平台都通过
5. 不看 handoff，导致下轮续接依然断裂

---

## 8. 最小执行口径

如果时间很紧，至少做这 5 步：

1. 看 `README.md`
2. 看 `validation.json`
3. 跑 `task:review-guard`
4. 看 diff
5. 给 verdict，并明确：
   - 功能关是否通过
   - 打包关是否待后续
