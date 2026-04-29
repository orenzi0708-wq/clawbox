# ClawBox Benchmarks

> 目标：用一组 **高价值、低负担、可重复运行** 的 benchmark，验证多 Agent Harness 优化后是否真的更稳定、更可续接、更不容易“修好了 A 又带坏了 B”。

## 设计原则

1. **少而准**：优先覆盖高频、高风险、真实问题，不追求大而全。
2. **以当前项目真实场景为中心**：优先围绕 Gateway、状态检测、测试包、任务续接、reviewer、runbook 使用来设计。
3. **通过标准必须明确**：每个 benchmark 必须能判定 pass / fail / blocked，不写模糊目标。
4. **优先复用现有机制**：任务目录、runbook、validation、reviewer、读取顺序规则都应被纳入 benchmark。
5. **区分快速基线与完整稳定性测试**：高频改动先跑轻量基线，关键流程调整后再跑完整集。
6. **优先考系统稳定性，不只考写代码能力**：
   - 能不能接住上轮任务
   - 能不能不被旧记忆带偏
   - 能不能正确使用 runbook
   - 能不能留下高质量 handoff / validation
   - 能不能防回归

## 当前目录

- `suite.md` — benchmark 总清单与通过标准
- `_templates/result.json.template` — benchmark 结果模板
- `results/` — benchmark 结果记录目录

## 推荐运行方式

### 快速基线测试
适合：
- 修改读取规则后
- 修改 handoff / validation 模板后
- 修改 reviewer rubric 后
- 修改 bugfix workflow 后

### 完整稳定性测试
适合：
- 修改主 Agent 记忆策略后
- 修改多 Agent 协作方式后
- 修改 bugfix 工作流 / reviewer 工作流 / runbook 主结构后
- 重要项目机制收口前
