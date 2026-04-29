# Runbook: Install OpenClaw / 安装 OpenClaw

## 适用场景

用于排查或修改 ClawBox 内的 OpenClaw 安装流程，尤其是：

- 安装过程卡住 / 很慢 / 误报失败
- Windows 安装阶段提示不清楚
- 安装完后状态没有正确刷新

---

## 前置条件

- 仓库路径：`/root/clawbox`
- 已安装依赖：`npm install`
- 若是 Windows 分支问题，最终仍需 Windows 真机验收

---

## 涉及文件 / 目录

- `src/installer.js`
  - 安装命令选择
  - 安装阶段通知 `report(...)`
  - 安装后 verify / gateway / dashboard 判定
- `src/server.js`
  - `/api/install`
- `public/js/app.js`
  - 安装流程展示 / 进度渲染
- `setup.sh`
- `setup.ps1`

---

## 当前已确认的关键事实

1. Windows 安装阶段已加入更细的阶段提示
2. Windows 安装 OpenClaw 时，当前实现会临时使用 `npmmirror`
3. 安装成功不等于交付成功，安装后还要看：
   - openclaw 是否被探测到
   - gateway 是否 ready/running
   - dashboard 是否可打开
   - clawhub 是否可用

---

## 关键命令或操作步骤

### 1) 先定位安装主流程
```bash
cd /root/clawbox
grep -n "install_openclaw\|install_clawhub\|install_gateway\|verify" src/installer.js src/server.js public/js/app.js
```

### 2) 修改时的最小原则
- 优先补安装阶段提示和验证链路
- 不要把安装结果只绑定到“命令返回 0”
- 安装结束后必须回到 `inspectOpenClawState()` 做最终判定

### 3) 改完后最小校验
```bash
cd /root/clawbox
node --check src/installer.js
node --check src/server.js
node --check public/js/app.js
npm run prepare:tauri-server
```

---

## 成功判定标准

- 安装阶段文案能反映当前真实阶段
- 安装结束后能探测到 openclaw 路径或版本
- 工具页状态不会停在旧状态
- Gateway / Dashboard / ClawHub 的后续状态有明确结果

---

## 常见失败现象

1. 安装命令执行了，但 UI 一直像卡死
2. 安装成功了，但状态仍显示未安装
3. 安装完 Gateway 不 ready
4. 安装完 Dashboard 仍打不开

---

## 排查方法

1. 先看 `src/installer.js` 的 `report(...)` 是否仍完整
2. 再看 `inspectOpenClawState()` 是否能读到安装结果
3. 再看前端 `public/js/app.js` 是否正确消费安装阶段与最终状态

---

## 回滚 / 恢复方法

```bash
cd /root/clawbox
git checkout -- src/installer.js src/server.js public/js/app.js src-tauri/server/src/installer.js src-tauri/server/src/server.js
```

---

## 与其他模块的关联风险

- `preinstall-cleanup-and-repair.md`
- `status-detection.md`
- `gateway-restart.md`
- `dashboard-url-detection.md`

---

## 需要同步更新的文档或文件

- `src-tauri/server/src/installer.js`
- `src-tauri/server/src/server.js`
- 如果安装后还要出测试包，更新 `package-test-bundle.md`

---

## 待验证 / 待补充

- Windows 安装慢的精确瓶颈占比：**仍待继续真机归因**
