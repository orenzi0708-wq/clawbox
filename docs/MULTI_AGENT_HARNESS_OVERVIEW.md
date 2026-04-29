# ClawBox 多 Agent Harness 系统总览（当前最小可用版）

> 用途：给项目外部协作者快速理解当前 ClawBox 多 Agent Harness 系统的目录结构、任务机制、验证机制、审查机制，以及为什么这样设计。

---

## 1. 系统目标

当前这套多 Agent Harness 系统，核心目标不是“堆更多 agent”，而是解决以下真实问题：

1. **重开对话后容易丢上下文**
2. **修好了 A，又带坏了 B**
3. **具体操作方法容易散落在记忆、对话、handoff 里**
4. **reviewer 容易变成 coder 结论复读机**
5. **主 Agent 过度依赖长期记忆，导致续接不稳定**

因此，当前系统重点补的是：
- 固定读取顺序
- 任务级执行包
- runbook 沉淀
- validation 机制
- reviewer 独立审查
- benchmark / eval 集
- 项目真相从长期记忆迁移到 repo

---

## 2. 当前系统的角色分工

### 主 Agent
负责：
- 调度
- 拆解任务
- 决定读取顺序
- 决定是否进入下一阶段
- 负责整体收口

### 木匠（coder）
负责：
- 代码修改
- 更新 checkpoint / rollback / validation
- 跑功能验证
- 产出可续接的任务状态

### 机工（reviewer）
负责：
- 独立审查
- 不复述 coder 自评
- 检查 spec、diff、validation、runbook 是否一致
- 判断是否存在“修好了 A 但带坏了 B”
- 给出 `pass / pass_with_followup / needs_changes / blocked`

---

## 3. 当前最重要的设计原则

### 原则一：任务真相优先于长期记忆
续接任务或重开对话时，默认先读：

1. `tasks/TASK-xxxx/`
2. 相关 `docs/RUNBOOKS/`
3. 项目文档（ARCHITECTURE / DECISIONS / KNOWN_ISSUES）
4. 最后才补长期记忆

### 原则二：先功能验证，后打包验证
bugfix 当前采用两阶段：

#### 第一阶段：功能验证关
- 先生成 spec
- 先准备复现步骤 / 验证脚本 / smoke 步骤
- 修改代码
- 跑 feature validation
- reviewer 审查

#### 第二阶段：打包验证关
- 在功能验证通过后，再进入平台构建 / 安装 / 打包验证
- Windows/macOS/Linux 平台结果分别记录

### 原则三：reviewer 必须独立判断
reviewer 不应复述 coder 结论，而应基于：
- task spec
- validation.json
- handoff
- diff
- runbook
做独立判断。

### 原则四：长期记忆负责“经验”，repo 负责“真相”
长期记忆仍保留，但主要承载：
- 协作策略
- 调度经验
- 用户稳定偏好
- 高风险区域提醒

项目结构、任务状态、操作步骤、验证结果，应尽量沉淀到 repo。

---

## 4. 当前目录结构

### 4.1 workspace 规则层
```text
/root/.openclaw/workspace/
├── AGENTS.md
├── projects/
│   └── clawbox.md
└── skills/
    └── captain-workflow/
        └── SKILL.md
```

作用：
- 固定主 Agent 的读取顺序
- 固定 ClawBox 项目的真相优先级
- 固定项目续接策略

---

### 4.2 ClawBox repo 层
```text
/root/clawbox/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── KNOWN_ISSUES.md
│   ├── BENCHMARKS/
│   └── RUNBOOKS/
├── tasks/
│   ├── _templates/
│   └── TASK-xxxx/
├── scripts/
│   └── init-validation.js
└── package.json
```

作用：
- `docs/ARCHITECTURE.md`：项目结构真相
- `docs/DECISIONS.md`：稳定决策
- `docs/KNOWN_ISSUES.md`：已知问题与边界
- `docs/RUNBOOKS/`：操作方法、排查、回退、工作流
- `tasks/TASK-xxxx/`：当前任务真相
- `docs/BENCHMARKS/`：benchmark / eval 集

---

## 5. 当前任务级执行包

每个任务目录推荐结构：

```text
tasks/TASK-xxxx/
├── README.md
├── checkpoint.json
├── rollback.md
├── validation.json
├── handoff.md
└── artifacts/
```

### 各文件职责

#### `README.md`
任务 spec / 背景 / 范围 / 交付标准

#### `checkpoint.json`
记录：
- 当前阶段
- 当前 focus
- 已完成步骤
- 下一步
- blockers
- 相关 runbook

#### `rollback.md`
记录：
- 什么时候需要回退
- 回退哪些改动
- 如何回退
- 回退后复检什么

#### `validation.json`
记录：
- 已执行检查
- 功能验证结果
- 打包验证状态
- reviewer 结论
- 风险与后续动作

#### `handoff.md`
记录：
- 为什么停在这里
- 下一个人先看什么
- 当前关键风险
- 接手建议顺序

---

## 6. validation 机制（当前版本）

当前 `validation.json` 已升级为**两阶段结构**。

### 6.1 feature_validation
用于记录当前 bugfix 的功能验证结果，包括：
- 已跑检查
- regression checks
- smoke checks
- 是否通过功能关

