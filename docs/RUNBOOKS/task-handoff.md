# Runbook: Task Handoff / 任务交接

## 适用场景

用于 `tasks/TASK-xxxx/` 在以下场景下的交接：

- coder 做到一半，需要主 Agent / reviewer 接手
- 主 Agent 要把当前任务重新派给另一个 coder
- 本轮先到一个稳定点，后续重开对话再继续

这份 handoff 的定位是：**补充长文本上下文**。

不是替代：
- `checkpoint.json`
- `rollback.md`
- `validation.json`

而是补它们装不下的说明。

---

## 与其他任务文件的分工

### `checkpoint.json`
回答：
- 现在做到哪
- 下一步是什么
- 当前卡点是什么

### `rollback.md`
回答：
- 出问题怎么退

### `validation.json`
回答：
- 跑了哪些检查
- 哪些过了
- 哪些还没过

### `handoff.md`
回答：
- 为什么会这样拆
- 当前判断依据是什么
- 哪些坑不要再踩一遍
- 下一个接手的人应该先看什么

---

## 推荐模板结构

```md
# Handoff - TASK-0001

## 当前结论
- 一句话总结当前状态

## 已完成
- 本轮已做完的关键动作

## 未完成
- 当前还没做完的部分

## 为什么停在这里
- 当前停点的原因

## 接手建议顺序
1. 先读 checkpoint.json
2. 再读 validation.json
3. 再读 rollback.md
4. 再读相关 runbook

## 关键文件
- src/server.js
- src/installer.js

## 关键风险
- 最容易踩的坑

## 建议下一步
- 给下一个 agent 的 1-3 条最优先动作
```

---

## 什么时候生成 / 更新

### 需要生成的场景
- 任务中断但需要后续续接
- 要切换 agent
- 本轮已经形成明确但不短的交接说明

### 不必强制生成的场景
- 任务很短
- `checkpoint + rollback + validation` 已足够
- 没有额外解释价值

---

## 成功判定标准

- 下一个 agent 读完 handoff 后，不需要再翻长聊天记录
- handoff 不重复堆砌 checkpoint / validation 内容
- handoff 能明确告诉接手者“先看什么、别踩什么”

---

## 风险点与简化建议

### 风险点
1. handoff 写成聊天记录摘要，太长太散
2. handoff 和 checkpoint / validation 重复
3. 什么任务都强制写 handoff，最后维护成本高

### 简化建议
1. handoff 只在**确实需要长文本交接**时才创建
2. handoff 重点写“判断依据、停点原因、接手顺序、别踩的坑”
3. 能用结构化文件表达的内容，尽量不要再重复写进 handoff
