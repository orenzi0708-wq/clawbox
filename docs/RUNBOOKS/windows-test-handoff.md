# Runbook: Windows Test Handoff / Windows 真机测试交接

## 适用场景

用于以下协作场景：

- Linux 环境已完成代码修改，但问题只可能在 Windows 真机上最终确认
- 需要给船长发测试包，并明确“测什么、怎么算过”
- 避免 Agent 在 Linux 里反复猜 Windows 到底修没修好

---

## 前置条件

- 代码已修改完成
- 已做最小静态校验
- 已同步 Tauri server 镜像
- 已产出测试包（参考 `package-test-bundle.md`）

---

## 涉及文件 / 目录

- `docs/RUNBOOKS/package-test-bundle.md`
- `docs/RUNBOOKS/tauri-server-sync.md`
- `projects/clawbox.md`
- `handoffs/*`
- `/tmp/clawbox-releases/*`

---

## 当前已确认的协作边界

1. ClawBox 的 Windows 问题，默认不要求 Linux 侧“证明真机一定成功”
2. 交付完成口径应是：
   - 代码改了
   - review 过了
   - 能做的静态验证做了
   - 测试包产出了
   - Windows 真机验收交给船长
3. 这不是偷懒，是避免在 Linux 里瞎猜 UI / 服务 / Windows 行为

---

## 关键命令或操作步骤

### 1) Linux 侧最小收口
```bash
cd /root/clawbox
node --check src/server.js
node --check src/installer.js
npm run prepare:tauri-server
```

### 2) 产出测试包
按 `package-test-bundle.md` 执行。

### 3) 交付给船长时至少说明 4 件事

- **测试包路径 / 文件名**
- **对应分支 / commit**
- **本轮修的点**
- **希望船长在 Windows 上重点验证什么**

推荐口径示例：

```text
测试包：/tmp/clawbox-releases/ClawBox-source-bootstrap-vX.Y.Z-xxx-YYYYMMDD-HHMMSS.zip
分支：fix/windows-followup-7347
commit：<hash>
重点验证：
1. restart Gateway 后状态是否自动恢复
2. Dashboard 按钮是否能打开真实地址
3. 安装完成后是否还需要手动刷新页面
```

---

## 成功判定标准

- 交付说明明确
- 船长知道要测什么
- 不把“静态通过”说成“Windows 已确认修复”
- 下轮对话能从包名 / commit / 测试点快速恢复上下文

---

## 常见失败现象

1. 发了包，但没写测什么
2. 只说“你试试看”，没有验收标准
3. 把 Linux 静态验证包装成“已修复”
4. 包名、commit、分支信息没给，后面全乱

---

## 排查方法

如果交接总是混乱，检查是否缺这三件：
- 包名
- commit
- Windows 验收点

少一个，后面都容易漂。

---

## 回滚 / 恢复方法

若包有问题：
- 删除错误测试包
- 重新按 `package-test-bundle.md` 打包
- 更新交付说明后再发

---

## 与其他模块的关联风险

- `gateway-restart.md`
- `dashboard-url-detection.md`
- `install-openclaw.md`
- `package-test-bundle.md`

---

## 需要同步更新的文档或文件

- `projects/clawbox.md`（若当前测试重点变化）
- `handoffs/*.md`（若需要给下轮 Agent 留明确接力点）

---

## 待验证 / 待补充

- 是否后续需要固定“Windows 验收 checklist”模板：**建议可以补，但本轮先不做重设计**