### 6.2 packaging_validation
用于记录后续打包验证状态，包括：
- Linux / Windows / macOS 各自状态
- 当前是否 pending
- 为什么 pending

### 关键点
- **feature_validation 通过 ≠ 全平台发布通过**
- **packaging_validation pending 不应自动否决当前功能修复**
- reviewer 必须分开判断这两层

---

## 7. bugfix 工作流（当前版本）

### 第一阶段：功能验证关（默认优先）
1. 生成任务 spec 和任务骨架
2. 准备最小复现或验证脚本 / smoke 步骤
3. 修改代码
4. 运行 feature validation
5. 运行 regression checks / smoke checks
6. reviewer 独立审查
7. 产出结构化 validation 结果

### 第二阶段：打包验证关（后续关卡）
1. 功能验证通过后进入
2. 按平台分别记录构建 / 安装 / 打包验证
3. Windows/macOS/Linux 结果分开，不混淆

### 当前策略边界
- Linux 云服务器是主开发与基础验证环境
- Windows/macOS 的打包验证是后续阶段
- 当前不要求先打包再判断 bugfix 是否成立

---

## 8. reviewer 独立审查机制

reviewer 默认读取顺序：
1. 当前任务的 spec / README
2. 当前任务的 validation.json
3. 当前任务的 handoff.md
4. 当前任务的 diff / changed files
5. 相关 runbook
6. 必要时再读 checkpoint 或项目文档

reviewer 必查问题：
- 是否真的解决了任务目标
- 是否偏离 spec
- 是否修改了不该动的范围
- feature_validation 是否完整可信
- regression checks 是否覆盖相邻风险
- packaging_validation pending 是否理由合理
- 是否需要后续平台验证
- 是否有必要更新 runbook / known issues / architecture notes

reviewer 当前 verdict：
- `pass`
- `pass_with_followup`
- `needs_changes`
- `blocked`

---

## 9. runbook 机制

当前 `docs/RUNBOOKS/` 已承接高频、易忘、重复使用的具体操作方法。

已沉淀的 runbook 包括：
- Gateway restart
- 状态检测
- Dashboard URL 探测
- OpenClaw 安装
- 安装前清场 / 修复环境
- Tauri server 同步
- 测试包打包
- Windows 真机交接
- task validation
- task execution pack
- task handoff
- bugfix workflow
- reviewer checklist
- reviewer 独立审查

### runbook 的职责
- 写“怎么做”
- 写“怎么查”
- 写“怎么回退”
- 写“怎么验证”

而不是继续把这些操作步骤放在 MEMORY 或聊天记录里。

---

## 10. 项目真相迁移策略

当前已经开始把原本容易留在长期记忆中的项目真相迁移到 repo：

### 已新增的项目真相文档
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/KNOWN_ISSUES.md`

### 迁移后的职责边界

#### 长期记忆保留
- 调度经验
- 协作策略
- 用户偏好
- 高风险区域提醒

#### repo 承担
- 项目结构真相
- 稳定决策
- 已知问题
- 操作方法
- 当前任务状态
- 验证结果

---

## 11. benchmark / eval 机制

当前已建立最小可用 benchmark 集，重点不是测“会不会写代码”，而是测：
- 能不能接住上轮任务
- 能不能不被旧记忆带偏
- 能不能正确使用 runbook
- handoff 是否可续接
- validation 是否完整可信
- reviewer 是否能识别回归风险
- 两阶段 bugfix 流程是否被正确执行

当前 benchmark 文档位置：
- `docs/BENCHMARKS/README.md`
- `docs/BENCHMARKS/suite.md`
- `docs/BENCHMARKS/_templates/result.json.template`

---

## 12. 当前系统的最小价值总结

这套系统当前最重要的价值，不是“agent 数量变多了”，而是：

1. **任务状态有固定落点**：`tasks/TASK-xxxx/`
2. **具体操作有固定落点**：`docs/RUNBOOKS/`
3. **项目真相开始从 MEMORY 迁回 repo**：`ARCHITECTURE / DECISIONS / KNOWN_ISSUES`
4. **reviewer 从复述者变成独立质量关口**
5. **bugfix 流程明确区分功能关与打包关**
6. **benchmark 机制开始形成评估闭环**

换句话说，当前系统的重点是：
**让多 Agent 协作更稳定、更可续接、更不容易在重开对话后失真。**

---

## 13. 当前仍保留的边界与限制

为了保持最小可用，当前系统**有意没有**做成重型平台，例如：
- 没有复杂任务状态机
- 没有完整自动化评测平台
- 没有完整 unit / integration / E2E 基础设施
- 没有自动把所有任务结果写回长期记忆

当前策略是：
- 先把高价值流程和文档结构钉住
- 再逐步补自动化
- 避免系统过重导致维护成本失控

---

## 14. 建议外部协作者重点先看哪几份文档

如果是第一次接触当前系统，建议先按这个顺序看：

1. 本文档：`docs/MULTI_AGENT_HARNESS_OVERVIEW.md`
2. `docs/DECISIONS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/RUNBOOKS/README.md`
5. `docs/RUNBOOKS/bugfix-workflow.md`
6. `docs/RUNBOOKS/reviewer-independent-review.md`
7. 任意一个真实 `tasks/TASK-xxxx/` 样例目录

这样最快能理解这套系统目前是怎么组织起来的。
