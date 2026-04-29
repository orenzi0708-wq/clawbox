# TASK-9010

## 任务目标
- Windows Gateway restart / status detection / dashboard URL 收口实战任务

## 背景
- 当前 ClawBox 的 Windows 跟进主线已经把 Gateway restart 从“直接依赖黑盒 restart”转向 recover 链路思路，但这条线仍未完全收口。
- 这条线天然高耦合：`gateway restart`、`status detection`、`dashboard-url-detection` 彼此容易互相带坏。
- 本任务将作为当前 Harness 系统的第一轮真实实战任务，验证：
  - 任务真相是否足够支撑续接
  - bugfix 两阶段流程是否能真正执行
  - reviewer 是否能独立识别回归风险

## 范围
- 包含：
  - Windows Gateway restart recover 链路相关问题的分析、实现、功能验证与回归检查
  - `status-detection`、`dashboard-url-detection` 作为相邻回归面的验证
  - 当前任务的 checkpoint / rollback / validation / handoff 更新
- 不包含：
  - 直接扩展成完整 Windows 发布流程
  - 全量平台打包验证
  - Node 卸载隔离问题的整体收口

## 相关文件
- `src/server.js`
- `src/installer.js`
- `public/js/app.js`
- `src-tauri/server/src/server.js`
- `src-tauri/server/src/installer.js`
- `scripts/prepare-tauri-server.js`

## 相关 runbook
- `docs/RUNBOOKS/gateway-restart.md`
- `docs/RUNBOOKS/status-detection.md`
- `docs/RUNBOOKS/dashboard-url-detection.md`
- `docs/RUNBOOKS/tauri-server-sync.md`
- `docs/RUNBOOKS/bugfix-workflow.md`
- `docs/RUNBOOKS/reviewer-independent-review.md`

## done_when
- [ ] Gateway restart 主流程在功能验证层面确认修复
- [ ] `status-detection` 相关回归检查已执行并结论明确
- [ ] `dashboard-url-detection` 相关回归检查已执行并结论明确
- [ ] `feature_validation` 已填写完整且证据字段具备最小可信锚点
- [ ] reviewer verdict 不为 `needs_changes` / `blocked`
- [ ] 若 `packaging_validation` 未开始，已明确标记 `pending_reason`

## 第一轮 Smoke 口径
- 最小可执行验证入口：`node scripts/smoke-gateway-chain.js`
- 当前 Linux 开发态要锁住的主链路：
  - `isGatewayStatusRunning()` 不会因为 Dashboard URL / token 文本里带有 `running` 而误判
  - Dashboard URL / port / token 能从 JSON / deep text / fallback URL 三层拿到
  - `src/*` 改动后已同步 `src-tauri/server/src/*`
- 当前不能拿 Linux 结果冒充 Windows：
  - Windows `recoverWindowsGateway()` 真正的 stop → 端口释放 → start → 健康恢复，仍需 Windows 真机 smoke
  - 本轮 Linux 仅提供解析与状态语义的最小可信锚点，不代表 Windows restart 已通过

## 交付标准
- 能给出本轮是否已通过功能验证关的明确结论
- 能明确指出是否仍需后续 Windows 真机 packaging / 安装验证
- 如果本轮不通过，也必须明确是哪里缺证据、缺检查、还是引入了相邻回归问题
