# Runbook: Tauri Server Sync / Tauri 服务镜像同步

## 适用场景

用于任何修改了以下内容后的同步动作：

- `src/server.js`
- `src/installer.js`
- `src/config.js`
- `public/*`

也就是：**只要源码逻辑或前端资源改了，且后续要打包/出测试包/验证桌面版，就应该看这份。**

---

## 前置条件

- 仓库路径：`/root/clawbox`
- 已安装依赖：`npm install`

---

## 涉及文件 / 目录

- `scripts/prepare-tauri-server.js`
- `src/*`
- `public/*`
- `src-tauri/server/package.json`
- `src-tauri/server/src/*`
- `src-tauri/server/public/*`

---

## 当前已确认的关键事实

1. 仓库已经有正式同步脚本：
   ```bash
   npm run prepare:tauri-server
   ```
2. 该脚本会：
   - 复制 `src/server.js` / `config.js` / `installer.js`
   - 复制 `public/*`
   - 生成 `src-tauri/server/package.json`
   - 校验关键文件是否存在
3. 如果后续要做 Tauri build 或测试包，**不跑这一步就是高危漏项**

---

## 关键命令或操作步骤

### 1) 标准同步命令
```bash
cd /root/clawbox
npm run prepare:tauri-server
```

### 2) 同步后检查
```bash
find /root/clawbox/src-tauri/server/src -maxdepth 1 -type f | sort
find /root/clawbox/src-tauri/server/public -maxdepth 2 -type f | head -100
```

### 3) 语法校验
```bash
cd /root/clawbox
node --check src-tauri/server/src/server.js
node --check src-tauri/server/src/installer.js
```

---

## 成功判定标准

- `src-tauri/server/src/` 下存在：
  - `server.js`
  - `config.js`
  - `installer.js`
- `src-tauri/server/public/` 已刷新
- 无校验报错

---

## 常见失败现象

1. 源码修好了，Tauri 包还是旧问题
2. `src-tauri/server/src/` 缺文件
3. `src-tauri/server/package.json` 没更新
4. build 时才发现镜像没同步

---

## 排查方法

1. 先确认有没有跑 `npm run prepare:tauri-server`
2. 再确认脚本执行后有没有报 missing
3. 对比 `src/*` 与 `src-tauri/server/src/*`

---

## 回滚 / 恢复方法

如果镜像同步错了，最简单就是修正 `src/*` 后重新跑：
```bash
cd /root/clawbox
npm run prepare:tauri-server
```

---

## 与其他模块的关联风险

- `package-test-bundle.md`
- `gateway-restart.md`
- `status-detection.md`
- 任何 Tauri build / 桌面包验证

---

## 需要同步更新的文档或文件

- 若同步脚本行为改变，更新本 runbook
- 若打包口径变化，更新 `package-test-bundle.md`

---

## 待验证 / 待补充

- 是否需要把更多校验固化到脚本里：**可后续再加，但本轮先保持轻量**
