# Runbook: Package Test Bundle / 测试包打包

## 适用场景

用于在 **不走完整正式发布** 的前提下，给船长快速产出可测试的 ClawBox 包，尤其适合：

- Windows 真机修复后，需要马上给一个测试包
- 重开对话后，Agent 忘了“源码测试包到底怎么打”
- 需要把当前分支做成便于传递的 bootstrap/source bundle

> 当前项目事实：仓库里**没有现成的 `package-test-bundle` 脚本**。但 `/tmp/clawbox-releases` 中已经存在大量历史测试包，说明当前团队实际在用的测试包形态是 **source bootstrap zip / tar.gz**，而不是每次都走完整 Release。

---

## 前置条件

1. 仓库路径：`/root/clawbox`
2. 当前分支已切到要测试的版本
3. 已安装依赖：
   ```bash
   cd /root/clawbox
   npm install
   ```
4. 如果本轮修改涉及 `src/*`，建议先同步 Tauri 镜像：
   ```bash
   npm run prepare:tauri-server
   ```
5. 当前机器具备以下常用命令 / 环境：
   - `cp`
   - `find`
   - `mkdir`
   - `python3`
   - `zip`（可选；没有也能用 Python 标准库打 zip）
6. 输出目录：`/tmp/clawbox-releases`

---

## 涉及文件 / 目录

### 仓库内
- `package.json`（版本号）
- `scripts/prepare-tauri-server.js`
- `setup.sh`
- `setup.ps1`
- `run.bat`
- `src/*`
- `public/*`
- `src-tauri/*`
- `.github/workflows/build.yml`（正式 CI 打包参考）
- `src-tauri/BUILD.md`（Tauri 打包参考）

### 输出目录
- `/tmp/clawbox-releases/`

### 历史产物（已确认可作为结构参考）
- `ClawBox-source-bootstrap-v0.5.5-task9010-repack-20260409-222058.zip`
- `ClawBox-source-bootstrap-v0.5.4-task9010-20260406-022249.zip`
- `ClawBox-source-bootstrap-v0.5.4-7347fix-20260405-053129.zip`

---

## 当前已确认的关键事实

1. **当前最稳定的测试包形态是 source bootstrap zip**
   - 包内包含源码、`setup.sh`、`setup.ps1`、`run.bat`、`src-tauri/server/*`
2. **2026-04-09 那份 `task9010-repack` 已可视作当前结构基线**
   - 带 `node_modules/`
   - 带 `clawbox-linux`
   - 带 `src-tauri/server/`
   - **不带 `src-tauri/target/`**
3. `npm run prepare:tauri-server` 是打包前固定步骤
   - 它会同步 `src/*` 到 `src-tauri/server/`，并做基础校验
4. **不要整目录无脑 `cp -a src-tauri`**
   - 否则很容易把 `src-tauri/target/` 带进去，包体会膨胀到 GB 级
5. **没有 `zip` 命令时，不要先去修机器环境**
   - 直接用 Python 标准库 `zipfile` 打 zip 即可
6. **当前测试包口径偏向“船长拿到就能直接测”**
   - 所以通常保留 `node_modules/`
   - 目标是减少 Windows 真机额外踩依赖安装的概率

---

## 推荐档位

### 档位 A：`task9010-repack` / 4 月 9 日同款口径（默认推荐）

适用于：
- Windows follow-up 测试
- 船长要“跟上次那份 20MB 左右结构一样”的包
- 希望尽量复用最近已验证过的包结构

特征：
- 带 `node_modules/`
- 带 `clawbox-linux`
- 带 `src-tauri/server/*`
- 排除 `src-tauri/target/`
- 典型 zip 体积：**约 20~21MB**

### 档位 B：更精简 bootstrap

适用于：
- 明确只要最小源码测试包
- 想进一步压缩体积

特征：
- 可不带 `node_modules/`
- 结构更轻，但 Windows 真机上可能要额外装依赖

> 当前项目默认优先用 **档位 A**，除非船长明确要求更轻。

---

## 标准步骤（默认：按 2026-04-09 `task9010-repack` 结构）

> 目标：产出一个可以直接交给船长解压后运行 `setup.ps1` / `run.bat` 的测试包。

