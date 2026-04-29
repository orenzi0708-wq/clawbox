# ClawBox Benchmark Suite

## 1. benchmark 设计原则

1. **聚焦真实高频问题**：优先测当前项目最容易反复出错的区域。
2. **每项都能明确判定**：必须给出通过标准与失败信号。
3. **优先测系统可靠性，不只测代码能力**：特别关注续接、handoff、review、runbook 使用、记忆误导。
4. **与当前流程兼容**：以 task 目录、validation、checkpoint、rollback、reviewer、runbook 为主要观测点。
5. **默认先测功能验证阶段**：打包验证仅作为后续单独关卡，不与功能关混淆。

---

## 2. benchmark 列表（10 个）

## B-001 跨对话续接：bugfix 任务恢复
- **benchmark_id**: `B-001`
- **benchmark_name**: 跨对话续接 - bugfix 恢复能力
- **测试目标**: 验证主 Agent 在重开对话后，能优先读取任务真相继续 bugfix，而不是先依赖长期记忆。
- **前置条件**:
  - 存在 `tasks/TASK-xxxx/README.md`
  - 存在 `checkpoint.json` / `validation.json` / `handoff.md`
- **输入材料**:
  - 当前任务目录
  - 相关 runbook
- **执行步骤**:
  1. 模拟“继续上次 Gateway bugfix”
  2. 检查 Agent 读取顺序
  3. 检查是否正确恢复下一步动作
- **预期输出**:
  - 明确引用 task 文件中的当前状态
  - 给出与 checkpoint/validation 一致的下一步
- **通过标准**:
  - 优先读取 task 文件
  - 未把旧 MEMORY 当当前事实
- **失败信号**:
  - 先引用长期记忆旧结论
  - 忽略 validation / checkpoint
- **对应能力**:
  - 跨对话续接能力
  - 任务真相优先读取能力

---

## B-002 跨对话续接：打包方法恢复
- **benchmark_id**: `B-002`
- **benchmark_name**: 跨对话续接 - 测试包打包方法恢复
- **测试目标**: 验证重开对话后，Agent 能从 runbook 恢复测试包做法，而不是凭记忆编造步骤。
- **前置条件**:
  - `docs/RUNBOOKS/package-test-bundle.md` 存在
- **输入材料**:
  - package test bundle runbook
- **执行步骤**:
  1. 要求 Agent 说明或执行测试包打包方法
  2. 检查是否读取 runbook
- **预期输出**:
  - 以 runbook 为依据说明 staging / zip / 验证步骤
- **通过标准**:
  - 引用固定 runbook 做法
- **失败信号**:
  - 使用记忆中不一致的旧命令
  - 漏掉产物验证
- **对应能力**:
  - runbook 使用率
  - 记忆去中心化

---

## B-003 bugfix 稳定性：Gateway restart 修复
- **benchmark_id**: `B-003`
- **benchmark_name**: Gateway restart bugfix 功能关
- **测试目标**: 验证系统能按“先功能验证、后打包验证”处理 Gateway restart 修复。
- **前置条件**:
  - gateway restart 相关 runbook 完整
  - task validation 两阶段结构可用
- **输入材料**:
  - `gateway-restart.md`
  - `status-detection.md`
  - `dashboard-url-detection.md`
- **执行步骤**:
  1. 创建 bugfix 任务
  2. 填写 feature_validation
  3. reviewer 独立审查
- **预期输出**:
  - feature_validation 覆盖 restart / status / dashboard
  - packaging_validation 保持 pending 且理由清晰
- **通过标准**:
  - 没把功能关与打包关混淆
- **失败信号**:
  - 修 restart 但没检查 status / dashboard
  - packaging pending 被误判为功能失败
- **对应能力**:
  - bugfix 稳定性
  - 两阶段流程执行能力

---

## B-004 回归风险：修好 A 又带坏 B（restart → status）
- **benchmark_id**: `B-004`
- **benchmark_name**: 回归识别 - restart 修好但 status detection 被带坏
- **测试目标**: 验证 reviewer 能识别“修好了 restart，但带坏了 status detection”。
- **前置条件**:
  - 构造一个 validation 看似通过，但漏掉 status regression 的任务样例
- **输入材料**:
  - spec
  - diff
  - validation
  - reviewer rubric
- **执行步骤**:
  1. reviewer 按默认输入顺序审查
  2. 输出 verdict
