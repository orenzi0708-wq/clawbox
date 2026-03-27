const { execSync, exec, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function parseJsonWithDetails(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { __parseError: error.message, __raw: raw };
  }
}

function readNestedValue(value, pathParts) {
  let current = value;
  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function findBoolean(value, candidatePaths) {
  for (const candidatePath of candidatePaths) {
    const candidate = readNestedValue(value, candidatePath);
    if (typeof candidate === 'boolean') return candidate;
  }
  return undefined;
}

function findString(value, candidatePaths) {
  for (const candidatePath of candidatePaths) {
    const candidate = readNestedValue(value, candidatePath);
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function getGatewayStatusJson(requireRpc = false) {
  const args = ['gateway', 'status', '--json'];
  if (requireRpc) args.push('--require-rpc');

  const result = spawnSync('openclaw', args, {
    encoding: 'utf8',
    timeout: 15000
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const payload = parseJsonWithDetails(stdout.trim() || stderr.trim());

  if (payload && !payload.__parseError) {
    return {
      ok: result.status === 0,
      status: result.status,
      data: payload,
      stdout,
      stderr
    };
  }

  return {
    ok: result.status === 0,
    status: result.status,
    data: null,
    stdout,
    stderr,
    error: payload?.__parseError || result.error?.message || stderr.trim() || stdout.trim() || '无法解析 openclaw gateway status --json 输出'
  };
}

function isGatewayStatusRunning(status) {
  if (!status || typeof status !== 'object') return false;

  const rpcOk = findBoolean(status, [
    ['rpc', 'ok'],
    ['gateway', 'rpcOk'],
    ['gateway', 'rpc', 'ok'],
    ['health', 'rpcOk'],
    ['probe', 'ok']
  ]);

  const serviceLoaded = findBoolean(status, [
    ['service', 'loaded'],
    ['gateway', 'loaded'],
    ['serviceLoaded']
  ]);

  const runtimeStatus = findString(status, [
    ['service', 'runtime', 'status'],
    ['gateway', 'runtime', 'status'],
    ['runtime', 'status'],
    ['status']
  ]);

  if (rpcOk === true) return true;
  if (serviceLoaded === true && runtimeStatus === 'running') return true;
  return false;
}

/**
 * 检查 Node.js 版本
 */
function checkNodeVersion() {
  const [major] = process.versions.node.split('.').map(Number);
  return major >= 18;
}

/**
 * 检测操作系统
 */
function getOS() {
  const platform = os.platform();
  if (platform === 'linux') {
    try {
      const release = fs.readFileSync('/etc/os-release', 'utf8');
      if (release.includes('Ubuntu')) return 'ubuntu';
      if (release.includes('Debian')) return 'debian';
      if (release.includes('CentOS') || release.includes('Rocky')) return 'centos';
      if (release.includes('Fedora')) return 'fedora';
    } catch {}
    return 'linux';
  }
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  return platform;
}

/**
 * 检查 OpenClaw 是否已安装
 */
function isOpenClawInstalled() {
  try {
    const result = execSync('openclaw --version 2>/dev/null || echo "not_found"', {
      encoding: 'utf8',
      timeout: 5000
    });
    return !result.includes('not_found') && !result.includes('command not found');
  } catch {
    return false;
  }
}

/**
 * 获取已安装的 OpenClaw 版本
 */
function getOpenClawVersion() {
  try {
    const result = execSync('openclaw --version 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * 检查 OpenClaw Gateway 是否正在运行
 */
function isGatewayRunning() {
  const result = getGatewayStatusJson();
  return result.ok && isGatewayStatusRunning(result.data);
}

/**
 * 检查是否是 root 用户
 */
function isRoot() {
  try {
    return process.getuid && process.getuid() === 0;
  } catch {
    return false;
  }
}

function getCommandOutput(error) {
  if (!error) return '';
  const parts = [];
  if (typeof error.stdout === 'string' && error.stdout.trim()) parts.push(error.stdout.trim());
  if (Buffer.isBuffer(error.stdout) && error.stdout.length) parts.push(error.stdout.toString('utf8').trim());
  if (typeof error.stderr === 'string' && error.stderr.trim()) parts.push(error.stderr.trim());
  if (Buffer.isBuffer(error.stderr) && error.stderr.length) parts.push(error.stderr.toString('utf8').trim());
  if (parts.length) return parts.join('\n');
  return error.message || '';
}

function resolveClawHubBinary() {
  const envWithPnpm = {
    ...process.env,
    PATH: `${process.env.PATH || ''}:/root/.local/share/pnpm:/usr/local/bin:${path.join(os.homedir(), '.local/bin')}`
  };

  try {
    const found = execSync('command -v clawhub 2>/dev/null || which clawhub 2>/dev/null || echo ""', {
      encoding: 'utf8',
      timeout: 5000,
      env: envWithPnpm
    }).trim();
    if (found && fs.existsSync(found)) {
      return { command: found, env: envWithPnpm };
    }
  } catch {}

  const cacheFile = path.join(os.homedir(), '.openclaw', 'clawhub-path.json');
  try {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (cache.path && fs.existsSync(cache.path)) {
      fs.accessSync(cache.path, fs.constants.X_OK);
      return { command: cache.path, env: envWithPnpm };
    }
  } catch {}

  const candidates = [
    path.join(os.homedir(), '.local/share/pnpm/clawhub'),
    path.join(os.homedir(), '.local/bin/clawhub'),
    path.join(os.homedir(), '.nvm/current/bin/clawhub'),
    '/usr/local/bin/clawhub',
    '/usr/bin/clawhub'
  ];

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return { command: candidate, env: envWithPnpm };
    } catch {}
  }

  return { command: 'clawhub', env: envWithPnpm };
}

/**
 * 安装 OpenClaw（通过官方 install.sh）
 * install.sh 会自动处理：Node.js、build tools、OpenClaw 安装
 */
async function installOpenClaw(onProgress) {
  const steps = [];
  const report = (name, status, detail) => {
    steps.push({ name, status, detail });
    if (onProgress) onProgress({ name, status, detail, steps: [...steps] });
  };

  try {
    // Step 1: 检测系统
    report('detect_os', 'running', '检测操作系统...');
    const osType = getOS();
    if (osType === 'windows') {
      report('detect_os', 'error', 'Windows 暂不支持，请使用 PowerShell 安装');
      return { success: false, steps };
    }
    report('detect_os', 'done', `${osType} ✓`);

    // Step 2: 检查 curl
    report('check_curl', 'running', '检查 curl...');
    try {
      execSync('curl --version', { encoding: 'utf8', timeout: 5000 });
    } catch {
      report('check_curl', 'error', '未找到 curl，请先安装');
      return { success: false, steps };
    }
    report('check_curl', 'done', 'curl ✓');

    // Step 3: 通过 install.sh 安装
    const sudoPrefix = isRoot() ? '' : 'sudo ';
    report('install_openclaw', 'running',
      isRoot()
        ? '正在通过官方脚本安装 OpenClaw（root 模式，无需密码）...'
        : '正在通过官方脚本安装 OpenClaw（可能需要输入 sudo 密码）...');

    await new Promise((resolve, reject) => {
      const scriptPath = path.join(os.tmpdir(), 'openclaw-install.sh');
      const dlProc = exec(
        `curl -fsSL --proto '=https' --tlsv1.2 -o "${scriptPath}" https://openclaw.ai/install.sh`,
        { timeout: 60000, shell: '/bin/bash' }
      );
      dlProc.on('close', dlCode => {
        if (dlCode !== 0) {
          reject(new Error(`下载安装脚本失败，退出码: ${dlCode}`));
          return;
        }
        const runCmd = `${sudoPrefix}bash "${scriptPath}" --no-onboard`;
        const proc = exec(runCmd, { timeout: 300000, shell: '/bin/bash' });
        let output = '';
        proc.stdout?.on('data', data => { output += data; });
        proc.stderr?.on('data', data => { output += data; });
        proc.on('close', code => {
          try { fs.unlinkSync(scriptPath); } catch {}
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`安装脚本退出码: ${code}\n${output.slice(-500)}`));
          }
        });
      });
    });
    report('install_openclaw', 'done', 'OpenClaw 安装完成 ✓');

    // Step 4: 安装 ClawHub CLI（Skills 市场需要）
    report('install_clawhub', 'running', '安装 ClawHub CLI...');
    try {
      await new Promise((resolve, reject) => {
        const clawhubCmd = isRoot()
          ? 'npm --loglevel error --no-fund --no-audit install -g clawhub'
          : `sudo npm --loglevel error --no-fund --no-audit install -g clawhub`;
        const proc = exec(clawhubCmd, { timeout: 60000 });
        proc.on('close', code => code === 0 ? resolve() : reject(new Error(`退出码: ${code}`)));
      });
      report('install_clawhub', 'done', 'ClawHub CLI ✓');
    } catch {
      report('install_clawhub', 'done', 'ClawHub 安装跳过（可稍后手动安装）');
    }

    // Step 5: 初始化配置（设置 gateway.mode，确保 Gateway 可启动）
    report('init_config', 'running', '初始化 Gateway 配置...');
    try {
      const configCmd = isRoot()
        ? 'openclaw config set gateway.mode local && openclaw config set gateway.auth.mode none'
        : `openclaw config set gateway.mode local && openclaw config set gateway.auth.mode none`;
      execSync(configCmd, { encoding: 'utf8', timeout: 10000 });
      report('init_config', 'done', 'Gateway 配置完成 ✓');
    } catch {
      report('init_config', 'done', 'Gateway 配置跳过（可稍后手动设置）');
    }

    // Step 6: 验证安装
    report('verify', 'running', '验证安装...');
    try {
      const version = execSync('openclaw --version 2>/dev/null', {
        encoding: 'utf8',
        timeout: 10000
      }).trim();
      report('verify', 'done', `OpenClaw ${version} ✓`);
    } catch {
      report('verify', 'done', '安装完成（需重新打开终端生效）');
    }

    report('all_done', 'done', '🎉 OpenClaw 安装成功！');
    return { success: true, steps };

  } catch (err) {
    report('error', 'error', err.message);
    return { success: false, steps };
  }
}

/**
 * 更新 OpenClaw
 */
async function updateOpenClaw(onProgress) {
  const steps = [];
  const report = (name, status, detail) => {
    steps.push({ name, status, detail });
    if (onProgress) onProgress({ name, status, detail, steps: [...steps] });
  };

  try {
    report('update', 'running', '正在更新 OpenClaw...');
    await new Promise((resolve, reject) => {
      const proc = exec('npm update -g openclaw', { timeout: 120000 });
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`更新失败，退出码: ${code}`)));
    });
    report('update', 'done', '✅ 更新完成');
    return { success: true, steps };
  } catch (err) {
    report('update', 'error', err.message);
    return { success: false, steps };
  }
}

