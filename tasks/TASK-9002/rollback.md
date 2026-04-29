# Rollback Plan - TASK-9002

## 任务目标
- 为当前项目的任务目录补齐最小可用执行包，重点包含 checkpoint 和 rollback 机制

## 涉及改动
- 代码文件：
  - `scripts/init-validation.js`
  - `package.json`
- 文档文件：
  - `docs/RUNBOOKS/task-execution-pack.md`
  - `docs/RUNBOOKS/task-validation.md`
- 模板文件：
  - `tasks/_templates/checkpoint.json.template`
  - `tasks/_templates/rollback.md.template`
  - `tasks/_templates/task.README.template.md`
- 样例任务：
  - `tasks/TASK-9002/*`

## 需要回退的触发条件
- 初始化脚本生成的任务骨架与当前项目协作方式不兼容
- checkpoint / rollback 模板过重，导致任务目录维护负担明显上升
- 新脚本误覆盖已有任务目录中的关键文件

## 代码回退方法
### 未提交时
```bash
git checkout -- package.json scripts/init-validation.js docs/RUNBOOKS/task-execution-pack.md docs/RUNBOOKS/task-validation.md tasks/_templates/checkpoint.json.template tasks/_templates/rollback.md.template tasks/_templates/task.README.template.md
rm -rf tasks/TASK-9002
```

### 已提交时
```bash
git log --oneline -- package.json scripts/init-validation.js docs/RUNBOOKS/task-execution-pack.md tasks/_templates
git revert <commit>
```

## 状态/产物回退方法
- 删除误生成的测试任务目录：`tasks/TASK-9002/`
- 若初始化脚本行为不合适，先回退脚本，再保留文档说明
- 若模板设计有问题，可仅回退模板，不必回退 validation 机制本身

## 回退后必须复检的项目
- `node --check scripts/init-validation.js`
- `npm run task:init-validation -- TASK-xxxx ...` 是否恢复到可接受行为
- `tasks/TASK-xxxx/` 是否仍至少能生成 `validation.json`

## 不应回退的内容
- 已经确认有价值的 runbook 总体方向
- 已建立的任务级 validation 思路
- “任务真相优先于长期记忆”的读取顺序规则

## 回退后的下一步
- 回到仅保留 `validation.json` 模板的状态
- 重新评估 checkpoint / rollback 是否应拆成纯模板、而不是初始化脚本默认生成
