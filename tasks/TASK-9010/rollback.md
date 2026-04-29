# Rollback Plan - TASK-9010

## 任务目标
- Windows Gateway restart / status detection / dashboard URL 收口实战任务

## 涉及改动
- 代码文件：
  - `src/server.js`
  - `src/installer.js`
  - `scripts/smoke-gateway-chain.js`
  - `src-tauri/server/src/server.js`
  - `src-tauri/server/src/installer.js`
  - `src-tauri/server/public/js/app.js`
  - `src-tauri/server/package.json`
- 任务文件：
  - `tasks/TASK-9010/README.md`
  - `tasks/TASK-9010/checkpoint.json`
  - `tasks/TASK-9010/validation.json`
  - `tasks/TASK-9010/rollback.md`
  - `tasks/TASK-9010/handoff.md`

## 需要回退的触发条件
- 修复 Gateway restart 后，`status-detection` 出现明显误判
- 修复 Dashboard URL 探测后，Gateway running / ready 语义被带坏
- 为了补 smoke 暴露测试导出后，如果出现运行时副作用或 Tauri 镜像与源码再次错位
- 第一轮功能验证显示本轮修改引入新的相邻回归问题，且短时间内无法稳定修正

## Rollback Anchor
- baseline_commit: a0f0ab3
- current_commit: working-tree
- rollback_target: a0f0ab3
- rollback_method: `git checkout -- <files>`（未提交）或 `git revert <commit>`（已提交）
- rollback_steps:
  1. 回退本轮涉及文件
  2. 重新执行 `npm run prepare:tauri-server`（如改动波及 `src/*` / `public/*`）
  3. 重新检查 `status-detection` / `dashboard-url-detection` / `gateway-restart` 相邻回归面
- post_rollback_checks:
  - `status-detection`
  - `dashboard-url-detection`
  - `gateway-restart`
  - `tauri-server-sync`

## 代码回退方法
### 未提交时
```bash
git checkout -- src/server.js src/installer.js scripts/smoke-gateway-chain.js src-tauri/server/src/server.js src-tauri/server/src/installer.js src-tauri/server/public/js/app.js src-tauri/server/package.json tasks/TASK-9010/README.md tasks/TASK-9010/checkpoint.json tasks/TASK-9010/validation.json tasks/TASK-9010/rollback.md tasks/TASK-9010/handoff.md
```

### 已提交时
```bash
git log --oneline -- src/server.js src/installer.js scripts/smoke-gateway-chain.js src-tauri/server/src/server.js src-tauri/server/src/installer.js src-tauri/server/public/js/app.js src-tauri/server/package.json
git revert <commit>
```

## 状态/产物回退方法
- 如果第一轮功能验证使用了临时样例或中间产物，回退时同步清理任务中的临时证据路径
- 如本轮已生成测试包或临时安装产物，记录到 `validation.evidence.artifacts` 后再决定是否删除

## 回退后必须复检的项目
- `status-detection` 是否恢复到基线行为
- `dashboard-url-detection` 是否恢复到基线行为
- `gateway-restart` 相关 runbook 中要求的最小相邻验证是否重做
- `validation.json` 是否已明确记录回退结论

## 不应回退的内容
- 已建立的任务执行包结构
- 已沉淀到 runbook 的稳定规则
- 与本任务无关的其他机制文档补丁

## 回退后的下一步
- 若回退后问题仍在，应重新回到 `planning`，补充最小复现与验证口径
- 若回退后仅是实现方案不稳，应回到 `implementing`，更换更保守的修复方式