### 1) 先确认工作区状态

```bash
cd /root/clawbox
git status --short --branch
```

如果这轮本来就准备把未提交修改打给船长测，允许工作区 dirty；但要在交付说明里写清楚。

---

### 2) 同步 Tauri server 镜像

```bash
cd /root/clawbox
npm run prepare:tauri-server
```

这是当前最容易漏掉的一步。

如果修改只在 `src/*`，没同步到 `src-tauri/server/*`，后续桌面构建或镜像检查会错位。

---

### 3) 做最小校验

```bash
cd /root/clawbox
node --check src/server.js
node --check src/installer.js
node --check public/js/app.js
node --check scripts/prepare-tauri-server.js
node --check src-tauri/server/src/server.js
node --check src-tauri/server/src/installer.js
node --check src-tauri/server/public/js/app.js
```

如果本轮改动碰到启动链路，建议再补：

```bash
cd /root/clawbox
node -e "const p=require('./package.json'); console.log(p.name, p.version)"
```

---

### 4) 生成包名

建议命名规则沿用历史产物：

```text
ClawBox-source-bootstrap-v<version>-<suffix>-<YYYYMMDD-HHMMSS>.zip
```

- `<version>`：来自 `package.json`
- `<suffix>`：建议写当前语义，例如 `task9010-repack`、`7347fix`、`latest`
- 时间戳：便于回溯

示例：
```text
ClawBox-source-bootstrap-v0.5.6-task9010-repack-20260410-102042.zip
```

---

### 5) 生成 staging 目录并拷贝文件（默认结构）

> 这一步按 **2026-04-09 那份 20MB `task9010-repack`** 的结构固化。

```bash
cd /root/clawbox
set -e
VERSION=$(node -p "require('./package.json').version")
STAMP=$(date +%Y%m%d-%H%M%S)
SUFFIX=${SUFFIX:-task9010-repack}
BASENAME="ClawBox-source-bootstrap-v${VERSION}-${SUFFIX}-${STAMP}"
OUTDIR="/tmp/clawbox-releases"
STAGE="$OUTDIR/$BASENAME"
ZIP="$OUTDIR/$BASENAME.zip"

rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE/src-tauri"

cp -a AGENTS.md README.md package.json package-lock.json setup.sh setup.ps1 run.bat start.sh .gitignore "$STAGE/"
[ -f clawbox-linux ] && cp -a clawbox-linux "$STAGE/" || true
[ -f .codex-task-feishu-autoconfig.md ] && cp -a .codex-task-feishu-autoconfig.md "$STAGE/" || true
[ -f .codex-task-feishu-qr-fix.md ] && cp -a .codex-task-feishu-qr-fix.md "$STAGE/" || true

for d in bin docs handoffs public scripts src tasks node_modules; do
  [ -d "$d" ] && cp -a "$d" "$STAGE/" || true
done

for f in BUILD.md Cargo.lock Cargo.toml Dockerfile.ubuntu20 build.rs tauri.conf.json; do
  [ -f "src-tauri/$f" ] && cp -a "src-tauri/$f" "$STAGE/src-tauri/" || true
done

for d in gen icons capabilities src server; do
  [ -d "src-tauri/$d" ] && cp -a "src-tauri/$d" "$STAGE/src-tauri/" || true
done
```

### 为什么这里不直接 `cp -a src-tauri`

因为 `src-tauri/` 下常常会有：
- `target/`
- 其他构建残留

这些东西一旦带进去，包体会从几十 MB 直接暴涨到几 GB，纯坑自己。

**铁律：只拷 `src-tauri` 里真正需要的子目录 / 文件，不拷整棵目录。**

---

### 6) 生成 zip

#### 方案 A：系统有 `zip` 命令

```bash
cd /tmp/clawbox-releases
zip -qr "$ZIP" "$BASENAME"
```

#### 方案 B：没有 `zip` 命令（当前更稳）

```bash
python3 - <<'PY' "$STAGE" "$ZIP"
import os, sys, zipfile
stage, zip_path = sys.argv[1], sys.argv[2]
base_parent = os.path.dirname(stage)
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(stage):
        dirs[:] = [d for d in dirs if d not in {'.git', 'target'}]
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, base_parent)
            zf.write(full, rel)
print(zip_path)
PY
```

