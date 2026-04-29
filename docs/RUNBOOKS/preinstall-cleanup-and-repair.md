# Runbook: Preinstall Cleanup & Repair / 安装前清场与修复安装环境

## 适用场景

用于处理这些典型问题：

- OpenClaw 安装报 `EBUSY`
- 有残留 wrapper / 旧进程 / 旧目录导致重装失败
- Windows 安装前需要先做“安装前清场”
- 想确认 ClawBox 当前的“修复安装环境”到底清了什么、没清什么

---

## 前置条件

- 仓库路径：`/root/clawbox`
- 已安装依赖：`npm install`
- 知道这一步是**低风险优先**的修复手段，不是无差别删除系统内容

---

## 涉及文件 / 目录

- `src/installer.js`
  - Windows cleanup target 收集
  - install failure hint
  - 环境修复报告逻辑
- `src/server.js`
  - `/api/tools/repair-environment`
- `public/index.html`
  - “安装前清场”按钮
- `public/js/app.js`
  - `repairEnvironment()`

---

## 当前已确认的关键事实

1. 项目里已经有“安装前清场 / 修复安装环境”入口
2. 当前策略不是无脑删一切，而是：
   - 优先清 OpenClaw 残留
   - 对 ClawHub 以扫描为主，不默认删掉
3. 当前逻辑已经有：
   - EBUSY 场景提示
   - Windows 残留扫描
   - busy / 权限 / 锁占用提示

---

## 关键命令或操作步骤

### 1) 先定位入口
```bash
cd /root/clawbox
grep -n "repair-environment\|EBUSY\|cleanup\|scan_only\|ClawHub" src/installer.js src/server.js public/js/app.js public/index.html
```

### 2) 修改原则
- 优先补报告质量，不要扩大删除范围
- 默认继续遵守：**OpenClaw 可清，ClawHub 先扫描不误删**
- 若遇到 busy residue，优先说明是谁占着，而不是直接硬删

### 3) 改完校验
```bash
cd /root/clawbox
node --check src/installer.js
node --check src/server.js
node --check public/js/app.js
npm run prepare:tauri-server
```

---

## 成功判定标准

- 用户能看懂“为什么建议先清场再装”
- 不会误删 ClawHub 或当前 ClawBox 自身进程树
- 能输出更像操作建议的报告，而不只是报错

---

## 常见失败现象

1. 清场后仍报 EBUSY
2. 日志显示删了，但实际残留还在
3. 修复环境按钮点了没反馈
4. 把不该删的工具也误删了

---

## 排查方法

1. 先看 cleanup report / recommendation
2. 看是否是 busy residue 而不是普通残留
3. Windows 场景优先确认是否有进程锁 / Defender / 权限影响
4. 确认当前逻辑仍在“只处理 OpenClaw 主残留”的安全边界内

---

## 回滚 / 恢复方法

```bash
cd /root/clawbox
git checkout -- src/installer.js src/server.js public/js/app.js public/index.html src-tauri/server/src/installer.js src-tauri/server/src/server.js
```

---

## 与其他模块的关联风险

- `install-openclaw.md`
- `status-detection.md`
- Node / ClawHub 卸载相关逻辑

---

## 需要同步更新的文档或文件

- `src-tauri/server/src/installer.js`
- `src-tauri/server/src/server.js`
- 若调整安装建议口径，更新 `install-openclaw.md`

---

## 待验证 / 待补充

- 不同 Windows 环境下 busy residue 分类准确率：**待继续真机验证**
