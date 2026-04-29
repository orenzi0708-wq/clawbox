# Coder Brief - TASK-9010（木匠）

## 你的任务
围绕 **Windows Gateway restart / status detection / dashboard URL** 这条高耦合链路，完成第一轮**功能验证关**工作。

本轮重点不是先打包，也不是先追求 Windows 全平台结论，而是：
- 先把问题边界收清楚
- 先做最小复现或明确 smoke 步骤
- 先完成功能验证与相邻回归检查
- 再把结果结构化写回任务文件

---

## 你必须优先读取的文件
按这个顺序读：
1. `tasks/TASK-9010/README.md`
2. `tasks/TASK-9010/checkpoint.json`
3. `tasks/TASK-9010/validation.json`
4. `tasks/TASK-9010/rollback.md`
5. `tasks/TASK-9010/handoff.md`
6. 相关 runbook：
   - `docs/RUNBOOKS/gateway-restart.md`
   - `docs/RUNBOOKS/status-detection.md`
   - `docs/RUNBOOKS/dashboard-url-detection.md`
   - `docs/RUNBOOKS/tauri-server-sync.md`
   - `docs/RUNBOOKS/bugfix-workflow.md`

---

## 本轮目标
你需要完成以下事情：

### 1. 先补最小复现或明确 smoke 步骤
至少回答清楚：
- 当前要验证的 restart 场景是什么
- status detection 怎么判断被带坏
- dashboard-url-detection 怎么判断被带坏

### 2. 如需修改代码，只在合理范围内动
优先关注：
- `src/server.js`
- `src/installer.js`
- 必要时 `public/js/app.js`
- 如改了源码层，记得同步 `src-tauri/server/src/*`

### 3. 完成功能验证关
至少补齐：
- `feature_validation.checks_run`
- `feature_validation.regression_checks`
- `feature_validation.smoke_checks`
- `evidence.commit_sha`
- `evidence.environment`
- `evidence.commands_run`

### 4. 更新任务执行包
你至少要更新：
- `checkpoint.json`
- `validation.json`
- 如风险边界变化，更新 `rollback.md`
- 如停点有变化，更新 `handoff.md`

---

## 严格约束

### 不要做的事
- 不要默认先打包
- 不要把 Linux 功能验证写成 Windows 已通过
- 不要只修主问题，不补相邻回归检查
- 不要改到明显超出 spec 的范围

### 必须做到的事
- 功能验证与打包验证分开写
- 如果本轮没进入 packaging_validation，就保持 pending，并说明原因
- 如果发现问题无法继续，更新 `checkpoint.blocked` 结构

---

## 你交付时至少要给出的结果
1. 本轮是否完成了功能验证关
2. 哪些相邻回归项已检查
3. 哪些仍待后续（尤其 Windows 真机 / packaging）
4. 当前最大风险是什么
5. 下一步建议是什么

---

## 交付前自检
交付前建议至少跑：

```bash
npm run task:review-guard -- TASK-9010
```

如果 guard 报关键字段缺失，先补齐再交。
