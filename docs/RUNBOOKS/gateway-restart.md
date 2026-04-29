# Runbook: Gateway Restart / Gateway 状态恢复

## 适用场景

用于修改、排查或回归验证 **ClawBox 内部“重启 OpenClaw Gateway”能力** 时，尤其是以下情况：

- Windows 下 `openclaw gateway restart` 不稳定，需要走 ClawBox 自己的恢复链路
- 修复 restart 时，担心顺手改坏 **运行状态检测 / Dashboard 地址检测 / 安装后状态刷新**
- 重开对话后，需要快速恢复“这块到底怎么判定、怎么验证”的操作方法

> 当前项目事实：Windows 侧已经不是直接盲信 `openclaw gateway restart`，而是走 **inspect → 必要时 stop → 等端口释放 → start → 等健康恢复** 的 recover 链路。

---

## 前置条件

1. 本地已有 ClawBox 仓库：`/root/clawbox`
2. 已安装项目依赖：
   ```bash
   cd /root/clawbox
   npm install
   ```
3. 当前环境能调用 `openclaw`（至少在目标验证机上要能调用）
4. 若验证 Windows 分支，必须在 **Windows 真机** 做最终验收
5. 修改 `src/*` 后，如后续要测 Tauri 包，记得同步执行：
   ```bash
   npm run prepare:tauri-server
   ```

---

## 涉及文件 / 目录

### 核心实现
- `src/server.js`
  - `waitForGatewayHealthy()`
  - `recoverWindowsGateway()`
  - `/api/gateway/restart`
  - `/api/tools/openclaw-dashboard`
  - `parseOpenclawDashboardUrlFromJson()`
  - `parseOpenclawDashboardUrlFromText()`
  - `buildOpenClawDashboardUrlFromParts()`
  - `parseGatewayPortFromText()`
  - `findGatewayPortInJson()`
  - `findGatewayTokenInJson()`
- `src/installer.js`
  - `getGatewayStatusJson()`
  - `isGatewayStatusRunning()`
  - `inspectOpenClawState()`

### Tauri 镜像文件（必须同步）
- `src-tauri/server/src/server.js`
- `src-tauri/server/src/installer.js`

### 关联文档 / 历史线索
- `src-tauri/BUILD.md`
- `handoffs/2026-03-31-windows-macos-adaptation.md`
- `docs/RUNBOOKS/package-test-bundle.md`

---

## 当前已确认的关键事实

1. **Gateway 状态源头不在 `src/server.js`，而在 `src/installer.js` 的 `inspectOpenClawState()`**
   - `src/server.js` 的 restart / dashboard 接口都依赖它
2. `inspectOpenClawState()` 当前通过以下链路判断：
   - `probeOpenClawInstallation()` → 判断 openclaw 是否安装
   - `getGatewayStatusJson()` → 执行 `openclaw gateway status --json`
   - `isGatewayStatusRunning()` → 用 JSON 内 `rpc.ok`、`service.loaded + runtime.status=running` 等字段判断是否真正 running
3. **Windows restart 特殊处理在 `src/server.js -> recoverWindowsGateway()`**
   - 先 `inspectOpenClawState()`
   - 从 status JSON / 文本输出里解析 port
   - 若已 running 或端口上监听像 OpenClaw Gateway，则先 stop
   - `waitForPortState(port, true)` 等端口释放
   - 再 `openclaw gateway start`
   - 最后 `waitForGatewayHealthy()` 轮询恢复
4. **Dashboard 地址检测与 Gateway restart 是相邻模块，不是两件独立小事**
   - `/api/tools/openclaw-dashboard` 会复用 `inspectOpenClawState()` + `gateway status --json` + `gateway status --deep`
   - 修改 restart 或 running 判定时，很容易把 dashboard 打开能力一起带坏
5. 仓库里当前存在 **源码双份**：
   - 主运行文件：`src/*`
   - Tauri 镜像：`src-tauri/server/src/*`
   - 如果只改一份，后面桌面包会出现“源码版正常、Tauri 包还是旧逻辑”的典型错位

---

## 标准操作步骤

### A. 改之前先定位影响面

先看这些位置：

```bash
cd /root/clawbox

grep -n "recoverWindowsGateway\|waitForGatewayHealthy\|openclaw-dashboard\|api/gateway/restart" src/server.js

grep -n "inspectOpenClawState\|getGatewayStatusJson\|isGatewayStatusRunning" src/installer.js
```

如果本轮是排查 Windows restart，不要只盯 `/api/gateway/restart`，必须连着看：

