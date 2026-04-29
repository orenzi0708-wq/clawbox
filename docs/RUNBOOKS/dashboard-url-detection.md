# Runbook: Dashboard URL Detection / Dashboard 地址探测

## 适用场景

用于修改或排查：

- “打开 OpenClaw 面板”按钮失效
- Gateway 明明在跑，但拿不到 Dashboard URL
- `port / token / url` 解析逻辑改动后需要回归验证

---

## 前置条件

- 仓库路径：`/root/clawbox`
- 能运行 `openclaw gateway status --json` / `--deep`
- 已安装依赖：`npm install`

---

## 涉及文件 / 目录

- `src/server.js`
  - `parseOpenclawDashboardUrlFromJson()`
  - `parseOpenclawDashboardUrlFromText()`
  - `parseGatewayPortFromText()`
  - `findGatewayPortInJson()`
  - `findGatewayTokenInJson()`
  - `buildOpenClawDashboardUrlFromParts()`
  - `/api/tools/openclaw-dashboard`
- `src/installer.js`
  - `inspectOpenClawState()`
- `public/js/app.js`
  - `openOpenclawDashboard()`

---

## 关键命令或操作步骤

### 1) 先看原生输出
```bash
openclaw gateway status --json
openclaw gateway status --deep
```

### 2) 再看项目探测链路
顺序必须是：
1. `inspectOpenClawState().gatewayStatus.data`
2. 补跑 `gateway status --json`
3. 再补 `gateway status --deep`
4. 最后才用 `port + token` 组 fallback URL

### 3) 改完后静态校验
```bash
cd /root/clawbox
node --check src/server.js
node --check public/js/app.js
npm run prepare:tauri-server
node --check src-tauri/server/src/server.js
```

---

## 成功判定标准

- 能优先拿到真实 URL
- 拿不到真实 URL 时，至少能拿到 port/token 并 fallback
- 拿不到时给出明确报错，而不是静默失败
- 按钮点击后能正确打开

---

## 常见失败现象

1. Gateway running，但报“未找到 Dashboard 地址”
2. 能拿到 port，拿不到 token
3. JSON 格式变了，旧解析器失效
4. 文本里其实有 URL，但 `parseOpenclawDashboardUrlFromText()` 没抓到

---

## 排查方法

1. 先保存 `--json` / `--deep` 原始输出
2. 核对当前解析顺序有没有被打乱
3. 检查是否把“gateway running”误当成“dashboard url available”
4. 检查 `public/js/app.js` 是否把后端错误吞了

---

## 回滚 / 恢复方法

```bash
cd /root/clawbox
git checkout -- src/server.js public/js/app.js src-tauri/server/src/server.js
```

---

## 与其他模块的关联风险

- `gateway-restart.md`
- `status-detection.md`
- 安装完成后的状态提示

---

## 需要同步更新的文档或文件

- `src-tauri/server/src/server.js`
- 若修改了 gateway status 的依赖语义，顺手更新 `gateway-restart.md`

---

## 待验证 / 待补充

- OpenClaw 多版本输出里 token 字段的稳定位置：**待持续补充**