- **预期输出**:
  - reviewer 指出 regression coverage 不足
- **通过标准**:
  - verdict 为 `needs_changes` 或明确指出功能验证不足
- **失败信号**:
  - 仅因 coder 自述而通过
- **对应能力**:
  - reviewer 独立审查有效性
  - 回归引入识别能力

---

## B-005 回归风险：修好 Dashboard 但误判 Gateway running
- **benchmark_id**: `B-005`
- **benchmark_name**: 回归识别 - Dashboard 修复带坏 running 判定
- **测试目标**: 验证 reviewer 和 validation 能覆盖 Dashboard 与 Gateway running 的相邻风险。
- **前置条件**:
  - dashboard-url-detection runbook 存在
- **输入材料**:
  - spec
  - validation
  - diff
- **执行步骤**:
  1. 检查 validation 中是否包含 running vs dashboard 区分
  2. reviewer 判断是否缺失关键证据
- **预期输出**:
  - reviewer 不会把“拿到 URL”直接视为“Gateway 状态正确”
- **通过标准**:
  - 明确要求相邻回归验证
- **失败信号**:
  - 忽略 Gateway running 语义
- **对应能力**:
  - reviewer 判断质量
  - bugfix 正确率

---

## B-006 validation 完整性检查
- **benchmark_id**: `B-006`
- **benchmark_name**: validation.json 完整性与可信度
- **测试目标**: 验证 validation 是否结构完整、状态清晰、已做和未做事项分明。
- **前置条件**:
  - `validation.json` 采用当前模板
- **输入材料**:
  - `validation.json`
  - reviewer checklist
- **执行步骤**:
  1. 检查 feature_validation / packaging_validation 是否区分
  2. 检查 checks_run / open_issues / next_action
- **预期输出**:
  - validation 结构齐全
- **通过标准**:
  - 字段完整
  - packaging pending 理由清楚
- **失败信号**:
  - 把 Linux 功能通过写成全平台通过
  - checks_run 与实际不符
- **对应能力**:
  - validation 完整性
  - reviewer 证据判断能力

---

## B-007 handoff 可续接性
- **benchmark_id**: `B-007`
- **benchmark_name**: handoff 是否足够支持下一轮继续工作
- **测试目标**: 验证 handoff 能否让下一个 Agent 在不看长聊天记录的情况下继续任务。
- **前置条件**:
  - `handoff.md` 存在
  - checkpoint / validation 存在
- **输入材料**:
  - `handoff.md`
  - `checkpoint.json`
  - `validation.json`
- **执行步骤**:
  1. 模拟另一位 Agent 接手
  2. 检查是否能恢复当前结论、风险、下一步
- **预期输出**:
  - 接手顺序明确
  - 当前停点明确
- **通过标准**:
  - 下一步能直接落地
- **失败信号**:
  - 仍需翻聊天记录才能判断当前状态
- **对应能力**:
  - handoff 质量
  - 续接稳定性

---

## B-008 runbook 使用率检查
- **benchmark_id**: `B-008`
- **benchmark_name**: runbook 是否真正被使用
- **测试目标**: 验证 Agent 处理高频操作时，是否优先使用 runbook，而不是凭长期记忆。
- **前置条件**:
  - 对应 runbook 已存在
- **输入材料**:
  - 任务描述
  - runbook
- **执行步骤**:
  1. 发起一个高频操作请求（如 restart、package-test-bundle）
  2. 检查是否读取 runbook
- **预期输出**:
  - 步骤与 runbook 一致
- **通过标准**:
  - 明确体现 runbook 依赖
- **失败信号**:
  - 漏掉关键步骤
  - 依赖 MEMORY 旧口径
- **对应能力**:
  - runbook 使用率
  - 记忆误导控制能力

---

## B-009 长期记忆与项目文档冲突
- **benchmark_id**: `B-009`
- **benchmark_name**: 长期记忆与 repo 真相冲突处理
- **测试目标**: 验证主 Agent 在长期记忆与项目文档冲突时，能优先信 repo 真相，并在无法确认时标记待验证。
- **前置条件**:
  - 存在一条旧记忆式说法
  - repo 文档已有更新结论
- **输入材料**:
  - MEMORY 摘要（旧）
  - `docs/DECISIONS.md` / `RUNBOOKS` / task 文件（新）
- **执行步骤**:
  1. 给出冲突信息
  2. 观察 Agent 选择依据
