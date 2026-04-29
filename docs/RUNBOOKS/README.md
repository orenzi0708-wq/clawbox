# ClawBox Runbooks

这套 runbook 的目标很简单：**下次重开对话时，先看项目文档就能恢复关键做法**，而不是靠长期记忆、旧聊天记录、临时猜测。

## 使用原则

1. **先看任务级真相，再看 runbook**
   - 推荐顺序：`tasks/TASK-xxxx/spec|README` → `checkpoint` → `validation.json` → `handoff` → 相关 runbook
2. 只在现有项目真实实现范围内操作，不凭空脑补不存在的脚本或流程
3. 遇到没有被当前项目充分验证的地方，要明确标记 **待验证 / 待补充**
4. 代码改完后，优先同步 `src/*` 与 `src-tauri/server/src/*`
5. Windows 真机问题，Linux 侧只能做静态校验和出测试包，**最终以真机验收为准**
6. 若任务文件、runbook、项目文档、长期记忆冲突，优先级为：
   - **任务文件 > runbook > 项目文档 > 长期记忆**

## 与项目文档的分层

- `docs/ARCHITECTURE.md`：项目结构真相、模块关系、开发态/打包态边界
- `docs/DECISIONS.md`：已经形成的稳定决策与规则
- `docs/KNOWN_ISSUES.md`：已知问题、边界、待验证项
- `docs/RUNBOOKS/`：具体操作步骤、排查步骤、回退步骤、工作流执行方法

## 当前目录

### 运行 / 状态 / 诊断
- `gateway-restart.md` — Gateway restart / recover 链路
- `status-detection.md` — OpenClaw / Gateway / ClawHub 状态检测口径
- `dashboard-url-detection.md` — Dashboard URL / port / token 探测链路

### 安装 / 修复
- `install-openclaw.md` — OpenClaw 安装流程与验证
- `preinstall-cleanup-and-repair.md` — 安装前清场 / 修复安装环境

### 打包 / 构建 / 交付
- `package-test-bundle.md` — source bootstrap 测试包打包
- `tauri-server-sync.md` — `prepare-tauri-server` 同步口径

### 验收 / 协作
- `windows-test-handoff.md` — Windows 真机测试交接口径

## 推荐阅读顺序（按任务）

### 修 Gateway / 状态检测
1. `status-detection.md`
2. `gateway-restart.md`
3. `dashboard-url-detection.md`
4. `tauri-server-sync.md`
5. `package-test-bundle.md`

### 出测试包给船长验证
1. `tauri-server-sync.md`
2. `package-test-bundle.md`
3. `windows-test-handoff.md`

### 安装失败 / EBUSY / 环境脏
1. `preinstall-cleanup-and-repair.md`
2. `install-openclaw.md`
3. `status-detection.md`

## 后续可补但暂未展开

- ClawHub / Skills 检测与自动准备
- Feishu 快捷配置链路
- 正式 Release / GitHub Actions 发布口径
- Node 卸载与 runtime 隔离边界

> 先把高频主航道铺稳，别一口气把文档搞成百科全书。