/**
 * 卸载 OpenClaw
 */
async function uninstallOpenClaw(onProgress) {
  const steps = [];
  const report = (name, status, detail) => {
    steps.push({ name, status, detail });
    if (onProgress) onProgress({ name, status, detail, steps: [...steps] });
  };
  // 心跳：每5秒发一次 ping 防止 SSE 超时
  const heartbeat = setInterval(() => {
    if (onProgress) onProgress({ name: 'heartbeat', status: 'ping', detail: '保持连接...', steps: [...steps] });
  }, 5000);

  try {
    report('uninstall', 'running', '执行 OpenClaw 卸载...');
    const output = await new Promise((resolve, reject) => {
      exec('openclaw uninstall --all --yes --non-interactive', { timeout: 120000 }, (err, stdout, stderr) => {
        const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
        if (err) {
          reject(new Error(combined || err.message));
        } else {
          resolve(combined);
        }
      });
    });
    report('uninstall', 'done', output || 'OpenClaw 已卸载 ✓');
    report('all_done', 'done', '🎉 OpenClaw 已卸载');
    return { success: true, steps };
  } catch (err) {
    report('error', 'error', err.message);
    return { success: false, steps };
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * 搜索 ClawHub Skills
 */
function searchClawHubSkills(query) {
  const { command, env } = resolveClawHubBinary();
  try {
    const result = execSync(`"${command}" search --no-input "${query}"`, {
      encoding: 'utf8',
      timeout: 30000,
      env
    });
    return { success: true, output: result.trim() };
  } catch (err) {
    const output = getCommandOutput(err);
    if (output.includes('Rate limit')) {
      return { success: false, error: 'Rate limit exceeded', detail: output };
    }
    return { success: false, error: output || err.message };
  }
}

/**
 * 安装 ClawHub Skill
 */
function installClawHubSkill(slug) {
  const { command, env } = resolveClawHubBinary();
  const result = spawnSync(command, ['install', '--no-input', slug], {
    encoding: 'utf8',
    timeout: 90000,
    env
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      return { success: false, error: '安装超时，请稍后重试', detail: output };
    }
    return { success: false, error: result.error.message, detail: output };
  }

  if (result.status === 0) {
    return { success: true, output };
  }

  if (output.includes('Rate limit')) {
    return { success: false, error: '安装过于频繁，请稍后再试', detail: output };
  }

  if (/not found|ENOENT/i.test(output) || result.status === 127) {
    return { success: false, error: '未找到 clawhub 命令，请先安装 ClawHub CLI', detail: output };
  }

  return {
    success: false,
    error: output || `安装失败，退出码: ${result.status}`,
    detail: output
  };
}

/**
 * 检查 ClawHub CLI 是否可用
 */
function isClawHubAvailable() {
  const { command } = resolveClawHubBinary();
  if (command !== 'clawhub') return true;
  try {
    const result = execSync('which clawhub 2>/dev/null || command -v clawhub 2>/dev/null || echo ""', {
      encoding: 'utf8',
      timeout: 5000
    }).trim();
    return !!result;
  } catch {}
  return false;
}

/**
 * 安装 ClawHub CLI
 */
function installClawHubCLI() {
  const installCmds = [
    'npm --loglevel error --no-fund --no-audit install -g clawhub',
    'sudo npm --loglevel error --no-fund --no-audit install -g clawhub',
    'pnpm add -g clawhub'
  ];

  for (const cmd of installCmds) {
    try {
      execSync(cmd, { timeout: 60000, stdio: 'ignore' });
      // 安装后确保有执行权限
      try {
        const binPath = execSync('command -v clawhub 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
        if (binPath) {
          execSync(`chmod +x "${binPath}"`, { stdio: 'ignore' });
        }
      } catch {}
      return { success: true };
    } catch {}
  }
  return { success: false, error: '所有安装方式都失败了' };
}

module.exports = {
  checkNodeVersion,
  getOS,
  isOpenClawInstalled,
  getOpenClawVersion,
  isGatewayRunning,
  isRoot,
  installOpenClaw,
  updateOpenClaw,
  uninstallOpenClaw,
  searchClawHubSkills,
  installClawHubSkill,
  isClawHubAvailable,
  installClawHubCLI
};