> 当前推荐 **优先记住 Python 方案**。这样下次就算机器没装 `zip`，也不会临时卡住。

---

## 为什么默认保留 `node_modules`

因为当前团队最近几轮真实交付口径偏向：

- **测试包优先可直接跑**
- 宁可 zip 多几 MB，也少让 Windows 真机多踩一步依赖安装

而实测证明：
- 保留 `node_modules/`
- 同时排除 `src-tauri/target/`

仍然可以把 zip 控在 **约 20~21MB**，这就是现在最舒服的平衡点。

---

## 打包后验证产物正确

### 1) 基础存在性检查

```bash
unzip -l "/tmp/clawbox-releases/<你的zip文件>.zip" | sed -n '1,120p'
```

至少应能看到：
- `setup.ps1`
- `run.bat`
- `setup.sh`
- `package.json`
- `src/server.js`
- `src/installer.js`
- `public/index.html`
- `src-tauri/server/src/server.js`
- `node_modules/.package-lock.json`

### 2) 关键文件存在性检查（更稳）

```bash
python3 - <<'PY' "/tmp/clawbox-releases/<你的zip文件>.zip"
import sys, zipfile
zip_path = sys.argv[1]
need = [
    'setup.ps1',
    'run.bat',
    'package.json',
    'src/server.js',
    'public/index.html',
    'src-tauri/server/src/server.js',
    'node_modules/.package-lock.json',
]
with zipfile.ZipFile(zip_path) as zf:
    names = set(zf.namelist())
    prefix = next(iter(names)).split('/')[0]
    for item in need:
        target = f'{prefix}/{item}'
        print(('OK ' if target in names else 'MISS ') + target)
PY
```

### 3) 版本号检查

```bash
node -e "console.log(require('/root/clawbox/package.json').version)"
```

并确认 zip 文件名中的版本号一致。

### 4) 镜像同步检查

确认 `src-tauri/server/src/` 已存在：
- `server.js`
- `config.js`
- `installer.js`

```bash
find /root/clawbox/src-tauri/server/src -maxdepth 1 -type f | sort
```

### 5) 体积检查

```bash
du -sh "$STAGE" "$ZIP"
```

按默认 `task9010-repack` 档位：
- staging 通常几十 MB
- zip 通常 **约 20~21MB**

如果突然变成几百 MB / 几 GB，优先怀疑是否误带：
- `src-tauri/target/`
- 其他构建产物

---

## 成功判定标准

满足以下条件才算本轮测试包可交付：

1. zip 已生成到 `/tmp/clawbox-releases/`
2. 包名包含：版本号 + 区分 suffix + 时间戳
3. 包内包含 bootstrap 所需关键文件：
   - `setup.ps1`
   - `run.bat`
   - `setup.sh`
   - `package.json`
   - `src/*`
   - `public/*`
4. 如本轮改动涉及 Tauri 镜像，包内 `src-tauri/server/src/*` 已同步
5. 包内包含 `node_modules/.package-lock.json`（若本轮走默认 repack 档位）
6. 至少做过一轮 `unzip -l`、关键文件检查或实际解压检查
7. 交付说明里明确：
   - 这是测试包，不是正式 release
   - 对应分支 / commit / 变更主题是什么

---

## 常见失败现象

### 现象 1：包打出来了，但运行后还是旧逻辑
高概率原因：
- 忘了执行 `npm run prepare:tauri-server`
- zip 里带的是旧的 `src-tauri/server/src/*`

### 现象 2：zip 体积异常大
高概率原因：
- 把 `src-tauri/target/` 带进去了
- 误把其他构建缓存、临时目录打进去了

### 现象 3：zip 体积异常小
高概率原因：
- 漏拷 `public/`、`src/`、`src-tauri/server/` 或 `node_modules/`
- 打出来的是“纯源码包”，不是当前默认的 repack 包

### 现象 4：Windows 测试机打开后依赖缺失
高概率原因：
- 包里没带 `node_modules`
- `setup.ps1` / `run.bat` 不在根目录
- 交付给船长的不是默认 repack 包，而是极简源码包

