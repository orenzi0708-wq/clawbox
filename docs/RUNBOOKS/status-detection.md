# Runbook: Status Detection / 状态检测

## 适用场景

用于排查或修改 ClawBox 的以下状态判断：

- OpenClaw 是否已安装
- Gateway 是否“可启动” vs “正在运行”
- ClawHub CLI 是否可用
- 安装后工具页 / 首页为什么显示不对

---

## 前置条件

- 仓库路径：`/root/clawbox`
- 已安装依赖：`npm install`
- 能读取以下文件：
  - `src/installer.js`
  - `src/server.js`
  - `public/js/app.js`

---

## 涉及文件 / 目录

### 核心状态源头
- `src/installer.js`
  - `probeOpenClawInstallation()`
  - `getGatewayStatusJson()`
  - `isGatewayStatusRunning()`
  - `inspectOpenClawState()`
  - `resolveClawHubBinary()`
  - `probeClawHubAvailability()`

### API 消费层
- `src/server.js`
  - lifecycle 状态组装
  - `/api/tools/status`

### 前端显示层
- `public/js/app.js`
  - 首页状态展示
  - 工具页状态展示

---

## 当前已确认的核心口径

1. **状态源头以 `inspectOpenClawState()` 为准**
2. 项目里至少区分三类状态：
   - OpenClaw installed
   - Gateway ready
   - Gateway running
3. `gatewayReady` 和 `gatewayRunning` 不是一回事：
   - `gatewayReady` = 已具备启动条件 / 已探测到必要状态
   - `gatewayRunning` = 当前真的 running
4. ClawHub 状态既有：
   - 探测可用性
   - 首次启动自动准备 bootstrap 状态

---

## 关键命令或操作步骤

### 1) 快速定位状态逻辑
```bash
cd /root/clawbox
grep -n "inspectOpenClawState\|isGatewayStatusRunning\|probeOpenClawInstallation\|probeClawHubAvailability" src/installer.js
grep -n "/api/tools/status\|gatewayReady\|gatewayRunning" src/server.js public/js/app.js
```

### 2) 修改状态逻辑时的最小检查
- 先改 `src/installer.js`
- 再看 `src/server.js` 有没有依赖字段名 / 语义
- 再看 `public/js/app.js` 是否把 ready / running 混用了

### 3) 改完后的静态校验
```bash
cd /root/clawbox
node --check src/installer.js
node --check src/server.js
node --check public/js/app.js
npm run prepare:tauri-server
node --check src-tauri/server/src/installer.js
node --check src-tauri/server/src/server.js
```

---

## 成功判定标准

- 工具页能正确区分：未安装 / 已安装未运行 / 已运行
- 首页文案不会把 `gatewayReady` 误当 `gatewayRunning`
- ClawHub 可用性和 bootstrap 状态不会互相覆盖
- `src/*` 与 `src-tauri/server/src/*` 已同步

---

## 常见失败现象

### 现象 1：Gateway 明明没跑，UI 却显示“已安装并运行”
高概率是 `isGatewayStatusRunning()` 过松。

### 现象 2：Gateway 已经起来了，UI 还显示“未运行”
高概率是：
- `getGatewayStatusJson()` 没解析到 JSON
- `isGatewayStatusRunning()` 过严
- 前端把 ready / running 搞混

### 现象 3：ClawHub 已安装，但 UI 仍显示不可用
高概率是 `resolveClawHubBinary()` / `probeClawHubAvailability()` 路径探测没跟上。

---

## 排查方法

1. 先看 `inspectOpenClawState()` 返回结构是否稳定
2. 再看 `src/server.js` 是否把字段重新包装错了
3. 最后看 `public/js/app.js` 展示口径

优先顺序别反，不然容易在前端补丁上兜圈子。

---

## 回滚 / 恢复方法

```bash
cd /root/clawbox
git checkout -- src/installer.js src/server.js public/js/app.js src-tauri/server/src/installer.js src-tauri/server/src/server.js
```

若已提交，用 `git revert <commit>`。

---

## 与其他模块的关联风险

- `gateway-restart.md`
- `dashboard-url-detection.md`
- `install-openclaw.md`
- `preinstall-cleanup-and-repair.md`

状态检测几乎是这些 runbook 的底座，别随手改。

---

## 需要同步更新的文档或文件

- `src-tauri/server/src/installer.js`
- `src-tauri/server/src/server.js`
- 若影响 Gateway 语义，更新 `gateway-restart.md`
- 若影响 Dashboard，更新 `dashboard-url-detection.md`

---

## 待验证 / 待补充

- 前端所有状态文案是否已完全与 `inspectOpenClawState()` 对齐：**待持续验证**
- OpenClaw 多版本 JSON 字段兼容矩阵：**待补充**
