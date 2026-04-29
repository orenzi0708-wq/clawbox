# Handoff - TASK-9010

## 当前结论
- TASK-9010 已完成第一轮真实实战闭环：机工完成实现与功能验证，木匠完成独立审查与复核。
- 当前最终 reviewer 结论应为 **`pass_with_followup`**，不是 `needs_changes`。
- 本轮已经足够证明：当前 Linux 开发态 / 沙箱环境下，这条高耦合链路的主要功能风险已被收口到可接受范围；但 Windows 真机上的 restart recover 实流 smoke 与后续 packaging_validation 仍待后续关卡。

## 已完成
- 已在 `README.md` 中补实战任务目标、范围、done_when 与交付标准
- 已新增 `scripts/smoke-gateway-chain.js`，覆盖：
  - `isGatewayStatusRunning()` 的 running / not running 判定
  - Dashboard URL / port / token 的 JSON / text / fallback 解析
  - `/api/tools/openclaw-dashboard` 的 JSON payload 分支不再因为 dashboard URL token 文本里带 `running` 而误报 Gateway running
- 已修改 `src/server.js`，把 `/api/tools/openclaw-dashboard` 在 JSON payload 分支里的 running 判定收回到 `installer.isGatewayStatusRunning()`
- 已同步 `src-tauri/server/src/*`，并刷新 `src-tauri/server/public/js/app.js`、`src-tauri/server/package.json`
- 已执行：
  - `node --check src/server.js`
  - `node --check src/installer.js`
  - `node --check public/js/app.js`
  - `node --check scripts/smoke-gateway-chain.js`
  - `node scripts/smoke-gateway-chain.js`
  - `timeout 15s node -e "const {inspectOpenClawState}=require('./src/installer'); console.log(JSON.stringify(inspectOpenClawState(), null, 2));"`
  - `npm run prepare:tauri-server`
  - `node --check src-tauri/server/src/server.js`
  - `node --check src-tauri/server/src/installer.js`
  - `node --check src-tauri/server/public/js/app.js`
  - `npm run task:review-guard -- TASK-9010`
- 已完成任务包对齐：
  - 修正 `validation.json` 中 feature/regression 描述与实现一致
  - 修正 `handoff.md` 中对 dashboard 分支改动的表述
- 已由木匠完成最终复核，确认当前应以 `pass_with_followup` 收口
- 已提交 `1a19313`：修复安装 / 更新 / 卸载 SSE 分片解析，避免流式 JSON 半包触发 `Unterminated string in JSON...`；并为“打开 OpenClaw 面板”补 loading 与 tool log 反馈
- 已提交 `370c1c5`：为安装 / 更新 / 卸载 / Gateway 重启 / Dashboard 打开补 lifecycle burst refresh，并把 gateway permission / timeout 分层文案直接显示在状态区与工具页

## 未完成
- 尚未在 Windows 真机用最新代码回归验证这轮体验层修复：包括安装结果分层、状态自动刷新、Dashboard 打开响应与安装日志流解析
- 尚未进入 packaging_validation
- 当前 Linux 沙箱无法监听 `127.0.0.1:3456`，所以没有完成 API 级 live smoke

## 今晚新增产物
- 精简 source bootstrap 包已重新打好：`/tmp/clawbox-releases/ClawBox-source-bootstrap-v0.5.4-task9010-20260406-022249.zip`（19MB）
- 本次重新打包前，已清掉两个误打出来的 1.6GB 旧测试包和 `/tmp/ClawBox-source-bootstrap-*` 临时目录，避免磁盘再次被顶满
- 已补一轮 Windows 真机证据：
  - `openclaw.json` 已成功生成，当前为 `gateway.mode=local` 且 doctor 已改写为 `auth.mode=token`
  - 非管理员 PowerShell 下 `openclaw gateway install` 失败：`schtasks create failed: 拒绝访问`
  - Startup 文件夹为空，OpenClaw 声称的 Startup-folder fallback 未实际落地
  - `~/.openclaw/gateway.cmd` 存在且内容可执行；手动运行后 Gateway 能正常 ready
  - 管理员 PowerShell 下 `openclaw gateway install` 成功：`Installed Scheduled Task: OpenClaw Gateway`
  - 注册成功后 `openclaw gateway status --deep` 显示 `Service: Scheduled Task (registered)`、`RPC probe: ok`，且 ClawBox 能检测到网关运行

## 为什么停在这里
- 当前停点不是因为修复方向不成立，而是因为已经达到了“功能验证关可通过，但后续平台关仍待执行”的状态。
- 继续在当前 Linux / 沙箱环境里追加证据，收益已经明显下降；更有价值的下一步是转到 Windows 真机补实际 smoke。

## 接手建议顺序
1. 先读 `validation.json`
2. 再读 `checkpoint.json`
3. 再读 `rollback.md`
4. 再读 `README.md`
5. 再看 `scripts/smoke-gateway-chain.js`
6. 最后读相关 runbook：
   - `docs/RUNBOOKS/gateway-restart.md`
   - `docs/RUNBOOKS/status-detection.md`
   - `docs/RUNBOOKS/dashboard-url-detection.md`
   - `docs/RUNBOOKS/tauri-server-sync.md`
   - `docs/RUNBOOKS/bugfix-workflow.md`

## 关键文件
- `src/server.js`
- `src/installer.js`
- `public/js/app.js`
- `src-tauri/server/src/server.js`
- `src-tauri/server/src/installer.js`
- `scripts/smoke-gateway-chain.js`
- `tasks/TASK-9010/*`

## 关键风险
- 这条线高耦合，最容易出现：
  - 修 restart，带坏 status detection
  - 修 dashboard URL，带坏 running / ready 语义
- 当前最大风险已经收缩为：**Windows 真机上的 recoverWindowsGateway() 实流证据仍缺**
- 当前环境的 `openclaw gateway status` 存在 `uv_interface_addresses` / `spawn EPERM` 异常，因此 Linux live 证据不能替代 Windows 真机结果

## 建议下一步
- 不再把当前主因归咎于 gateway.cmd / node / dist 路径；这条线已被真机证据排除
- ClawBox 体验层 follow-up 已完成一轮代码修复，当前下一步改为 **Windows 真机回归验证**：
  - 安装结果分层与报错口径（区分 config/init 成功 与 gateway service 注册失败）
  - 网关状态变化后的局部自动刷新
  - “打开 OpenClaw 面板”按钮的响应速度 / loading 与 fallback 体验
  - 安装日志流式 JSON 分片解析是否已稳定消除 `Unterminated string in JSON at position...`
- 对 OpenClaw 本体层面的结论保持明确：非管理员 `gateway install` 权限失败后，当前 Startup-folder fallback 未真实落地
- packaging_validation 仍作为后续关卡保留，但不阻塞上述体验层回归验证
