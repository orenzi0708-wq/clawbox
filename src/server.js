const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec, execSync } = require('child_process');
const { installOpenClaw, updateOpenClaw, uninstallOpenClaw, isOpenClawInstalled, getOpenClawVersion, isGatewayRunning, getOS, checkNodeVersion, isRoot, searchClawHubSkills, installClawHubSkill, isClawHubAvailable, installClawHubCLI } = require('./installer');
const { getModelConfig, updateModelConfig, getFeishuConfig, updateFeishuConfig, getConfigSummary } = require('./config');

function parseOpenclawDashboardUrlFromJson(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const queue = [payload];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'string') {
        const isDashboardKey = /dashboard/i.test(key);
        const looksLikeDashboardUrl = /^https?:\/\/\S+/i.test(value) && /dashboard|token=|auth=/.test(value);
        if (isDashboardKey && /^https?:\/\/\S+/i.test(value)) return value.trim();
        if (looksLikeDashboardUrl) return value.trim();
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function parseOpenclawDashboardUrlFromText(output) {
  if (!output) return null;
  const match = output.match(/Dashboard:\s+(https?:\/\/\S+)/i);
  return match ? match[1] : null;
}

function startServer(port = 3456, devMode = false) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ========== API 路由 ==========

  // 系统状态
  app.get('/api/status', (req, res) => {
    res.json({
      os: getOS(),
      nodeVersion: process.version,
      nodeOk: checkNodeVersion(),
      openclawInstalled: isOpenClawInstalled(),
      openclawVersion: getOpenClawVersion(),
      gatewayRunning: isGatewayRunning(),
      isRoot: isRoot()
    });
  });

  // 获取配置摘要
  app.get('/api/config', (req, res) => {
    res.json(getConfigSummary());
  });

  // 获取模型配置（完整）
  app.get('/api/config/model', (req, res) => {
    res.json(getModelConfig());
  });

  // 更新模型配置
  app.post('/api/config/model', (req, res) => {
    try {
      const { provider, model, apiKey, baseUrl } = req.body;
      const result = updateModelConfig({ provider, model, apiKey, baseUrl });
      res.json({ success: true, config: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 获取飞书配置
  app.get('/api/config/feishu', (req, res) => {
    res.json(getFeishuConfig());
  });

  // 更新飞书配置
  app.post('/api/config/feishu', (req, res) => {
    try {
      const { appId, appSecret, streaming } = req.body;
      const result = updateFeishuConfig({ appId, appSecret, streaming });
      res.json({ success: true, config: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 安装 OpenClaw（SSE 流式返回进度）
  app.post('/api/install', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send({ type: 'start', message: '开始安装...' });

    const result = await installOpenClaw((progress) => {
      send({ type: 'progress', ...progress });
    });

    send({ type: 'done', success: result.success });
    res.end();
  });

  // 更新 OpenClaw（SSE）
  app.post('/api/update', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send({ type: 'start', message: '开始更新...' });

    const result = await updateOpenClaw((progress) => {
      send({ type: 'progress', ...progress });
    });

    send({ type: 'done', success: result.success });
    res.end();
  });

  // 卸载 OpenClaw（SSE）
  app.post('/api/uninstall', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Charset', 'utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

    let clientClosed = false;
    res.on('close', () => {
      clientClosed = true;
    });
    req.on('aborted', () => {
      clientClosed = true;
    });

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
    if (!res.writableEnded) {
      res.write(': connected\n\n');
    }
    res.socket?.setTimeout?.(0);

    const send = (data) => {
      try {
        if (clientClosed || res.destroyed) {
          return;
        }
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      } catch (e) {
        console.error('SSE write error:', e.message);
      }
    };

    send({ type: 'start', message: '开始卸载...' });

    try {
      const result = await uninstallOpenClaw((progress) => {
        send({ type: 'progress', ...progress });
      });
      send({ type: 'done', success: result.success, steps: result.steps });
    } catch (err) {
      send({ type: 'done', success: false, error: err.message });
    }

    if (!res.writableEnded) {
      res.end();
    }
  });

  // 检查 ClawHub 是否可用
  app.get('/api/skills/status', (req, res) => {
    res.json({ available: isClawHubAvailable() });
  });

  // 安装 ClawHub CLI
  app.post('/api/skills/setup', (req, res) => {
    const result = installClawHubCLI();
    res.json(result);
  });

  // 搜索 Skills（带 10 秒缓存）
  const skillCache = new Map();
  app.get('/api/skills/search', (req, res) => {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ success: false, error: '缺少搜索关键词' });
    }
    // 检查缓存
    const cached = skillCache.get(query);
    if (cached && Date.now() - cached.time < 10000) {
      return res.json(cached.data);
    }
    const result = searchClawHubSkills(query);
    // 检测限流错误，返回友好提示
    if (!result.success && result.error && result.error.includes('Rate limit')) {
      return res.json({ success: false, error: '搜索太频繁，请稍后再试（每分钟限30次）' });
    }
    // 只缓存成功的结果
    if (result.success) {
      skillCache.set(query, { data: result, time: Date.now() });
    }
    res.json(result);
  });

  // 安装 Skill
  app.post('/api/skills/install', (req, res) => {
    const { slug } = req.body;
    if (!slug) {
      return res.status(400).json({ success: false, error: '缺少 skill slug' });
    }
    const result = installClawHubSkill(slug);
    if (!result.success && result.error && result.error.includes('Rate limit')) {
      return res.json({ success: false, error: '安装过于频繁，请稍后再试', detail: result.detail });
    }
    res.json(result);
  });

  // ========== 工具面板 ==========

  // 检查依赖状态
  app.get('/api/tools/status', (req, res) => {
    const result = {};
    const extendedPath = `${process.env.PATH}:/root/.local/share/pnpm:/usr/local/bin:/usr/local/node-v24.14.0-linux-x64/bin`;
    const env = { ...process.env, PATH: extendedPath };

    // Node.js — 优先用 which，找不到就用 process.version（当前Node进程一定存在）
    let nodeWhich = '';
    try {
      nodeWhich = execSync('which node 2>/dev/null || command -v node 2>/dev/null || echo ""', {
        encoding: 'utf8', timeout: 5000
      }).trim();
    } catch {}

    if (nodeWhich) {
      try {
        const nodeVer = execSync('node -v 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
        result.node = { installed: true, version: nodeVer, path: nodeWhich };
      } catch {
        result.node = { installed: true, version: process.version, path: nodeWhich };
      }
    } else if (process.version) {
      // which 找不到但当前进程就是 Node，说明它存在只是 PATH 可能有问题
      result.node = { installed: true, version: process.version, path: process.execPath };
    } else {
      result.node = { installed: false };
    }
    // ClawHub — 优先用 which/command -v，找不到再搜常见路径 + find
    const fs = require('fs');
    const path = require('path');
    const CACHE_FILE = path.join(os.homedir(), '.openclaw', 'clawhub-path.json');

    let clawhubFound = null;

    // 1. 优先用 which（最权威）
    try {
      const whichResult = execSync('which clawhub 2>/dev/null || echo ""', {
        encoding: 'utf8', timeout: 5000
      }).trim();
      if (whichResult && fs.existsSync(whichResult)) {
        clawhubFound = whichResult;
      }
    } catch {}

    // 2. which 没找到，读缓存（验证文件存在且可执行）
    if (!clawhubFound) {
      try {
        const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (cache.path && fs.existsSync(cache.path)) {
          try {
            fs.accessSync(cache.path, fs.constants.X_OK);
            clawhubFound = cache.path;
          } catch {
            fs.unlinkSync(CACHE_FILE);
          }
        }
      } catch {}
    }

    // 3. 缓存也没命中，搜常见路径
    if (!clawhubFound) {
      const commonPaths = [
        path.join(os.homedir(), '.local/share/pnpm/clawhub'),
        path.join(os.homedir(), '.nvm/current/bin/clawhub'),
        path.join(os.homedir(), '.local/bin/clawhub'),
        '/usr/local/bin/clawhub',
        '/usr/bin/clawhub'
      ];
      // 也搜 node 独立二进制目录下的 npm 全局 bin
      try {
        const nodeParent = path.dirname(path.dirname(process.execPath));
        commonPaths.push(path.join(nodeParent, 'bin', 'clawhub'));
      } catch {}
      for (const p of commonPaths) {
        try {
          fs.accessSync(p, fs.constants.X_OK);
          clawhubFound = p;
          break;
        } catch {}
      }
    }

    // 4. 还没找到，find 全盘搜索（限 5 秒）
    if (!clawhubFound) {
      try {
        const found = execSync(
          'find /usr /opt /home /root /snap -name clawhub -type f -executable 2>/dev/null | head -1',
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
        if (found) clawhubFound = found;
      } catch {}
    }

    // 找到了就缓存下来
    if (clawhubFound) {
      try {
        fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ path: clawhubFound, foundAt: Date.now() }));
      } catch {}
    }

    result.clawhub = {
      installed: !!clawhubFound,
      path: clawhubFound
    };
    // OpenClaw
    result.openclaw = {
      installed: isOpenClawInstalled(),
      version: getOpenClawVersion()
    };
    res.json(result);
  });

  // 卸载 Node.js — 先用 which 判断安装方式，再按方式卸载
  app.post('/api/tools/uninstall-node', (req, res) => {
    const nvmDir = process.env.NVM_DIR || `${os.homedir()}/.nvm`;
    const logs = [];

    // 1. 用 which 找到真实路径
    let whichPath = '';
    try {
      whichPath = execSync('which node 2>/dev/null || command -v node 2>/dev/null || echo ""', {
        encoding: 'utf8', timeout: 5000
      }).trim();
    } catch {}

    if (!whichPath) {
      return res.json({ success: false, error: '未找到 node 可能已经卸载了' });
    }
    logs.push(`检测到 node 路径: ${whichPath}`);

    // 获取真实路径（解析软链接）
    let realPath = whichPath;
    try {
      realPath = execSync(`readlink -f "${whichPath}" 2>/dev/null || echo "${whichPath}"`, {
        encoding: 'utf8', timeout: 5000
      }).trim();
    } catch {}
    logs.push(`真实路径: ${realPath}`);

    // 2. nvm 安装的 — 告知手动操作
    if (realPath.includes('.nvm') || whichPath.includes('.nvm')) {
      const nodeVersion = process.version;
      const major = nodeVersion.match(/v(\d+)/)?.[1];
      return res.json({
        success: false,
        error: `Node.js ${nodeVersion} 通过 nvm 安装，当前正在使用中。\n\n手动卸载方法：\n1. 安装其他版本: nvm install 22\n2. 切换版本: nvm use 22\n3. 卸载旧版本: nvm uninstall ${major}\n\n或直接删除整个 nvm 目录: rm -rf ${nvmDir}`
      });
    }

    // 3. Homebrew 安装的（macOS）
    if (os.platform() === 'darwin') {
      try {
        execSync('brew uninstall node@22 2>/dev/null || brew uninstall node 2>/dev/null', { timeout: 30000 });
        return res.json({ success: true, message: 'Node.js 已通过 Homebrew 卸载' });
      } catch (err) {
        return res.json({ success: false, error: `Homebrew 卸载失败: ${err.message}` });
      }
    }

    // 4. 独立二进制安装的（/usr/local/node-v* 或其他自定义目录）
    //    如果真实路径在 /usr/local/node-v* 目录下，删整个目录
    const standaloneMatch = realPath.match(/(\/usr\/local\/node-v[^/]+)/);
    if (standaloneMatch) {
      const installDir = standaloneMatch[1];
      logs.push(`检测到独立二进制安装: ${installDir}`);
      try {
        execSync(`sudo rm -rf "${installDir}"`, { timeout: 30000 });
        logs.push(`已删除 ${installDir}`);
      } catch (err) {
        return res.json({ success: false, error: `删除失败: ${err.message}\n${logs.join('\n')}` });
      }

      // 清理 /usr/local/bin/ 下可能的软链接
      try {
        execSync('sudo rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx', { timeout: 5000 });
        logs.push('已清理 /usr/local/bin/ 软链接');
      } catch {}

      // 验证
      let stillExists = false;
      try {
        const afterWhich = execSync('which node 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 5000 }).trim();
        if (afterWhich) {
          logs.push(`警告: which node 仍返回 ${afterWhich}`);
          stillExists = true;
        }
      } catch {}

      return res.json({
        success: !stillExists,
        message: stillExists
          ? `已删除 ${installDir}，但 node 仍在其他位置\n${logs.join('\n')}`
          : `Node.js 已通过删除独立二进制目录卸载\n${logs.join('\n')}`
      });
    }

    // 5. apt 安装的（/usr/bin/node）
    if (realPath.startsWith('/usr/bin/') || whichPath === '/usr/bin/node') {
      logs.push('检测到 apt 安装');
      try {
        let packages = [];
        try {
          const ownerOutput = execSync(`dpkg-query -S "${realPath}" 2>/dev/null || echo ""`, {
            encoding: 'utf8', timeout: 5000
          }).trim();
          packages = ownerOutput
            .split('\n')
            .flatMap(line => line.split(':')[0].split(','))
            .map(pkg => pkg.trim())
            .filter(Boolean);
        } catch {}

        if (packages.length === 0) {
          packages = ['nodejs'];
        }

        logs.push(`准备卸载 apt 包: ${packages.join(', ')}`);
        execSync(`sudo env DEBIAN_FRONTEND=noninteractive apt-get remove -y --purge ${packages.join(' ')}`, {
          encoding: 'utf8',
          timeout: 120000
        });
        logs.push('apt-get remove 完成');
        execSync('sudo env DEBIAN_FRONTEND=noninteractive apt-get autoremove -y --purge', {
          encoding: 'utf8',
          timeout: 120000
        });
        logs.push('apt-get autoremove 完成');
      } catch (err) {
        const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
        return res.json({ success: false, error: `apt 卸载失败: ${detail || err.message}\n${logs.join('\n')}` });
      }

      // 验证
      let stillExists = false;
      try {
        const afterWhich = execSync('which node 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 5000 }).trim();
        if (afterWhich) {
          logs.push(`警告: which node 仍返回 ${afterWhich}`);
          stillExists = true;
        }
      } catch {}

      return res.json({
        success: !stillExists,
        message: stillExists
          ? `apt 卸载完成，但 node 仍在其他位置\n${logs.join('\n')}`
          : `Node.js 已通过 apt 卸载\n${logs.join('\n')}`
      });
    }

    // 6. 其他安装方式 — 无法自动处理
    return res.json({
      success: false,
      error: `Node.js 安装在未知位置: ${realPath}\n无法自动卸载，请手动删除:\nrm -f ${whichPath}`
    });
  });

  // 卸载 ClawHub — 先用 which 找真实路径，再删除，最后验证
  app.post('/api/tools/uninstall-clawhub', (req, res) => {
    const logs = [];
    const deleted = [];

    // 1. 用 which/command -v 找到所有 clawhub 路径
    let whichPaths = [];
    try {
      const result = execSync(
        'which clawhub 2>/dev/null; command -v clawhub 2>/dev/null; echo ""',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      if (result) {
        whichPaths = [...new Set(result.split('\n').filter(Boolean))];
      }
    } catch {}

    // 2. 额外搜索常见位置（以防 which 漏掉）
    const extraSearchDirs = [
      `${os.homedir()}/.local/share/pnpm`,
      `${os.homedir()}/.local/bin`,
      `${os.homedir()}/.nvm`,
      '/usr/local/bin',
      '/usr/bin'
    ];

    // 也搜 pnpm 全局存储
    const pnpmGlobal = `${os.homedir()}/.local/share/pnpm/global`;
    if (fs.existsSync(pnpmGlobal)) {
      extraSearchDirs.push(pnpmGlobal);
    }

    for (const dir of extraSearchDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const found = execSync(
          `find "${dir}" -maxdepth 5 \\( -name "clawhub" -o -name "clawhub.js" \\) -type f 2>/dev/null`,
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
        if (found) {
          found.split('\n').filter(Boolean).forEach(p => whichPaths.push(p));
        }
      } catch {}
    }

    whichPaths = [...new Set(whichPaths)]; // 去重

    if (whichPaths.length === 0) {
      // 彻底找不到，清理缓存后报告
      try {
        const cacheFile = `${os.homedir()}/.openclaw/clawhub-path.json`;
        if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
      } catch {}
      return res.json({ success: false, error: '未找到 clawhub，可能已经卸载了' });
    }

    logs.push(`找到 ${whichPaths.length} 个 clawhub 文件:`);
    whichPaths.forEach(p => logs.push(`  ${p}`));

    // 3. 删除所有找到的文件（用 sudo rm -f，/usr/bin 等目录需要权限）
    for (const p of whichPaths) {
      try {
        if (fs.existsSync(p)) {
          execSync(`sudo rm -f "${p}"`, { timeout: 5000 });
          deleted.push(p);
          logs.push(`已删除: ${p}`);
        }
      } catch (err) {
        logs.push(`删除失败: ${p} - ${err.message}`);
      }
    }

    // 4. 清理 ClawBox 的路径缓存
    try {
      const cacheFile = `${os.homedir()}/.openclaw/clawhub-path.json`;
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        logs.push('已清理路径缓存');
      }
    } catch {}

    // 5. 验证：which 应该找不到了
    let stillExists = false;
    try {
      const afterWhich = execSync('which clawhub 2>/dev/null || command -v clawhub 2>/dev/null || echo ""', {
        encoding: 'utf8', timeout: 5000
      }).trim();
      if (afterWhich) {
        logs.push(`警告: 仍检测到 clawhub at ${afterWhich}，可能还有其他副本`);
        stillExists = true;
      }
    } catch {}

    if (stillExists) {
      return res.json({
        success: false,
        error: `已删除 ${deleted.length} 个文件，但仍有残留\n${logs.join('\n')}`
      });
    }

    return res.json({
      success: true,
      message: `ClawHub 已完全卸载（删除了 ${deleted.length} 个文件）\n${logs.join('\n')}`
    });
  });

  // 卸载 ClawBox 自身 — 用临时脚本删除自己的目录
  app.post('/api/tools/uninstall-clawbox', (req, res) => {
    const clawboxDir = path.join(__dirname, '..');
    const scriptPath = '/tmp/clawbox_self_uninstall.sh';

    // 生成卸载脚本
    const script = `#!/bin/bash
sleep 2
rm -rf "${clawboxDir}"
rm -f "${scriptPath}"
`;
    try {
      fs.writeFileSync(scriptPath, script, { mode: 0o755 });
      // 后台执行脚本，然后退出进程
      exec(`nohup bash ${scriptPath} &>/dev/null &`);
      res.json({ success: true, message: 'ClawBox 正在卸载...' });
      // 延迟退出，确保响应发出
      setTimeout(() => process.exit(0), 500);
    } catch (err) {
      res.json({ success: false, error: `生成卸载脚本失败: ${err.message}` });
    }
  });

  // 获取 OpenClaw Dashboard URL
  app.get('/api/tools/openclaw-dashboard', (req, res) => {
    try {
      let dashboardUrl = null;

      try {
        const jsonOutput = execSync('openclaw gateway status --json 2>/dev/null', {
          encoding: 'utf8',
          timeout: 10000
        }).trim();
        if (jsonOutput) {
          try {
            dashboardUrl = parseOpenclawDashboardUrlFromJson(JSON.parse(jsonOutput));
          } catch {}
        }
      } catch {}

      if (!dashboardUrl) {
        const textOutput = execSync('openclaw gateway status 2>/dev/null', {
          encoding: 'utf8',
          timeout: 10000
        });
        dashboardUrl = parseOpenclawDashboardUrlFromText(textOutput);
      }

      if (dashboardUrl) {
        res.json({ success: true, url: dashboardUrl });
        return;
      }

      res.json({ success: false, error: '未找到 Dashboard 地址，Gateway 可能未运行' });
    } catch (err) {
      res.json({ success: false, error: '无法获取 Dashboard 地址' });
    }
  });

  // 重启网关
  app.post('/api/gateway/restart', async (req, res) => {
    try {
      const output = await new Promise((resolve, reject) => {
        exec('openclaw gateway restart', { timeout: 30000 }, (err, stdout, stderr) => {
          if (err) {
            reject(new Error((stderr || stdout || err.message || '').trim()));
          } else {
            resolve((stdout || stderr || '').trim());
          }
        });
      });

      const start = Date.now();
      let ready = false;
      while (Date.now() - start < 20000) {
        if (isGatewayRunning()) {
          ready = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!ready) {
        return res.json({ success: false, error: '网关重启命令已执行，但服务未在 20 秒内恢复', output });
      }

      res.json({ success: true, output, ready: true });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  // 启动服务器
  return new Promise((resolve) => {
    const server = app.listen(port, '0.0.0.0', () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`\n  📦 ClawBox 已启动: ${url}`);
      console.log(`  在浏览器中打开即可开始配置\n`);

      // 自动打开浏览器（跨平台）
      const platform = process.platform;
      const cmd = platform === 'darwin' ? 'open' :
                  platform === 'win32' ? 'start' :
                  'xdg-open';
      if (!devMode) {
        try { require('child_process').exec(`${cmd} ${url}`); } catch {}
      }

      resolve(server);
    });
  });
}

// 直接运行时启动服务器
if (require.main === module) {
  const devMode = process.argv.includes('--dev');
  startServer(3456, devMode);
}

module.exports = { startServer };