- `recoverWindowsGateway()`
- `waitForGatewayHealthy()`
- `inspectOpenClawState()`
- `/api/tools/openclaw-dashboard`

---

### B. 修改最小闭环

优先只在以下边界内动：

1. **restart 调度层**：`src/server.js`
2. **状态探测层**：`src/installer.js`
3. **Dashboard URL 解析层**：`src/server.js`

避免一上来扩成：
- 重写安装逻辑
- 改一堆前端 UI
- 改 OpenClaw 本体 CLI 行为假设

推荐原则：

- 先保住 `inspectOpenClawState()` 输出结构稳定
- 再补 restart / dashboard 分支逻辑
- 不要把 `gatewayReady`、`gatewayRunning`、`dashboardUrl` 三个概念混成一个值

---

### C. 改完后立即同步 Tauri 镜像

```bash
cd /root/clawbox
npm run prepare:tauri-server
```

这一步会把：
- `src/server.js`
- `src/config.js`
- `src/installer.js`
- `public/*`

同步到 `src-tauri/server/` 下，并做一轮基础校验。

> 如果这一步没做，后续测试包经常会拿着旧逻辑去测，纯属自己坑自己。

---

### D. 本地最小静态校验

#### 1) Node 语法校验
```bash
cd /root/clawbox
node --check src/server.js
node --check src/installer.js
node --check scripts/prepare-tauri-server.js
node --check src-tauri/server/src/server.js
node --check src-tauri/server/src/installer.js
```

#### 2) 确认镜像文件已同步
```bash
cd /root/clawbox
git diff -- src/server.js src/installer.js src-tauri/server/src/server.js src-tauri/server/src/installer.js
```

理想状态：
- 改动同时出现在 `src/*` 与 `src-tauri/server/src/*`
- 没出现“主源码改了，镜像没变”的情况

---

### E. 必测相邻功能（这是本 runbook 的重点）

改完 restart 后，**至少验证以下相邻功能**：

#### 1) Gateway 运行状态检测
确认 `inspectOpenClawState()` 还能正确区分：
- 未安装
- 已安装但未 running
- running 且健康
- running 失败 / JSON 无法解析 / 仅有残留进程

#### 2) Dashboard 地址获取
检查 `/api/tools/openclaw-dashboard` 还能按以下顺序拿地址：
- 先读 `inspectOpenClawState().gatewayStatus.data`
- 不够时补 `openclaw gateway status --json`
- 还不够时补 `openclaw gateway status --deep`
- 最后才用 `port + token` 拼 fallback URL

#### 3) 安装后状态刷新
项目里已有“安装后自动刷新状态”的修补。改 restart / running 判定后，要确认不会出现：
- Gateway 已经起来，但 UI 仍显示未运行
- Dashboard 能打开，但工具页仍显示未就绪
- restart 成功后必须手动刷新页面才恢复状态

#### 4) Windows 端口释放链路
如果目标是 Windows：
- stop 后端口是否真的释放
- 端口没释放时是否返回监听进程摘要
- start 后是否真进入 `gatewayRunning=true`

---

## 成功判定标准

满足以下条件，才算这轮 restart 修改可交付：

1. `/api/gateway/restart` 返回成功时，后续状态能恢复为 ready
2. `inspectOpenClawState()` 的 `gatewayRunning` 仍能稳定反映真实状态
3. `/api/tools/openclaw-dashboard` 仍能拿到正确 URL / port / token，或在拿不到时给出明确报错
4. `npm run prepare:tauri-server` 通过
5. `src/*` 和 `src-tauri/server/src/*` 同步完成
6. 若本轮目标包含 Windows 修复，**已产出测试包交给真机验证**（Linux 本地静态验证不能替代 Windows 真机）

---

## 常见失败现象

### 现象 1：restart 看起来成功，但 UI 仍显示未运行
高概率原因：
- `isGatewayStatusRunning()` 判定条件被改坏
- `getGatewayStatusJson()` JSON 解析失败
- `waitForGatewayHealthy()` 轮询逻辑与状态字段不一致

### 现象 2：Gateway 已运行，但 Dashboard 按钮报“未找到 Dashboard 地址”
高概率原因：
- `/api/tools/openclaw-dashboard` 没从新输出格式里解析到 `url / port / token`
- restart 后状态结构改变，但 dashboard 解析逻辑没同步

### 现象 3：Windows stop 之后端口一直占用
高概率原因：
- 被 stale process 占着
- 监听进程不是当前预期的 OpenClaw Gateway
- `waitForPortState()` 等待时间不够

