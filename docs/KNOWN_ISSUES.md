# ClawBox Known Issues

> 记录当前项目中**已知但未完全收口**的问题、边界与待验证项。

## 1. Gateway restart / status detection / dashboard URL 高耦合

### 现象
- 修 Gateway restart 时，容易连带影响状态检测与 Dashboard URL 获取

### 当前结论
- 这三块必须视为相邻回归面，不应拆开盲修

### 当前处理方式
- 优先参考：
  - `docs/RUNBOOKS/gateway-restart.md`
  - `docs/RUNBOOKS/status-detection.md`
  - `docs/RUNBOOKS/dashboard-url-detection.md`

---

## 2. Linux 功能验证通过 ≠ Windows/macOS 通过

### 现象
- 容易把 Linux 云服务器上的开发态验证误解为全平台结论

### 当前结论
- Linux 功能验证只代表 **功能关** 的基础通过
- Windows/macOS 的打包 / 安装 / 真机行为应在后续 `packaging_validation` 阶段单独确认

---

## 3. 当前测试体系仍以轻量验证为主

### 现象
- 项目当前没有统一的 unit / integration / E2E test runner

### 当前结论
- 当前功能验证主要依赖：
  - `node --check`
  - 最小验证脚本 / smoke 步骤
  - runbook 驱动的 regression checks

### 说明
- 这不等于项目“不验证”，而是当前验证层还处于轻量结构化阶段

---

## 4. Tauri 开发态能力已存在，但统一 dev 启动口径仍待补强

### 现象
- 当前代码支持开发态 server root 探测
- 但 repo 中尚无统一、明确的 Tauri dev 启动工作流文档/脚本作为默认入口

### 当前结论
- Tauri dev 可以作为功能验证入口之一
- 但当前仍需进一步产品化和标准化

---

## 5. 测试包方法已沉淀，但仍需避免回到“先打包再验证”旧习惯

### 现象
- 测试包打包方式过去容易丢失
- 项目已补 runbook，但实践中仍可能习惯性先想打包

### 当前结论
- 默认策略应是：先功能验证，再打包验证
- 测试包方法以 `docs/RUNBOOKS/package-test-bundle.md` 为准

---

## 6. 任务续接稳定性仍依赖执行纪律

### 现象
- 虽然已建立 `checkpoint / rollback / validation / handoff`，但若任务执行中不更新这些文件，续接仍会掉上下文

### 当前结论
- 任务执行包是当前续接真相源，但需要在真实任务中持续使用，才能稳定发挥作用