- **预期输出**:
  - 优先采用 task / runbook / project docs
- **通过标准**:
  - 不被旧记忆带偏
- **失败信号**:
  - 把长期记忆当当前事实
- **对应能力**:
  - 长期记忆误导率
  - 读取优先级执行能力

---

## B-010 reviewer 结论质量
- **benchmark_id**: `B-010`
- **benchmark_name**: reviewer verdict 是否正确区分功能关与打包关
- **测试目标**: 验证 reviewer 能在 packaging pending 时，正确给出 `pass_with_followup` 而不是误判。
- **前置条件**:
  - validation 里 feature_validation = passed
  - packaging_validation = pending with reason
- **输入材料**:
  - spec
  - validation
  - handoff
  - reviewer rubric
- **执行步骤**:
  1. reviewer 输出 verdict
  2. 检查输出结构
- **预期输出**:
  - verdict、feature assessment、packaging assessment 分开
- **通过标准**:
  - 不因 packaging pending 自动否决功能修复
- **失败信号**:
  - 直接给 blocked/needs_changes 且理由只是未打包
- **对应能力**:
  - reviewer 判定质量
  - 两阶段流程理解能力

---

## 3. benchmark 分层（快速 / 完整）

## A. 快速基线测试（高频运行）
适合在以下改动后运行：
- 修改读取规则
- 修改 handoff 模板
- 修改 reviewer rubric
- 修改 validation 模板
- 修改 bugfix workflow

建议包含：
- `B-001` 跨对话续接：bugfix 任务恢复
- `B-002` 跨对话续接：测试包打包方法恢复
- `B-006` validation 完整性检查
- `B-008` runbook 使用率检查
- `B-010` reviewer verdict 区分功能关与打包关

## B. 完整稳定性测试（重要改动后运行）
适合在以下改动后运行：
- 修改主 Agent 记忆策略
- 调整多 Agent 协作流程
- 修改 bugfix/reviewer 主流程
- 调整任务真相优先级规则

建议包含：
- `B-003` Gateway restart bugfix 功能关
- `B-004` 回归识别：restart → status
- `B-005` 回归识别：Dashboard → running 判定
- `B-007` handoff 可续接性
- `B-009` 长期记忆与项目文档冲突
- `B-010` reviewer 结论质量

---

## 4. 评估维度

建议使用以下维度：

1. **任务完成率**
2. **bugfix 正确率**
3. **回归引入率**
4. **跨对话续接成功率**
5. **handoff 可续接性**
6. **validation 完整性**
7. **reviewer 判定质量**
8. **runbook 使用率**
9. **长期记忆误导率**
10. **需要人工接管的频率**

---

## 5. 结果记录格式建议

建议每次 benchmark 结果记录为单独 JSON：

```json
{
  "benchmark_id": "B-001",
  "run_type": "quick",
  "status": "pass",
  "task_or_fixture": "TASK-9005",
  "evidence": [
    "优先读取 validation.json",
    "正确引用 runbook"
  ],
  "fail_signals": [],
  "metrics": {
    "runbook_used": true,
    "memory_misled": false,
    "human_intervention_needed": false
  },
  "summary": "成功按任务真相恢复任务上下文。",
  "recorded_at": "2026-04-05T13:00:00+08:00"
}
```

---

## 6. 推荐目录结构

```text
docs/
  BENCHMARKS/
    README.md
    suite.md
    _templates/
      result.json.template
    results/
      B-001-*.json
      B-002-*.json
```

---

## 7. 最小可用落地方案

本轮最小落地建议：
1. 建立 `docs/BENCHMARKS/` 目录
2. 固化 benchmark 总清单 `suite.md`
3. 提供 benchmark 结果模板 `result.json.template`
4. 后续先手工记录 benchmark 结果，不做重型平台
5. 先优先运行快速基线集，再视重要改动运行完整集

---

## 8. 风险点与注意事项

1. **不要做成大而全评测平台**：当前只需要高价值小集合。
2. **不要只测“能不能写代码”**：重点测续接、review、runbook、validation、记忆误导。
3. **不要把功能关与打包关混在一起**：benchmark 本身也必须遵守两阶段逻辑。
4. **不要让 benchmark 依赖难以维护的复杂 fixture**：先用真实任务目录和轻量样例驱动。
5. **冲突无法判定时，允许 `blocked`**：不要为了出结果而强行判 pass/fail。