### 现象 4：源码版正常，Tauri 包还是旧问题
高概率原因：
- 忘了跑 `npm run prepare:tauri-server`
- 打包前镜像文件未同步

---

## 排查方法

### 1) 先看 openclaw 原生命令输出

```bash
openclaw gateway status --json
openclaw gateway status --deep
```

重点观察：
- JSON 能不能稳定解析
- 有没有真实 `port`
- 有没有真实 `token`
- 文本输出里是否出现 Dashboard URL

### 2) 用项目里的状态探测链路反推

优先检查：
- `getGatewayStatusJson()` 是否只拿到了 stderr / 空输出
- `isGatewayStatusRunning()` 是否过严或过松
- `inspectOpenClawState()` 是否因为 `configReady` / `gatewayReady` 组合逻辑把状态误判

### 3) Windows 端口占用排查

当前代码里 `getWindowsPortListeners()` 会用 PowerShell `Get-NetTCPConnection` + `Win32_Process` 查监听进程。

如果 restart 失败，优先看返回里的：
- `stage`
- `port`
- `listeners`
- `output`

这比只看一句“重启失败”有用得多。

### 4) 检查是否只改了一半代码

```bash
git diff -- src/server.js src/installer.js src-tauri/server/src/server.js src-tauri/server/src/installer.js
```

---

## 回滚 / 恢复方法

### 代码回滚
如果本轮改动还没提交：
```bash
cd /root/clawbox
git diff
git checkout -- src/server.js src/installer.js src-tauri/server/src/server.js src-tauri/server/src/installer.js
```

如果已经提交，用具体 commit 回退：
```bash
cd /root/clawbox
git log --oneline -- src/server.js src/installer.js
git revert <commit>
```

### 运行状态恢复
如果只是 Gateway 状态坏了，不一定要回滚代码，先做运行态恢复：

```bash
openclaw gateway status --deep
openclaw gateway stop
openclaw gateway start
openclaw gateway status --deep
```

如果是 Windows 场景且 stop 后端口不释放，先按监听进程排查，不要直接假设是 ClawBox 代码问题。

---

## 与其他模块的关联风险

1. **运行状态检测风险**
   - restart 改动最容易连带影响 `inspectOpenClawState()`
2. **Dashboard 打开能力风险**
   - port / token / url 解析与 restart 相邻，极易一起坏
3. **安装流程风险**
   - 安装阶段结束后也会依赖 gateway ready / dashboard ready 判断
4. **Tauri 包错位风险**
   - `src/*` 与 `src-tauri/server/src/*` 不同步，会造成“源码正常、打包版异常”
5. **Windows / 非 Windows 分支分叉风险**
   - Windows 用 recover 链路，其他平台仍直接 `gateway restart`；改动时别把两边逻辑混坏

---

## 需要同步更新的文档或文件

本 runbook 改动相关逻辑后，通常至少同步以下内容：

- `src-tauri/server/src/server.js`
- `src-tauri/server/src/installer.js`
- `docs/RUNBOOKS/package-test-bundle.md`（如果这轮还要出测试包）
- `projects/clawbox.md`（仅当项目阶段/已确认结论发生变化时）
- `handoffs/*.md`（仅当需要给下轮 Agent 留明确交接时）

---

## 待验证 / 待补充

1. **OpenClaw 不同版本 `gateway status --json` 的字段兼容面**：当前代码已做兼容式探测，但没有独立兼容矩阵文档，后续可补
2. **Windows 真机上的端口释放等待时长是否还需调优**：当前代码是 25s / 30s 量级，需继续真机验证
3. **`gatewayReady` 与 `gatewayRunning` 的 UI 使用边界**：代码里已有区分，但前端消费口径是否完全稳定，建议后续补一份状态字段说明

---

## 最轻量的执行口径（给下次对话快速恢复）

如果下次只想快速恢复这块，按这个顺序：

1. 看 `src/installer.js` 的 `inspectOpenClawState()` / `isGatewayStatusRunning()`
2. 看 `src/server.js` 的 `recoverWindowsGateway()` / `/api/gateway/restart`
3. 看 `src/server.js` 的 `/api/tools/openclaw-dashboard`
4. 改完后跑：
   ```bash
   npm run prepare:tauri-server
   node --check src/server.js
   node --check src/installer.js
   ```
5. 要交给船长测 Windows，就按 `docs/RUNBOOKS/package-test-bundle.md` 出测试包