### 现象 5：zip 生成失败
高概率原因：
- staging 目录里已有旧同名文件
- `/tmp/clawbox-releases` 空间不足
- 系统没装 `zip`

### 现象 6：打包过程极慢，最后还特别大
高概率原因：
- 直接 `cp -a src-tauri`
- 把整个 `target/` 复制了一遍

---

## 排查方法

### 1) 先比对结构基线

默认直接参考：
- `/tmp/clawbox-releases/ClawBox-source-bootstrap-v0.5.5-task9010-repack-20260409-222058.zip`

看你的新包是否至少包含同等级别的关键文件和目录。

### 2) 看 staging 目录而不是只看 zip 结果

如果 zip 不对，先检查：
```bash
find "/tmp/clawbox-releases/<你的 staging 目录>" -maxdepth 3 -type f | head -200
```

### 3) 确认版本和命名一致

- `package.json` 版本
- zip 文件名版本
- 如果本轮故意没 bump 版本，交付说明里必须明确，不然下轮很容易误判

### 4) 没有 `zip` 命令时

不要先去装环境，直接用 Python 标准库打 zip。

只有在明确需要系统级 `zip/unzip` 工具、且船长同意改环境时，再考虑：
```bash
sudo apt-get update && sudo apt-get install -y zip unzip
```

---

## 回滚 / 恢复方法

### 删除错误产物

```bash
rm -rf "/tmp/clawbox-releases/<错误目录>"
rm -f "/tmp/clawbox-releases/<错误zip>"
```

### 重新打包

1. 回到仓库根目录
2. 重新执行：
   - `npm run prepare:tauri-server`
   - 最小语法校验
   - staging + zip 步骤
3. 优先检查是否误带 `src-tauri/target/`

### 不确定包是否可信时

不要硬发。优先：
- `unzip -l` 检查
- 关键文件存在性检查
- 对照 2026-04-09 那份 `task9010-repack` 基线包
- 再交给船长

---

## 与其他模块的关联风险

1. **Tauri 镜像同步风险**
   - `src/*` 改了但 `src-tauri/server/*` 没同步
2. **版本管理风险**
   - 项目规则要求代码更新后应 bump 版本；若本轮特意没 bump，必须明说
3. **Windows 测试体验风险**
   - 包是否带 `node_modules` 会直接影响“船长拿到后能不能快速跑起来”
4. **正式 release 混淆风险**
   - 测试包不等于 GitHub Release / Tauri 正式产物
5. **包内容漂移风险**
   - 目前没有 repo 内脚本固化流程，若只靠临时手打命令，下轮很容易又忘
6. **构建残留污染风险**
   - `src-tauri/target/` 是当前最容易把包体带炸的污染源

---

## 需要同步更新的文档或文件

打完测试包后，按需要同步：

- `projects/clawbox.md`
  - 若测试包名称、当前阶段、验证重点发生变化
- `handoffs/*.md`
  - 若需要给下轮 Agent 留“这包是干嘛的、测什么”的交接说明
- `docs/RUNBOOKS/gateway-restart.md`
  - 如果这个包是为 Gateway restart 修复验证准备的

---

## 待验证 / 待补充

1. **是否补一个 repo 内正式脚本**：建议后续加一个轻量 `scripts/package-test-bundle.sh` 或 `scripts/package-test-bundle.js`
2. **不同任务是否都适合默认带 `node_modules`**：当前 `task9010-repack` 口径适合 Windows 真机快速回归，但不代表所有任务都必须如此
3. **是否需要再细分 bundle 档位**：例如 `repack` / `slim` / `full-debug`

---

## 最轻量的执行口径（给下次对话快速恢复）

如果下次只想快速打一个**跟 2026-04-09 那份差不多**的测试包，按这个顺序：

1. `cd /root/clawbox && npm run prepare:tauri-server`
2. 跑 `node --check` 做最小校验
3. 按 **`task9010-repack`** 结构拷 staging 目录
   - 带 `node_modules`
   - 带 `clawbox-linux`
   - 带 `src-tauri/server/*`
   - **不要带 `src-tauri/target`**
4. 用 `zip` 或 Python `zipfile` 打成 zip
5. 检查关键文件和 zip 体积
6. 发给船长时写清楚：**这是测试包、测什么、对应哪个分支/改动**
