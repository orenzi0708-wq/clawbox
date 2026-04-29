const { execSync, exec, spawnSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLATFORM = os.platform(); // 'linux' | 'darwin' | 'win32'
const PATH_SEP = PLATFORM === 'win32' ? ';' : ':';
const WINDOWS_POWERSHELL_PROGRESS_MAP = {
  'CLAWBOX_STAGE:BOOTSTRAP_STARTED': '阶段：已启动 PowerShell 安装器',
  'CLAWBOX_STAGE:DOWNLOADING_INSTALLER': '阶段：正在下载官方安装脚本',
  'CLAWBOX_STAGE:INSTALLER_DOWNLOADED': '阶段：官方脚本下载完成',
  'CLAWBOX_STAGE:RUNNING_INSTALLER': '阶段：开始执行官方安装流程',
  'CLAWBOX_STAGE:CHECK_PREREQ': '阶段：正在检查 Git / Node 环境',
  'CLAWBOX_STAGE:GIT_BOOTSTRAP': '阶段：正在准备 portable Git（首次安装较慢）',
  'CLAWBOX_STAGE:OPENCLAW_NPM_INSTALL': '阶段：正在通过 npm 安装 OpenClaw（首次安装可能持续数分钟）',
  'CLAWBOX_STAGE:INIT_CONFIG': '阶段：正在初始化 OpenClaw 配置',
  'CLAWBOX_STAGE:VERIFY_INSTALL': '阶段：正在验证安装结果',
  'CLAWBOX_HINT:GIT_DOWNLOAD_WAIT': '提示：正在下载 portable Git（首次安装较慢），如果网络一般会停一会儿',
  'CLAWBOX_HINT:NPM_INSTALL_WAIT': '提示：正在通过 npm 安装 OpenClaw（首次安装可能持续数分钟）',
  'CLAWBOX_HINT:INIT_CONFIG_WAIT': '提示：正在初始化配置，通常会连续执行多条 openclaw config / gateway 命令',
  'CLAWBOX_HINT:VERIFY_WAIT': '提示：正在做最终验证，会检查 where openclaw 和 openclaw --version'
};

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


function runPowerShellJson(script, timeout = 20000) {
  if (PLATFORM !== 'win32') return [];
  try {
    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      timeout,
      env: getExtendedShellEnv(),
      windowsHide: true
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (result.status !== 0 || result.error || !output) return [];
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function safeTrimLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeWindowsPathForCompare(value) {
  return String(value || '').trim().replace(/\\/g, '/').toLowerCase();
}

function classifyWindowsCleanupFailure(targetPath, error) {
  const raw = String(error?.message || error || '').trim();
  const lower = raw.toLowerCase();
  const normalizedPath = normalizeWindowsPathForCompare(targetPath);
  const busyHints = [
    'ebusy',
    'used by another process',
    'being used by another process',
    'resource busy',
    'device or resource busy',
    'sharing violation',
    'another process',
    'the process cannot access the file because it is being used by another process',
    'file is being used',
    'directory is not empty',
    'not empty'
  ];
  const busyEpermHints = ['process', 'used', 'access the file', 'sharing violation', 'directory not empty', 'not empty'];
  const missingHints = [
    'enoent',
    'cannot find the file',
    'cannot find the path',
    'path not found',
    'file not found',
    'no such file or directory',
    'not exist'
  ];
  const permissionHints = [
    'access is denied',
    'permission denied',
    'eacces',
    'requires elevation',
    'elevation required',
    'administrator privileges'
  ];

  const isBusy = busyHints.some((token) => lower.includes(token))
    || (lower.includes('eperm') && busyEpermHints.some((token) => lower.includes(token)))
    || (lower.includes('eperm') && normalizedPath.includes('/npm/node_modules/openclaw'));
  if (isBusy) {
    return {
      category: 'busy',
      label: '被占用 / 带锁',
      message: `${targetPath} 更像是正被其他进程或系统锁占用，不是单纯权限不足`,
      raw
    };
  }

  if (missingHints.some((token) => lower.includes(token))) {
    return {
      category: 'missing',
      label: '路径不存在',
      message: `${targetPath} 已不存在，可能之前就被清掉了`,
      raw
    };
  }

  if (permissionHints.some((token) => lower.includes(token)) || (lower.includes('eperm') && !isBusy)) {
    return {
      category: 'permission',
      label: '权限不足',
      message: `${targetPath} 删除失败：更像是权限问题，建议尝试以管理员身份运行 ClawBox`,
      raw
    };
  }

  return {
    category: 'unknown',
    label: '未知失败',
    message: `${targetPath} 删除失败：${raw || '未知错误'}`,
    raw
  };
}

function getWindowsCleanupPathKeywords() {
  return [
    normalizeWindowsPathForCompare(path.join(process.env.APPDATA || '', 'npm')),
    normalizeWindowsPathForCompare(path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw')),
    normalizeWindowsPathForCompare(path.join(os.homedir(), '.openclaw')),
    normalizeWindowsPathForCompare(path.join(process.env.LOCALAPPDATA || '', 'openclaw')),
    normalizeWindowsPathForCompare(path.join(process.env.LOCALAPPDATA || '', 'openclaw-gateway'))
  ].filter(Boolean);
}

function detectWindowsCleanupProcessRelationship(proc, pathKeywords = getWindowsCleanupPathKeywords()) {
  const name = String(proc?.name || '').toLowerCase();
  const commandLine = String(proc?.commandLine || '').toLowerCase();
  const executablePath = String(proc?.executablePath || '').toLowerCase();
  const haystacks = [name, commandLine, executablePath];
  const reasons = [];
  const residueReasons = [];
  const genericReasons = [];
  const suspectTypes = new Set();

  const targetNames = [
    ['node', 'node'],
    ['npm', 'npm'],
    ['npx', 'npx'],
    ['powershell', 'powershell'],
    ['pwsh', 'pwsh'],
    ['openclaw', 'openclaw'],
    ['openclaw-gateway', 'openclaw-gateway']
  ];

  for (const [token, type] of targetNames) {
    if (haystacks.some((value) => value.includes(token))) {
      const label = `命中 ${token}`;
      reasons.push(label);
      genericReasons.push(label);
      suspectTypes.add(type);
    }
  }

  const relationHints = [
    ['openclaw', 'openclaw 关键字'],
    ['clawbox', 'clawbox 关键字'],
    ['node_modules/openclaw', 'openclaw 包目录'],
    ['npm/node_modules/openclaw', 'npm global openclaw 目录'],
    ['appdata/npm', '%APPDATA%/npm'],
    ['localappdata/openclaw', '%LOCALAPPDATA%/openclaw'],
    ['openclaw-gateway', 'openclaw-gateway 关键字']
  ];

  for (const [token, label] of relationHints) {
    if (haystacks.some((value) => value.includes(token))) {
      const reason = `命中 ${label}`;
      reasons.push(reason);
      residueReasons.push(reason);
    }
  }

  for (const keyword of pathKeywords) {
    if (!keyword) continue;
    if (commandLine.includes(keyword) || executablePath.includes(keyword)) {
      const reason = `命中路径 ${keyword}`;
      reasons.push(reason);
      residueReasons.push(reason);
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const uniqueResidueReasons = [...new Set(residueReasons)];
  const uniqueGenericReasons = [...new Set(genericReasons)];
  return {
    relevant: uniqueReasons.length > 0,
    reasons: uniqueReasons,
    residueReasons: uniqueResidueReasons,
    genericReasons: uniqueGenericReasons,
    hasResidueEvidence: uniqueResidueReasons.length > 0,
    suspectTypes: [...suspectTypes],
    suspicionScore: uniqueResidueReasons.length * 10 + uniqueGenericReasons.length
  };
}

function getWindowsSelfProtectionContext() {
  const currentPid = Number(process.pid || 0);
  const currentParentPid = Number(process.ppid || 0);
  const protectedPidSet = new Set([currentPid, currentParentPid].filter((pid) => pid > 0));
  const protectedProcessEntries = [];
  const reasonByPid = new Map();

  const script = [
    'Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |',
    'Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath |',
    'ConvertTo-Json -Compress'
  ].join(' ');

  try {
    const processes = runPowerShellJson(script, 30000)
      .map((item) => ({
        pid: Number(item.ProcessId || 0),
        parentPid: Number(item.ParentProcessId || 0),
        name: item.Name || '',
        commandLine: item.CommandLine || '',
        executablePath: item.ExecutablePath || ''
      }))
      .filter((item) => item.pid > 0);

    const processMap = new Map(processes.map((item) => [item.pid, item]));
    const ancestorChain = [];
    const visited = new Set();
    let pointer = currentPid;

    while (pointer > 0 && !visited.has(pointer)) {
      visited.add(pointer);
      const proc = processMap.get(pointer);
      if (!proc) break;
      ancestorChain.push(proc);
      protectedPidSet.add(proc.pid);
      pointer = Number(proc.parentPid || 0);
    }

    for (const proc of ancestorChain) {
      const pid = Number(proc.pid || 0);
      if (!pid) continue;
      let reason = '当前 ClawBox 进程树';
      if (pid === currentPid) reason = '当前 ClawBox server 进程';
      else if (pid === currentParentPid) reason = '当前进程的父进程';
      reasonByPid.set(pid, reason);
      protectedProcessEntries.push({ ...proc, skipReason: reason });
    }
  } catch (error) {
    reasonByPid.set(currentPid, '当前 ClawBox server 进程');
    if (currentParentPid > 0) reasonByPid.set(currentParentPid, '当前进程的父进程');
  }

  return {
    currentPid,
    currentParentPid,
    protectedPidSet,
    protectedProcessEntries,
    reasonByPid,
    isProtectedPid(pid) {
      return protectedPidSet.has(Number(pid || 0));
    },
    getSkipReason(pid) {
      return reasonByPid.get(Number(pid || 0)) || '当前 ClawBox 进程树';
    }
  };
}

function scanWindowsCleanupProcesses() {
  const script = [
    "$names = 'node','npm','npx','powershell','pwsh','openclaw','openclaw-gateway';",
    "$pathHints = @(",
    "  [Environment]::GetFolderPath('ApplicationData'),",
    "  (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'npm'),",
    "  (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'npm\\node_modules\\openclaw'),",
    "  (Join-Path $env:LOCALAPPDATA 'openclaw'),",
    "  (Join-Path $env:LOCALAPPDATA 'openclaw-gateway'),",
    "  (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.openclaw')",
    ");",
    "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |",
    "Where-Object {",
    "  $name = [string]$_.Name;",
    "  $cmd = [string]$_.CommandLine;",
    "  $exe = [string]$_.ExecutablePath;",
    "  $nameHit = ($names | Where-Object { $name -like \"$_*\" }).Count -gt 0;",
    "  $cmdHit = ($names | Where-Object { $cmd -match $_ -or $exe -match $_ }).Count -gt 0;",
    "  $pathHit = ($pathHints | Where-Object { $_ -and ($cmd -like \"*$_*\" -or $exe -like \"*$_*\") }).Count -gt 0;",
    "  $nameHit -or $cmdHit -or $pathHit",
    "} |",
    "Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath |",
    "ConvertTo-Json -Compress"
  ].join(' ');

  const pathKeywords = getWindowsCleanupPathKeywords();
  return runPowerShellJson(script, 30000)
    .map((item) => ({
      pid: Number(item.ProcessId || 0),
      parentPid: Number(item.ParentProcessId || 0),
      name: item.Name || '',
      commandLine: item.CommandLine || '',
      executablePath: item.ExecutablePath || ''
    }))
    .map((proc) => ({ ...proc, ...detectWindowsCleanupProcessRelationship(proc, pathKeywords) }))
    .filter((item) => item.pid && item.name && item.relevant)
    .sort((a, b) => (b.suspicionScore || 0) - (a.suspicionScore || 0) || a.pid - b.pid);
}

function killWindowsCleanupProcesses(processes, report, protectionContext = getWindowsSelfProtectionContext()) {
  for (const proc of processes) {
    if (protectionContext.isProtectedPid(proc.pid)) {
      const skipReason = protectionContext.getSkipReason(proc.pid);
      report.skippedProcesses.push({ ...proc, skipReason, skipCategory: 'self_tree' });
      report.logs.push(`跳过进程 ${proc.name} (PID ${proc.pid}): ${skipReason}`);
      continue;
    }

    if (!proc.hasResidueEvidence) {
      const skipReason = '仅命中通用进程名，未命中 openclaw 残留路径/命令行';
      report.skippedProcesses.push({ ...proc, skipReason, skipCategory: 'generic_name_only' });
      report.logs.push(`跳过进程 ${proc.name} (PID ${proc.pid}): ${skipReason}`);
      continue;
    }

    try {
      const result = spawnSync('taskkill', ['/PID', String(proc.pid), '/F', '/T'], {
        encoding: 'utf8',
        timeout: 15000,
        env: getExtendedShellEnv(),
        windowsHide: true
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      if (result.status === 0) {
        report.killedProcesses.push({ ...proc, output: output || '已结束' });
        report.logs.push(`已结束进程 ${proc.name} (PID ${proc.pid})`);
      } else {
        report.processKillFailures.push({ ...proc, error: output || '结束失败' });
        report.logs.push(`结束进程失败 ${proc.name} (PID ${proc.pid}): ${output || '结束失败'}`);
      }
    } catch (error) {
      const message = error.message || '结束失败';
      report.processKillFailures.push({ ...proc, error: message });
      report.logs.push(`结束进程失败 ${proc.name} (PID ${proc.pid}): ${message}`);
    }
  }
}

function addUniqueCleanupHit(list, item, key = 'path') {
  const value = normalizeWindowsPathForCompare(item?.[key]);
  if (!value) return;
  if (!list.some((entry) => normalizeWindowsPathForCompare(entry?.[key]) === value)) {
    list.push(item);
  }
}

function collectWindowsCleanupTargets(toolName, commandName, report, options = {}) {
  const allowDelete = options.allowDelete !== false;
  const scanMode = options.scanMode || (allowDelete ? 'delete' : 'scan_only');
  const whereCommand = `where ${commandName} 2>nul`;
  const whereResult = runShellCommand(whereCommand, { timeout: 10000, shell: 'cmd.exe' });
  const wherePaths = safeTrimLines(whereResult.stdout || whereResult.output);
  const whereStatus = wherePaths.length ? `命中 ${wherePaths.length} 条` : '未命中';
  report.logs.push(`${toolName}: where ${commandName} ${whereStatus}`);
  wherePaths.forEach((hitPath) => addUniqueCleanupHit(report.foundPaths, {
    tool: toolName,
    source: `where ${commandName}`,
    path: hitPath,
    kind: 'wrapper',
    safeToDelete: allowDelete,
    scanMode
  }));

  const appDataNpmDir = path.join(process.env.APPDATA || '', 'npm');
  if (appDataNpmDir) {
    const patterns = [commandName + '.cmd', commandName + '.ps1', commandName, commandName + '.exe'];
    for (const pattern of patterns) {
      const candidate = path.join(appDataNpmDir, pattern);
      if (fs.existsSync(candidate)) {
        addUniqueCleanupHit(report.foundPaths, {
          tool: toolName,
          source: '%APPDATA%\\npm',
          path: candidate,
          kind: 'wrapper',
          safeToDelete: allowDelete,
          scanMode
        });
      }
    }

    const moduleDir = path.join(appDataNpmDir, 'node_modules', commandName);
    if (fs.existsSync(moduleDir)) {
      addUniqueCleanupHit(report.foundPaths, {
        tool: toolName,
        source: '%APPDATA%\\npm\\node_modules',
        path: moduleDir,
        kind: 'package_dir',
        safeToDelete: allowDelete,
        scanMode
      });
    }
  }

  const npmRoot = runShellCommand('npm root -g', { timeout: 15000, shell: 'cmd.exe' }).output;
  const npmPrefix = runShellCommand('npm prefix -g', { timeout: 15000, shell: 'cmd.exe' }).output;
  const npmDirs = [npmRoot, npmPrefix].flatMap((value) => safeTrimLines(value));
  for (const dir of npmDirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    const candidates = [
      path.join(dir, commandName),
      path.join(dir, commandName + '.cmd'),
      path.join(dir, commandName + '.ps1'),
      path.join(dir, 'node_modules', commandName)
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      let isDirectory = false;
      try { isDirectory = fs.statSync(candidate).isDirectory(); } catch {}
      addUniqueCleanupHit(report.foundPaths, {
        tool: toolName,
        source: 'npm prefix/root -g',
        path: candidate,
        kind: isDirectory ? 'package_dir' : 'wrapper',
        safeToDelete: allowDelete,
        scanMode
      });
    }
  }
}
function collectWindowsOptionalCleanupTargets(report) {
  const openclawHome = path.join(os.homedir(), '.openclaw');
  const cacheTargets = [
    {
      tool: 'OpenClaw',
      path: path.join(openclawHome, 'openclaw.exe'),
      kind: 'wrapper',
      safeToDelete: true,
      scanMode: 'delete'
    },
    {
      tool: 'OpenClaw',
      path: path.join(openclawHome, 'bin'),
      kind: 'package_dir',
      safeToDelete: true,
      scanMode: 'delete'
    },
    {
      tool: 'OpenClaw',
      path: path.join(openclawHome, 'workspace'),
      kind: 'workspace',
      safeToDelete: false,
      scanMode: 'scan_only',
      preserveReason: '保留用户工作区，仅扫描不删除'
    },
    {
      tool: 'OpenClaw',
      path: path.join(openclawHome, 'openclaw.json'),
      kind: 'config',
      safeToDelete: false,
      scanMode: 'scan_only',
      preserveReason: '保留初始化配置，仅扫描不删除'
    },
    {
      tool: 'OpenClaw',
      path: path.join(process.env.LOCALAPPDATA || '', 'openclaw'),
      kind: 'cache',
      safeToDelete: true,
      scanMode: 'delete'
    },
    {
      tool: 'OpenClaw',
      path: path.join(process.env.LOCALAPPDATA || '', 'openclaw-gateway'),
      kind: 'cache',
      safeToDelete: true,
      scanMode: 'delete'
    },
    {
      tool: 'ClawHub',
      path: path.join(openclawHome, 'clawhub-path.json'),
      kind: 'cache',
      safeToDelete: false,
      scanMode: 'scan_only',
      preserveReason: '仅作为 ClawHub 路径缓存扫描，不参与删除'
    }
  ];

  for (const item of cacheTargets) {
    if (item.path && fs.existsSync(item.path)) {
      addUniqueCleanupHit(report.foundPaths, {
        tool: item.tool,
        source: 'optional-cache',
        path: item.path,
        kind: item.kind,
        safeToDelete: item.safeToDelete,
        scanMode: item.scanMode,
        preserveReason: item.preserveReason || ''
      });
    }
  }
}

function getOpenClawStateCleanupTargets(homeDir = os.homedir(), tempDir = os.tmpdir()) {
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(homeDir, '.openclaw');
  return [
    path.join(stateDir, 'workspace'),
    path.join(stateDir, 'openclaw.json'),
    path.join(stateDir, PLATFORM === 'win32' ? 'openclaw.exe' : 'openclaw'),
    path.join(stateDir, 'bin'),
    path.join(tempDir, 'openclaw')
  ].filter(Boolean);
}

function shouldAttemptRenameThenDelete(item, failure) {
  if (!item?.safeToDelete) return false;
  if (!failure || failure.category !== 'busy') return false;
  if (!item.path) return false;
  const normalized = normalizeWindowsPathForCompare(item.path);
  return normalized.includes('/openclaw') || normalized.includes('/npm/node_modules/openclaw') || item.kind === 'wrapper' || item.kind === 'package_dir';
}

function buildPendingDeletePath(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  return path.join(dir, `${base}.__clawbox_pending_delete__${Date.now()}`);
}

function guessCleanupLockerAdvice(entry, report) {
  const processTypes = new Set();
  for (const proc of [...(report?.scannedProcesses || []), ...(report?.killedProcesses || []), ...(report?.processKillFailures || [])]) {
    for (const type of (proc?.suspectTypes || [])) processTypes.add(type);
    const name = String(proc?.name || '').toLowerCase();
    if (name.includes('openclaw-gateway')) processTypes.add('openclaw-gateway');
    else if (name.includes('openclaw')) processTypes.add('openclaw');
    if (name.includes('node')) processTypes.add('node');
    if (name.includes('npm')) processTypes.add('npm');
    if (name.includes('npx')) processTypes.add('npx');
    if (name.includes('powershell')) processTypes.add('powershell');
    if (name.includes('pwsh')) processTypes.add('pwsh');
  }

  const suspects = [];
  const normalizedPath = normalizeWindowsPathForCompare(entry?.path || '');
  const raw = String(entry?.raw || '').toLowerCase();

  if (processTypes.has('openclaw-gateway')) suspects.push('openclaw-gateway');
  if (processTypes.has('openclaw')) suspects.push('openclaw');
  if (processTypes.has('node')) suspects.push('node');
  if (processTypes.has('npm')) suspects.push('npm');
  if (processTypes.has('npx')) suspects.push('npx');
  if (processTypes.has('powershell')) suspects.push('powershell');
  if (processTypes.has('pwsh')) suspects.push('pwsh');
  if ((entry?.category === 'busy' || raw.includes('sharing violation') || raw.includes('used by another process')) && suspects.length === 0) {
    suspects.push(normalizedPath.includes('/npm/node_modules/openclaw') ? 'Defender-like unknown locker' : 'unknown locker');
  }

  const uniqueSuspects = [...new Set(suspects)];
  const advice = [];
  if (uniqueSuspects.some((item) => ['node', 'npm', 'npx', 'openclaw', 'openclaw-gateway'].includes(item))) {
    advice.push('先关闭相关 node / npm / openclaw 终端，再点一次“安装前清场”');
  }
  if (uniqueSuspects.some((item) => ['powershell', 'pwsh'].includes(item))) {
    advice.push('把仍开着的 PowerShell / pwsh 窗口关掉后再重试');
  }
  if (entry?.category === 'permission') {
    advice.push('若仍失败，尝试以管理员身份运行 ClawBox');
  }
  if (entry?.category === 'busy' || uniqueSuspects.includes('Defender-like unknown locker') || uniqueSuspects.includes('unknown locker')) {
    advice.push('若像是 Defender / 杀软或未知锁占用，等几秒后再次清场；还不行就重启 Windows 后第一时间重试');
  }

  return {
    likelyLockerTypes: uniqueSuspects,
    suggestedActions: [...new Set(advice)]
  };
}

function deleteWindowsCleanupTargets(report) {
  for (const item of report.foundPaths) {
    if (!item.safeToDelete) continue;
    const targetPath = item.path;
    if (!targetPath) continue;

    if (!fs.existsSync(targetPath)) {
      const failure = classifyWindowsCleanupFailure(targetPath, new Error('ENOENT: path not found'));
      report.failedDeletes.push({ ...item, ...failure, renameAttempted: false, renameSucceeded: false, finalDeleteSucceeded: false, ...guessCleanupLockerAdvice({ ...item, ...failure }, report) });
      report.logs.push(failure.message);
      continue;
    }

    let stats = null;
    try { stats = fs.lstatSync(targetPath); } catch {}

    try {
      fs.rmSync(targetPath, { recursive: !!stats?.isDirectory?.(), force: false });
      report.deletedPaths.push({ ...item, renameAttempted: false, renameSucceeded: false, finalDeleteSucceeded: true });
      report.logs.push(`已删除${item.kind === 'cache' ? '缓存' : '残留'}: ${targetPath}`);
      continue;
    } catch (error) {
      const failure = classifyWindowsCleanupFailure(targetPath, error);
      if (!shouldAttemptRenameThenDelete(item, failure)) {
        report.failedDeletes.push({ ...item, ...failure, renameAttempted: false, renameSucceeded: false, finalDeleteSucceeded: false, ...guessCleanupLockerAdvice({ ...item, ...failure }, report) });
        report.logs.push(failure.message);
        continue;
      }

      const pendingDeletePath = buildPendingDeletePath(targetPath);
      report.logs.push(`常规删除失败，尝试 rename-then-delete: ${targetPath} -> ${pendingDeletePath}`);
      let renameSucceeded = false;
      let finalDeleteSucceeded = false;
      let renameError = null;
      let finalDeleteError = null;

      try {
        fs.renameSync(targetPath, pendingDeletePath);
        renameSucceeded = true;
        report.logs.push(`rename 成功: ${pendingDeletePath}`);
      } catch (renameFailure) {
        renameError = renameFailure;
        report.logs.push(`rename 失败: ${renameFailure.message || renameFailure}`);
      }

      if (renameSucceeded) {
        try {
          let renamedStats = null;
          try { renamedStats = fs.lstatSync(pendingDeletePath); } catch {}
          fs.rmSync(pendingDeletePath, { recursive: !!renamedStats?.isDirectory?.(), force: false });
          finalDeleteSucceeded = true;
          report.logs.push(`rename 后删除成功: ${pendingDeletePath}`);
          report.deletedPaths.push({
            ...item,
            originalPath: targetPath,
            path: pendingDeletePath,
            renameAttempted: true,
            renameSucceeded: true,
            finalDeleteSucceeded: true
          });
          continue;
        } catch (deleteFailure) {
          finalDeleteError = deleteFailure;
          report.logs.push(`rename 后删除失败: ${deleteFailure.message || deleteFailure}`);
        }
      }

      const finalFailure = classifyWindowsCleanupFailure(renameSucceeded ? pendingDeletePath : targetPath, finalDeleteError || renameError || error);
      report.failedDeletes.push({
        ...item,
        ...finalFailure,
        originalPath: targetPath,
        path: renameSucceeded ? pendingDeletePath : targetPath,
        pendingDeletePath,
        renameAttempted: true,
        renameSucceeded,
        finalDeleteSucceeded,
        renameError: renameError ? String(renameError.message || renameError) : '',
        finalDeleteError: finalDeleteError ? String(finalDeleteError.message || finalDeleteError) : '',
        ...guessCleanupLockerAdvice({ ...item, ...finalFailure }, report)
      });
      const renameSummary = renameSucceeded ? 'rename 成功但删除仍失败' : 'rename 也失败';
      report.logs.push(`${finalFailure.message}（${renameSummary}）`);
    }
  }
}

function buildWindowsRepairEnvironmentReport() {
  const report = {
    platform: PLATFORM,
    supported: PLATFORM === 'win32',
    scanOnly: PLATFORM !== 'win32',
    scannedProcesses: [],
    skippedProcesses: [],
    killedProcesses: [],
    processKillFailures: [],
    foundPaths: [],
    deletedPaths: [],
    failedDeletes: [],
    scanOnlyPaths: [],
    logs: [],
    summary: {
      renameAttempted: 0,
      renameSucceeded: 0,
      renameDeleteSucceeded: 0
    },
    recommendation: {
      retryOpenClawInstall: false,
      level: 'info',
      message: ''
    }
  };

  if (PLATFORM !== 'win32') {
    report.logs.push('当前“安装前清场”仅针对 Windows 环境设计；此平台不执行清理动作。');
    report.recommendation.message = '当前平台无需执行 Windows 安装前清场。';
    return report;
  }

  const protectionContext = getWindowsSelfProtectionContext();
  report.logs.push(`开始扫描 Windows 安装残留（已保护当前 ClawBox 进程树：PID ${protectionContext.currentPid || '-'} / PPID ${protectionContext.currentParentPid || '-'}）...`);
  report.scannedProcesses = scanWindowsCleanupProcesses();
  report.logs.push(report.scannedProcesses.length
    ? `扫描到 ${report.scannedProcesses.length} 个相关进程（含 node / npm / npx / powershell / pwsh / openclaw / openclaw-gateway 及命令行路径特征；仅会结束明确命中 openclaw 残留且不属于当前 ClawBox 进程树的进程）`
    : '未扫描到明确相关进程；如果目录仍被占用，更像是短暂锁、杀软扫描或未命中路径的外部进程');

  if (report.scannedProcesses.length) {
    killWindowsCleanupProcesses(report.scannedProcesses, report, protectionContext);
  }

  collectWindowsCleanupTargets('OpenClaw', 'openclaw', report, { allowDelete: true, scanMode: 'delete' });
  collectWindowsCleanupTargets('ClawHub', 'clawhub', report, { allowDelete: false, scanMode: 'scan_only' });
  collectWindowsOptionalCleanupTargets(report);
  deleteWindowsCleanupTargets(report);
  report.scanOnlyPaths = report.foundPaths.filter((item) => !item.safeToDelete);
  const preservedOpenClawPaths = report.scanOnlyPaths.filter((item) => item.tool === 'OpenClaw');
  if (preservedOpenClawPaths.length) {
    report.logs.push(`以下 OpenClaw 用户配置按保留策略仅扫描未删除: ${preservedOpenClawPaths.map((item) => item.path).join('；')}`);
  }
  report.summary.renameAttempted = report.failedDeletes.filter((item) => item.renameAttempted).length + report.deletedPaths.filter((item) => item.renameAttempted).length;
  report.summary.renameSucceeded = report.failedDeletes.filter((item) => item.renameSucceeded).length + report.deletedPaths.filter((item) => item.renameSucceeded).length;
  report.summary.renameDeleteSucceeded = report.deletedPaths.filter((item) => item.renameAttempted && item.finalDeleteSucceeded).length;

  const hasBlockingResidue = report.failedDeletes.some((item) => item.category !== 'missing') || report.processKillFailures.length > 0;
  const cleanedSomething = report.killedProcesses.length > 0 || report.deletedPaths.length > 0;

  if (hasBlockingResidue) {
    const busyFailures = report.failedDeletes.filter((item) => item.category === 'busy');
    const suspectSet = new Set(busyFailures.flatMap((item) => item.likelyLockerTypes || []));
    const suspectText = suspectSet.size ? `当前更像是被 ${[...suspectSet].join(' / ')} 占着。` : '当前更像是还有进程或系统锁占着。';
    report.recommendation = {
      retryOpenClawInstall: false,
      level: 'warn',
      message: `还有 OpenClaw 残留没清干净，先处理被占用或权限问题，再重试安装更稳。${suspectText}`
    };
  } else if (cleanedSomething || report.foundPaths.length > 0) {
    report.recommendation = {
      retryOpenClawInstall: true,
      level: 'success',
      message: report.scanOnlyPaths.length
        ? 'OpenClaw 清场已完成；ClawHub 仅扫描未删除。建议现在重新尝试安装 OpenClaw。'
        : '清场已完成，建议现在重新尝试安装 OpenClaw。'
    };
  } else {
    report.recommendation = {
      retryOpenClawInstall: true,
      level: 'info',
      message: '没发现明显残留，可以直接重试 OpenClaw 安装；如果还报 EBUSY，再回来看更细日志。'
    };
  }

  return report;
}

function buildInstallFailureHint(errorMessage) {
  const text = String(errorMessage || '').toLowerCase();
  if (!text) return '';
  if (text.includes('ebusy') || text.includes('used by another process') || text.includes('resource busy')) {
    return '检测到疑似 EBUSY / 文件占用问题：通常是旧的 node/openclaw/clawhub 进程、半残 wrapper 或缓存残留没清掉。建议先去工具页执行一次“安装前清场 / 修复安装环境”，再重试安装。';
  }
  return '';
}

function getGatewayStatusJson(requireRpc = false) {
  const openclawPath = resolveOpenClawPath();
  if (!openclawPath) {
    return {
      ok: false,
      status: null,
      data: null,
      stdout: '',
      stderr: '',
      error: '未找到 openclaw 可执行文件'
    };
  }

  const args = ['gateway', 'status', '--json'];
  if (requireRpc) args.push('--require-rpc');

  const result = runCliCommand(openclawPath, args, {
    timeout: 15000,
    env: getExtendedShellEnv()
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

function isGatewayStatusPrepared(status) {
  if (!status || typeof status !== 'object') return false;
  if (isGatewayStatusRunning(status)) return true;

  const serviceLoaded = findBoolean(status, [
    ['service', 'loaded'],
    ['gateway', 'loaded'],
    ['serviceLoaded']
  ]);

  const runtimeStatus = String(findString(status, [
    ['service', 'runtime', 'status'],
    ['gateway', 'runtime', 'status'],
    ['runtime', 'status'],
    ['status']
  ]) || '').toLowerCase();

  if (serviceLoaded === true) return true;
  return ['ready', 'running', 'stopped', 'installed'].includes(runtimeStatus);
}

/**
 * 检查 Node.js 版本
 */
function checkNodeVersion() {
  const [major] = process.versions.node.split('.').map(Number);
  return major >= 18;
}

function readCommandVersion(commandPath, args = ['--version']) {
  if (!commandPath) return null;
  try {
    const result = spawnSync(commandPath, args, {
      encoding: 'utf8',
      timeout: 5000,
      env: getExtendedShellEnv()
    });
    if (result.status === 0) {
      return (result.stdout || result.stderr || '').trim() || null;
    }
  } catch {}
  return null;
}

function getWindowsNodeCommonPaths() {
  const home = os.homedir();
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'nodejs', 'node.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'nodejs', 'node.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'nodejs', 'node.exe'),
    path.join(home, 'scoop', 'apps', 'nodejs-lts', 'current', 'node.exe'),
    path.join(home, 'scoop', 'apps', 'nodejs', 'current', 'node.exe'),
    path.join(process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey', 'bin', 'node.exe'),
    path.join(process.env.APPDATA || '', 'npm', 'node.exe'),
  ];

  return [...new Set(candidates.filter(Boolean))];
}

function getNodeCommonPaths() {
  const home = os.homedir();

  if (PLATFORM === 'win32') {
    return getWindowsNodeCommonPaths();
  }

  if (PLATFORM === 'darwin') {
    return [
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      path.join(home, '.nvm/current/bin/node'),
      path.join(home, '.local/bin/node')
    ];
  }

  return [
    '/usr/local/bin/node',
    '/usr/bin/node',
    path.join(home, '.nvm/current/bin/node'),
    path.join(home, '.local/bin/node')
  ];
}

function detectNodeSource(nodePath) {
  if (!nodePath) return 'unknown';
  const normalized = nodePath.replace(/\\/g, '/').toLowerCase();

  if (normalized.includes('/.nvm/')) return 'nvm';
  if (normalized.includes('/scoop/')) return 'scoop';
  if (normalized.includes('/chocolatey/')) return 'chocolatey';
  if (normalized.includes('/program files/nodejs/')) return 'windows_official';
  if (normalized.includes('/program files (x86)/nodejs/')) return 'windows_official';
  if (normalized.includes('/local/programs/nodejs/')) return 'windows_official';
  if (normalized.includes('/opt/homebrew/')) return 'homebrew';
  if (normalized.includes('/usr/local/bin/')) return 'standalone';
  if (normalized.includes('/usr/bin/')) return 'system';
  return 'unknown';
}

function resolveNodePath() {
  return resolveExecutablePath('node', { commonPaths: getNodeCommonPaths() });
}

function getNodeInstallationInfo(options = {}) {
  const allowProcessFallback = options.allowProcessFallback !== false;
  const resolvedPath = resolveNodePath();

  if (resolvedPath) {
    return {
      installed: true,
      path: resolvedPath,
      version: readCommandVersion(resolvedPath, ['-v']) || process.version || null,
      source: detectNodeSource(resolvedPath),
      via: 'resolved'
    };
  }

  if (
    allowProcessFallback &&
    process.execPath &&
    /^(node|node\.exe)$/i.test(path.basename(process.execPath))
  ) {
    return {
      installed: true,
      path: process.execPath,
      version: process.version || readCommandVersion(process.execPath, ['-v']) || null,
      source: detectNodeSource(process.execPath),
      via: 'process'
    };
  }

  return { installed: false, path: null, version: null, source: null, via: null };
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
 * 按平台返回扩展 PATH 的搜索目录列表
 */
function getExtendedPathDirs() {
  const home = os.homedir();

  const common = [
    path.join(home, '.local/bin'),
    path.join(home, '.local/share/pnpm'),
    path.join(home, '.nvm/current/bin'),
  ];

  switch (PLATFORM) {
    case 'darwin':
      return [
        '/opt/homebrew/bin',       // Apple Silicon Homebrew
        '/usr/local/bin',          // Intel Homebrew
        ...common,
      ];

    case 'win32':
      return [
        path.join(home, 'scoop/shims'),
        'C:\\ProgramData\\chocolatey\\bin',
        path.join(process.env.ProgramFiles || '', 'nodejs'),
        path.join(process.env['ProgramFiles(x86)'] || '', 'nodejs'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
        path.join(process.env.LOCALAPPDATA || '', 'nodejs'),
        path.join(process.env.APPDATA || '', 'npm'),
        path.join(process.env.LOCALAPPDATA || '', 'pnpm'),
      ];

    default: // linux
      return [
        '/usr/local/bin',
        '/usr/bin',
        ...common,
      ];
  }
}

/**
 * 构造扩展后的 env 对象（PATH 里补上常见安装位置）
 */
function getExtendedShellEnv() {
  const extraDirs = getExtendedPathDirs();
  const extendedPath = [
    process.env.PATH || '',
    ...extraDirs,
  ].filter(Boolean).join(PATH_SEP);

  return { ...process.env, PATH: extendedPath };
}

/**
 * 按平台执行 shell 命令并返回输出
 * @param {string|object} commands - 字符串或 { linux, darwin, win32, default }
 * @param {number} timeout
 * @returns {string}
 */
function runPlatformCommand(commands, timeout = 5000) {
  const cmd = typeof commands === 'string'
    ? commands
    : (commands[PLATFORM] || commands.default || '');

  if (!cmd) return '';

  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout,
      env: getExtendedShellEnv(),
      shell: PLATFORM === 'win32' ? undefined : '/bin/sh',
    }).trim();
  } catch {
    return '';
  }
}

/**
 * 跨平台解析可执行文件路径
 */
function resolveExecutablePath(commandName, options = {}) {
  const env = getExtendedShellEnv();
  const commonPaths = [...(options.commonPaths || [])];
  const exeName = PLATFORM === 'win32' ? `${commandName}.exe` : commandName;

  // 1. 用平台命令查找
  const whichResult = runPlatformCommand(
    PLATFORM === 'win32'
      ? `where ${commandName} 2>nul`
      : `which ${commandName} 2>/dev/null || command -v ${commandName} 2>/dev/null`
  );

  if (whichResult) {
    // where/which 可能返回多行，逐个尝试
    const candidates = whichResult
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      let realPath = candidate;
      if (PLATFORM !== 'win32') {
        const resolved = PLATFORM === 'darwin'
          ? (() => { try { return fs.realpathSync(candidate); } catch { return ''; } })()
          : runPlatformCommand(`readlink -f "${candidate}" 2>/dev/null`);
        if (resolved) realPath = resolved;
      }

      if (fs.existsSync(realPath)) return realPath;
    }
  }

  // 2. 从当前 Node 进程路径推算
  try {
    const currentExecDir = path.dirname(process.execPath);
    const nodeParent = path.dirname(currentExecDir);
    commonPaths.push(path.join(currentExecDir, exeName));
    commonPaths.push(path.join(nodeParent, exeName));
    commonPaths.push(path.join(nodeParent, 'bin', exeName));
  } catch {}

  // 3. 常见路径列表直接检查
  for (const p of commonPaths) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {}
  }

  // 4. 全盘搜索（Windows 跳过，太慢且不可靠）
  if (PLATFORM !== 'win32') {
    const searchRoots = options.searchRoots || ['/usr', '/opt', '/home', os.homedir()];
    const found = runPlatformCommand(
      `find ${searchRoots.join(' ')} -name "${exeName}" -type f -executable 2>/dev/null | head -1`
    );
    if (found) return found;
  }

  return null;
}

function getOpenClawCommonPaths() {
  const home = os.homedir();
  const commonPaths = [
    path.join(home, '.local/share/pnpm/openclaw'),
    path.join(home, '.nvm/current/bin/openclaw'),
    path.join(home, '.local/bin/openclaw'),
  ];

  if (PLATFORM === 'darwin') {
    commonPaths.push('/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw');
  } else if (PLATFORM === 'win32') {
    commonPaths.push(...getWindowsOpenClawDirectPaths(), ...getWindowsWhereMatches('openclaw'));
  } else {
    commonPaths.push('/usr/local/bin/openclaw', '/usr/bin/openclaw');
  }

  return [...new Set(commonPaths.filter(Boolean))];
}

function probeOpenClawInstallation() {
  const commonPaths = getOpenClawCommonPaths();
  const probe = verifyCommandCandidates('openclaw', {
    cachedPath: resolveExecutablePath('openclaw', { commonPaths }),
    directPaths: commonPaths,
    versionArgs: ['--version'],
    helpArgs: ['--help'],
    helpPattern: /openclaw|usage/i
  });

  const whereOutput = PLATFORM === 'win32'
    ? getWindowsWhereMatches('openclaw').join('\n')
    : runShellCommand('which openclaw 2>/dev/null || command -v openclaw 2>/dev/null || echo ""', { timeout: 5000 }).output;

  let version = null;
  if (probe.matchedStep?.versionText) {
    version = probe.matchedStep.versionText.trim();
  } else if (probe.available && probe.command) {
    const versionResult = runCliCommand(probe.command, ['--version'], {
      timeout: 5000,
      env: getExtendedShellEnv()
    });
    version = versionResult.ok ? (versionResult.output || '').trim() || null : null;
  }

  return {
    installed: probe.available,
    path: probe.available ? probe.command : null,
    version,
    diagnostics: getCommandProbeDiagnostics('openclaw', probe),
    whereOutput: String(whereOutput || '').trim(),
    steps: probe.steps
  };
}

function resolveOpenClawPath() {
  return probeOpenClawInstallation().path;
}

function isOpenClawInstalled() {
  return probeOpenClawInstallation().installed;
}

function getOpenClawVersion() {
  return probeOpenClawInstallation().version;
}

/**
 * 检查 OpenClaw Gateway 是否正在运行
 */
function isGatewayRunning() {
  const result = getGatewayStatusJson();
  return result.ok && isGatewayStatusRunning(result.data);
}

/**
 * 检查是否是管理员/Root 用户
 */
function isRoot() {
  if (PLATFORM === 'win32') {
    try {
      execSync('net session 2>nul', { encoding: 'utf8', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
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

function writeUtf8BomFile(targetPath, content) {
  const body = Buffer.from(String(content || ''), 'utf8');
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  fs.writeFileSync(targetPath, Buffer.concat([bom, body]));
}

function mapWindowsPowerShellProgressLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return '';
  return WINDOWS_POWERSHELL_PROGRESS_MAP[trimmed] || trimmed;
}

function getWindowsOpenClawDirectPaths() {
  const home = os.homedir();
  return [
    path.join(home, '.openclaw', 'openclaw.exe'),
    path.join(home, '.openclaw', 'bin', 'openclaw.exe'),
    path.join(home, 'scoop', 'shims', 'openclaw.exe'),
    path.join(process.env.APPDATA || '', 'npm', 'openclaw.cmd'),
    path.join(process.env.APPDATA || '', 'npm', 'openclaw')
  ].filter(Boolean);
}

function normalizeWindowsCliCandidate(candidate) {
  const normalized = normalizeWindowsWrapperPath(candidate);
  if (PLATFORM !== 'win32' || !normalized) return normalized;

  const lower = normalized.toLowerCase();
  if (lower.endsWith('.ps1')) {
    const cmdCandidate = `${normalized.slice(0, -4)}.cmd`;
    if (fs.existsSync(cmdCandidate)) return cmdCandidate;
  }

  if (!path.extname(normalized)) {
    const cmdCandidate = `${normalized}.cmd`;
    if (fs.existsSync(cmdCandidate)) return cmdCandidate;
  }

  return normalized;
}

function sortWindowsCommandCandidates(candidates = []) {
  if (PLATFORM !== 'win32') return candidates;

  const score = (candidate) => {
    const lower = String(candidate || '').toLowerCase();
    if (lower.endsWith('.exe')) return 0;
    if (lower.endsWith('.cmd')) return 1;
    if (lower.endsWith('.bat')) return 2;
    if (lower.endsWith('.ps1')) return 9;
    return 5;
  };

  return [...candidates].sort((left, right) => score(left) - score(right));
}

function getWindowsWhereMatches(commandName) {
  if (PLATFORM !== 'win32') return [];
  const result = runShellCommand(`where ${commandName} 2>nul`, { timeout: 8000, shell: 'cmd.exe' });
  if (!result.ok && !String(result.output || '').trim()) return [];
  const normalized = safeTrimLines(result.stdout || result.output)
    .map((item) => normalizeWindowsCliCandidate(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .filter((item) => !/\.ps1$/i.test(item));
  return sortWindowsCommandCandidates(normalized);
}

function detectInteractiveSetupPrompt(line) {
  const text = String(line || '').trim();
  const lower = text.toLowerCase();
  if (!text) return false;
  return [
    'starting setup...',
    'security warning',
    'continue? yes / no',
    'i understand this is personal-by-default'
  ].some((token) => lower.includes(token));
}

function inferWindowsInstallStage(line) {
  const text = String(line || '').trim();
  const lower = text.toLowerCase();
  if (!text) return null;
  if (detectInteractiveSetupPrompt(text)) {
    return { phase: 'init_config', detail: '检测到 OpenClaw 交互式安全确认；ClawBox 将停止自动 setup，改走非交互配置' };
  }
  if (text.includes('Git not found; bootstrapping user-local portable Git')) {
    return { phase: 'git_bootstrap', detail: '正在准备 portable Git（首次安装较慢）' };
  }
  if (/^Downloading v[\w.-]+\.windows/i.test(text) || lower.includes('portable git')) {
    return { phase: 'git_download', detail: '正在下载 portable Git（首次安装较慢）' };
  }
  if (text.includes('Installing OpenClaw (openclaw@latest)')) {
    return { phase: 'npm_install', detail: '正在通过 npm 安装 OpenClaw（首次安装可能持续数分钟）' };
  }
  if (lower.includes('npm install -g openclaw') || lower.includes('openclaw@latest')) {
    return { phase: 'npm_install', detail: '正在通过 npm 安装 OpenClaw（首次安装可能持续数分钟）' };
  }
  if (lower.includes('openclaw config set') || lower.includes('gateway install') || lower.includes('gateway refresh')) {
    return { phase: 'init_config', detail: '正在初始化 OpenClaw 配置' };
  }
  if (lower.includes('where openclaw') || lower.includes('--version') || lower.includes('gateway status')) {
    return { phase: 'verify', detail: '正在验证安装结果' };
  }
  return null;
}

function getWindowsIdleInstallHint(phase) {
  switch (phase) {
    case 'git_bootstrap':
    case 'git_download':
      return 'CLAWBOX_HINT:GIT_DOWNLOAD_WAIT';
    case 'npm_install':
      return 'CLAWBOX_HINT:NPM_INSTALL_WAIT';
    case 'init_config':
      return 'CLAWBOX_HINT:INIT_CONFIG_WAIT';
    case 'verify':
      return 'CLAWBOX_HINT:VERIFY_WAIT';
    default:
      return '提示：安装脚本仍在执行，正在等待下一段真实输出';
  }
}

const DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL = 'https://github.com/';
const DEFAULT_WINDOWS_GITHUB_GIT_MIRROR_BASE_URL = 'https://gitclone.com/github.com/';
const DEFAULT_WINDOWS_PORTABLE_GIT_RELEASE_TAG = 'v2.53.0.windows.3';
const DEFAULT_WINDOWS_PORTABLE_GIT_VERSION = '2.53.0.3';
const DEFAULT_WINDOWS_PORTABLE_GIT_MIRROR_BASE_URL = 'https://npmmirror.com/mirrors/git-for-windows/';

function normalizeGithubGitBaseUrl(value, fallback = DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL) {
  const raw = String(value || '').trim() || fallback;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function getWindowsGithubGitMirrorBaseUrl() {
  return normalizeGithubGitBaseUrl(process.env.CLAWBOX_GITHUB_GIT_MIRROR_BASE_URL, DEFAULT_WINDOWS_GITHUB_GIT_MIRROR_BASE_URL);
}

function getWindowsPortableGitBootstrapConfig() {
  const releaseTag = String(process.env.CLAWBOX_PORTABLE_GIT_RELEASE_TAG || '').trim() || DEFAULT_WINDOWS_PORTABLE_GIT_RELEASE_TAG;
  const version = String(process.env.CLAWBOX_PORTABLE_GIT_VERSION || '').trim() || DEFAULT_WINDOWS_PORTABLE_GIT_VERSION;
  const mirrorBaseUrl = normalizeGithubGitBaseUrl(process.env.CLAWBOX_PORTABLE_GIT_MIRROR_BASE_URL, DEFAULT_WINDOWS_PORTABLE_GIT_MIRROR_BASE_URL);
  return {
    releaseTag,
    version,
    mirrorBaseUrl,
    assetNames: [
      `MinGit-${version}-64-bit.zip`,
      `MinGit-${version}-busybox-64-bit.zip`
    ]
  };
}

function getTemporaryGithubHttpsRewritePowerShellLines(baseUrl = DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL) {
  const normalizedBaseUrl = normalizeGithubGitBaseUrl(baseUrl);
  const rewrites = [
    ['ssh://git@github.com/', normalizedBaseUrl],
    ['git@github.com:', normalizedBaseUrl],
    ['git+ssh://git@github.com/', normalizedBaseUrl]
  ];

  if (normalizedBaseUrl !== DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL) {
    rewrites.push(['https://github.com/', normalizedBaseUrl]);
  }

  const logLine = normalizedBaseUrl === DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL
    ? '[ClawBox] Temporarily rewriting GitHub git+ssh dependencies to HTTPS for this install'
    : `[ClawBox] Temporarily rewriting GitHub git dependencies to ${normalizedBaseUrl} for this install`;

  return [
    `$env:GIT_CONFIG_COUNT='${rewrites.length}'`,
    ...rewrites.flatMap(([source, target], index) => [
      `$env:GIT_CONFIG_KEY_${index}='url.${target}.insteadof'`,
      `$env:GIT_CONFIG_VALUE_${index}='${source}'`
    ]),
    `Write-Output '${logLine}'`
  ];
}

function buildWindowsInstallCommandText(options = {}) {
  const registry = String(options.registry || 'https://registry.npmmirror.com').trim() || 'https://registry.npmmirror.com';
  const githubBaseUrl = normalizeGithubGitBaseUrl(options.githubBaseUrl, DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL);
  const portableGitConfig = getWindowsPortableGitBootstrapConfig();
  return [
    `$env:NPM_CONFIG_REGISTRY='${registry}'`,
    `$env:npm_config_registry='${registry}'`,
    ...getTemporaryGithubHttpsRewritePowerShellLines(githubBaseUrl),
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
    ...buildWindowsPortableGitBootstrapPowerShellLines(portableGitConfig),
    "Write-Output 'CLAWBOX_STAGE:CHECK_PREREQ'",
    "$clawboxInstallScript = Join-Path $env:TEMP 'openclaw-install.ps1'",
    "Invoke-WebRequest -UseBasicParsing -Uri 'https://openclaw.ai/install.ps1' -OutFile $clawboxInstallScript",
    "& powershell -NoProfile -ExecutionPolicy Bypass -File $clawboxInstallScript"
  ].join('; ');
}

function buildWindowsOpenClawUpdateCommandText(options = {}) {
  const registry = String(options.registry || 'https://registry.npmmirror.com').trim() || 'https://registry.npmmirror.com';
  const githubBaseUrl = normalizeGithubGitBaseUrl(options.githubBaseUrl, DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL);
  const portableGitConfig = getWindowsPortableGitBootstrapConfig();
  const actionMessage = String(options.actionMessage || '[ClawBox] Updating OpenClaw via the official Windows installer flow').replace(/'/g, "''");

  return [
    `$env:NPM_CONFIG_REGISTRY='${registry}'`,
    `$env:npm_config_registry='${registry}'`,
    ...getTemporaryGithubHttpsRewritePowerShellLines(githubBaseUrl),
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12",
    ...buildWindowsPortableGitBootstrapPowerShellLines(portableGitConfig),
    "Write-Output 'CLAWBOX_STAGE:CHECK_PREREQ'",
    "Write-Output 'CLAWBOX_STAGE:NPM_UPDATE'",
    `Write-Output '${actionMessage}'`,
    "$clawboxInstallScript = Join-Path $env:TEMP 'openclaw-install.ps1'",
    "Invoke-WebRequest -UseBasicParsing -Uri 'https://openclaw.ai/install.ps1' -OutFile $clawboxInstallScript",
    "& powershell -NoProfile -ExecutionPolicy Bypass -File $clawboxInstallScript"
  ].join('; ');
}

function buildWindowsPortableGitBootstrapPowerShellLines(config = getWindowsPortableGitBootstrapConfig()) {
  const releaseTag = String(config.releaseTag || DEFAULT_WINDOWS_PORTABLE_GIT_RELEASE_TAG).trim() || DEFAULT_WINDOWS_PORTABLE_GIT_RELEASE_TAG;
  const version = String(config.version || DEFAULT_WINDOWS_PORTABLE_GIT_VERSION).trim() || DEFAULT_WINDOWS_PORTABLE_GIT_VERSION;
  const mirrorBaseUrl = normalizeGithubGitBaseUrl(config.mirrorBaseUrl, DEFAULT_WINDOWS_PORTABLE_GIT_MIRROR_BASE_URL);
  const assetNames = Array.isArray(config.assetNames) && config.assetNames.length
    ? config.assetNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [`MinGit-${version}-64-bit.zip`, `MinGit-${version}-busybox-64-bit.zip`];
  const assetListLiteral = assetNames.map((name) => `'${name}'`).join(', ');

  return [
    `$clawboxPortableGitReleaseTag='${releaseTag}'`,
    `$clawboxPortableGitVersion='${version}'`,
    `$clawboxPortableGitMirrorBaseUrl='${mirrorBaseUrl}'`,
    `$clawboxPortableGitAssetNames=@(${assetListLiteral})`,
    `function Add-ClawBoxPathEntry {
  param([string]$PathEntry)
  if ([string]::IsNullOrWhiteSpace($PathEntry)) { return }
  $entries = @($env:Path -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($entries | Where-Object { $_ -ieq $PathEntry }) { return }
  $env:Path = "$PathEntry;$env:Path"
}`,
    `function Test-ClawBoxGitCommand {
  try {
    $gitCommand = Get-Command git -ErrorAction Stop
    $null = & $gitCommand.Source --version 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}`,
    `function Use-ClawBoxPortableGitIfPresent {
  $portableRoot = Join-Path (Join-Path $env:LOCALAPPDATA 'OpenClaw\\deps') 'portable-git'
  $gitExe = Join-Path $portableRoot 'mingw64\\bin\\git.exe'
  if (-not (Test-Path $gitExe)) { return $false }
  foreach ($pathEntry in @(
    (Join-Path $portableRoot 'mingw64\\bin'),
    (Join-Path $portableRoot 'usr\\bin')
  )) {
    if (Test-Path $pathEntry) { Add-ClawBoxPathEntry $pathEntry }
  }
  try {
    $null = & $gitExe --version 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}`,
    `function Install-ClawBoxPortableGitFromMirror {
  $portableRoot = Join-Path (Join-Path $env:LOCALAPPDATA 'OpenClaw\\deps') 'portable-git'
  $portableParent = Split-Path -Parent $portableRoot
  foreach ($assetName in $clawboxPortableGitAssetNames) {
    $tmpZip = Join-Path $env:TEMP $assetName
    $tmpExtract = Join-Path $env:TEMP ('clawbox-portable-git-' + [guid]::NewGuid().ToString('N'))
    $assetUrl = "$clawboxPortableGitMirrorBaseUrl$clawboxPortableGitReleaseTag/$assetName"
    try {
      Write-Output 'CLAWBOX_STAGE:GIT_BOOTSTRAP'
      Write-Output "[ClawBox] Bootstrapping portable Git from $assetUrl"
      New-Item -ItemType Directory -Force -Path $portableParent | Out-Null
      if (Test-Path $portableRoot) { Remove-Item -Recurse -Force $portableRoot }
      if (Test-Path $tmpExtract) { Remove-Item -Recurse -Force $tmpExtract }
      New-Item -ItemType Directory -Force -Path $tmpExtract | Out-Null
      Invoke-WebRequest -UseBasicParsing -Uri $assetUrl -OutFile $tmpZip
      Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
      Move-Item -Path (Join-Path $tmpExtract '*') -Destination $portableRoot -Force
      if (Use-ClawBoxPortableGitIfPresent) {
        Write-Output "[ClawBox] Portable Git ready via mirror ($assetName)"
        return $true
      }
    } catch {
      Write-Output "[ClawBox] Portable Git mirror bootstrap failed: $assetUrl :: $($_.Exception.Message)"
    } finally {
      if (Test-Path $tmpZip) { Remove-Item -Force $tmpZip }
      if (Test-Path $tmpExtract) { Remove-Item -Recurse -Force $tmpExtract }
    }
  }
  return $false
}`,
    `function Install-ClawBoxPortableGitFromWinget {
  try {
    $wingetCommand = Get-Command winget -ErrorAction Stop
  } catch {
    return $false
  }
  try {
    Write-Output 'CLAWBOX_STAGE:GIT_BOOTSTRAP'
    Write-Output '[ClawBox] Git not found; trying Git.MinGit via winget'
    & $wingetCommand.Source install --id Git.MinGit --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
    if (Test-ClawBoxGitCommand) { return $true }
    $packageRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\\WinGet\\Packages'
    if (Test-Path $packageRoot) {
      $candidates = Get-ChildItem -Path $packageRoot -Filter 'Git.MinGit*' -Directory -ErrorAction SilentlyContinue
      foreach ($candidate in $candidates) {
        foreach ($pathEntry in @(
          (Join-Path $candidate.FullName 'mingw64\\bin'),
          (Join-Path $candidate.FullName 'cmd'),
          (Join-Path $candidate.FullName 'usr\\bin')
        )) {
          if (Test-Path $pathEntry) { Add-ClawBoxPathEntry $pathEntry }
        }
        if (Test-ClawBoxGitCommand) { return $true }
      }
    }
  } catch {
    Write-Output "[ClawBox] winget Git.MinGit bootstrap failed: $($_.Exception.Message)"
  }
  return $false
}`,
    `if (-not (Test-ClawBoxGitCommand)) {
  if (Use-ClawBoxPortableGitIfPresent) {
    Write-Output '[ClawBox] Reusing existing user-local portable Git'
  } elseif (-not (Install-ClawBoxPortableGitFromMirror)) {
    if (-not (Install-ClawBoxPortableGitFromWinget)) {
      Write-Output '[ClawBox] Portable Git pre-bootstrap did not succeed; falling back to the official installer bootstrap path'
    }
  }
}`
  ];
}

function createWindowsOfficialInstallCommand({ label, detail, registry = 'https://registry.npmmirror.com', githubBaseUrl = DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL }) {
  return {
    label,
    detail,
    run: (notify) => new Promise((resolve, reject) => {
      const commandText = buildWindowsInstallCommandText({ registry, githubBaseUrl });
      if (notify) {
        notify({ name: 'check_prereq', status: 'running', detail: '检查 Git / Node 环境...' });
        notify({ name: 'install_openclaw_stage', status: 'running', detail });
        notify({ name: 'install_openclaw_stage', status: 'running', detail: `npm registry（临时）: ${registry}` });
      }

      const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandText], {
        env: { ...getExtendedShellEnv(), NPM_CONFIG_REGISTRY: registry, npm_config_registry: registry },
        windowsHide: true
      });
      let output = '';
      let lineBuffer = '';
      let settled = false;
      let lastOutputAt = Date.now();
      let currentPhase = 'check_prereq';
      let lastHint = '';
      let interactiveSetupDetected = false;

      const emitLine = (rawLine) => {
        const mappedLine = mapWindowsPowerShellProgressLine(rawLine);
        const line = String(mappedLine || '').trim();
        if (!line) return;
        lastOutputAt = Date.now();
        if (detectInteractiveSetupPrompt(line)) {
          interactiveSetupDetected = true;
          if (notify) {
            notify({ name: 'init_config', status: 'error', detail: '检测到 OpenClaw 进入交互式 setup / 安全确认界面；ClawBox 已中止自动 setup，后续改走非交互配置。' });
          }
          try { proc.kill(); } catch {}
          return;
        }
        const inferred = inferWindowsInstallStage(line);
        if (inferred) {
          currentPhase = inferred.phase;
          const phaseName = inferred.phase === 'verify'
            ? 'verify'
            : (inferred.phase === 'init_config' ? 'init_config' : (inferred.phase.startsWith('git') ? 'check_prereq' : 'install_openclaw_stage'));
          if (notify) notify({ name: phaseName, status: 'running', detail: inferred.detail });
        }
        if (notify) {
          notify({ name: 'install_openclaw_stream', status: 'running', detail: line.slice(0, 240) });
        }
      };

      const forwardChunk = (chunk) => {
        const chunkText = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        output += chunkText;
        lineBuffer += chunkText;
        const parts = lineBuffer.split(/\r?\n/);
        lineBuffer = parts.pop() || '';
        for (const rawLine of parts) emitLine(rawLine);
      };

      const idleHandle = setInterval(() => {
        if (settled) return;
        if (Date.now() - lastOutputAt < 12000) return;
        const hint = mapWindowsPowerShellProgressLine(getWindowsIdleInstallHint(currentPhase));
        if (!hint || hint === lastHint) return;
        lastHint = hint;
        if (notify) notify({ name: 'install_openclaw_stage', status: 'running', detail: hint });
      }, 4000);

      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearInterval(idleHandle);
        try { proc.kill(); } catch {}
        reject(new Error(`安装脚本执行超时\n${output.slice(-800)}`));
      }, 900000);

      proc.stdout?.on('data', forwardChunk);
      proc.stderr?.on('data', forwardChunk);
      proc.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        clearInterval(idleHandle);
        reject(new Error(`启动 PowerShell 安装器失败: ${error.message}`));
      });
      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        clearInterval(idleHandle);
        emitLine(lineBuffer);
        if (interactiveSetupDetected) {
          resolve(`${output.trim()}\nCLAWBOX_NOTE:INTERACTIVE_SETUP_ABORTED`);
          return;
        }
        if (code === 0) {
          resolve(output.trim());
          return;
        }
        reject(new Error(`安装脚本退出码: ${code}\n${output.slice(-800)}`));
      });
    })
  };
}

function quoteWindowsCmdArg(value) {
  const stringValue = String(value ?? '');
  return `"${stringValue.replace(/"/g, '""').replace(/%/g, '%%')}"`;
}

function normalizeWindowsWrapperPath(command) {
  let normalized = String(command || '').trim();
  while ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
}

function buildWindowsCommandLine(command, args = []) {
  const normalizedCommand = normalizeWindowsWrapperPath(command);
  return [quoteWindowsCmdArg(normalizedCommand), ...args.map(quoteWindowsCmdArg)].join(' ');
}

function isWindowsCommandWrapper(commandPath) {
  return PLATFORM === 'win32' && /\.(cmd|bat)$/i.test(String(commandPath || ''));
}

function shouldUseWindowsCmdShell(shellOption) {
  if (PLATFORM !== 'win32') return false;
  if (!shellOption) return false;
  if (shellOption === true) return true;
  return /(^|\\)cmd\.exe$/i.test(String(shellOption));
}

function runCommand(command, args = [], options = {}) {
  const normalizedCommand = PLATFORM === 'win32'
    ? normalizeWindowsCliCandidate(command)
    : command;
  if (shouldUseWindowsCmdShell(options.shell)) {
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', normalizedCommand, ...args], {
      encoding: 'utf8',
      timeout: options.timeout || 15000,
      env: options.env || getExtendedShellEnv(),
      cwd: options.cwd || undefined,
      windowsHide: true
    });

    return {
      ok: result.status === 0 && !result.error,
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error || null,
      output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    };
  }

  const result = spawnSync(normalizedCommand, args, {
    encoding: 'utf8',
    timeout: options.timeout || 15000,
    env: options.env || getExtendedShellEnv(),
    shell: options.shell || false,
    cwd: options.cwd || undefined,
    windowsHide: PLATFORM === 'win32'
  });

  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  };
}

function runShellCommand(command, options = {}) {
  if (PLATFORM === 'win32') {
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
      encoding: 'utf8',
      timeout: options.timeout || 15000,
      env: options.env || getExtendedShellEnv(),
      cwd: options.cwd || undefined,
      windowsHide: true
    });
    return {
      ok: result.status === 0 && !result.error,
      status: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error || null,
      output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    };
  }

  try {
    const stdout = execSync(command, {
      encoding: 'utf8',
      timeout: options.timeout || 15000,
      env: options.env || getExtendedShellEnv(),
      shell: options.shell || (PLATFORM === 'win32' ? undefined : '/bin/sh')
    });
    return { ok: true, status: 0, stdout, stderr: '', error: null, output: stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      status: typeof error.status === 'number' ? error.status : null,
      stdout: typeof error.stdout === 'string' ? error.stdout : '',
      stderr: typeof error.stderr === 'string' ? error.stderr : '',
      error,
      output: getCommandOutput(error)
    };
  }
}

function runCliCommand(command, args = [], options = {}) {
  const normalizedCommand = PLATFORM === 'win32'
    ? normalizeWindowsCliCandidate(command)
    : command;

  if (isWindowsCommandWrapper(normalizedCommand)) {
    return runCommand(normalizedCommand, args, {
      ...options,
      shell: 'cmd.exe'
    });
  }

  return runCommand(normalizedCommand, args, options);
}

function getCommandResultText(result) {
  if (!result) return '';
  return String(
    result.output
    || [result.stdout, result.stderr].filter(Boolean).join('\n')
    || result.error?.message
    || ''
  ).trim();
}

function isMissingCommandResult(result) {
  const text = getCommandResultText(result).toLowerCase();
  if (result?.error?.code === 'ENOENT') return true;
  return [
    'enoent',
    'not found',
    'is not recognized as an internal or external command',
    '无法将',
    '不是内部或外部命令'
  ].some((token) => text.includes(token));
}

function isCommandProbeExecutionFailure(result) {
  const errorCode = String(result?.error?.code || '').toUpperCase();
  if (['EPERM', 'EACCES', 'EINVAL', 'UNKNOWN'].includes(errorCode)) return true;

  const text = getCommandResultText(result).toLowerCase();
  if (!text) return false;

  return [
    'spawnsync',
    'spawn ',
    'eperm',
    'eacces',
    'einval',
    'access is denied',
    'permission denied',
    'operation not permitted',
    'failed to start',
    'cannot execute'
  ].some((token) => text.includes(token));
}

function safeRegExpTest(pattern, text) {
  if (!(pattern instanceof RegExp)) return false;
  const flags = pattern.flags.replace(/g/g, '');
  return new RegExp(pattern.source, flags).test(text);
}

function isLikelyCommandHelpText(text, commandName, helpPattern) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) return false;

  const lower = normalizedText.toLowerCase();
  if ([
    'spawnsync',
    'spawn ',
    'eperm',
    'eacces',
    'einval',
    'enoent',
    'not found',
    'is not recognized as an internal or external command',
    'access is denied',
    'permission denied',
    'operation not permitted',
    'cannot find the file',
    'cannot find the path'
  ].some((token) => lower.includes(token))) {
    return false;
  }

  const hasHelpMarkers = [
    'usage',
    'commands',
    'options',
    'arguments',
    'examples',
    '--help',
    '-h, --help'
  ].some((token) => lower.includes(token));
  const mentionsCommand = commandName
    ? lower.includes(String(commandName).toLowerCase())
    : false;

  if (!hasHelpMarkers && !mentionsCommand) return false;
  return safeRegExpTest(helpPattern, normalizedText) || hasHelpMarkers;
}

function getOpenClawConfigPath() {
  return path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

function readOpenClawConfigFile() {
  const configPath = getOpenClawConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      return { exists: false, path: configPath, data: null };
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    return { exists: true, path: configPath, data: JSON.parse(raw) };
  } catch (error) {
    return { exists: true, path: configPath, data: null, error: error.message };
  }
}

function mergeOpenClawConfig(baseConfig = {}, patch = {}) {
  const source = (baseConfig && typeof baseConfig === 'object' && !Array.isArray(baseConfig)) ? baseConfig : {};
  const output = JSON.parse(JSON.stringify(source));

  if (!output.gateway || typeof output.gateway !== 'object' || Array.isArray(output.gateway)) {
    output.gateway = {};
  }
  output.gateway.mode = patch?.gateway?.mode || 'local';

  if (!output.gateway.auth || typeof output.gateway.auth !== 'object' || Array.isArray(output.gateway.auth)) {
    output.gateway.auth = {};
  }
  output.gateway.auth.mode = patch?.gateway?.auth?.mode || 'none';
  if (patch?.gateway?.auth?.token) {
    output.gateway.auth.token = patch.gateway.auth.token;
  } else if (output.gateway.auth.mode === 'token' && !output.gateway.auth.token) {
    output.gateway.auth.token = crypto.randomBytes(24).toString('hex');
  }

  return output;
}

function writeOpenClawConfigFile(nextConfig) {
  const configPath = getOpenClawConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(nextConfig, null, 2)}
`, 'utf8');
  fs.renameSync(tempPath, configPath);
  return configPath;
}

function hasGatewayStartConditions(configData) {
  if (!configData || typeof configData !== 'object') return false;

  const gatewayMode = findString(configData, [
    ['gateway', 'mode'],
    ['config', 'gateway', 'mode']
  ]);
  const authMode = findString(configData, [
    ['gateway', 'auth', 'mode'],
    ['config', 'gateway', 'auth', 'mode']
  ]);

  return gatewayMode === 'local' && ['none', 'token'].includes(authMode);
}

function getGatewayServiceArtifacts() {
  const home = os.homedir();

  if (PLATFORM === 'win32') {
    return [
      path.join(home, '.openclaw', 'openclaw-gateway.exe'),
      path.join(home, '.openclaw', 'bin', 'openclaw-gateway.exe')
    ];
  }

  if (PLATFORM === 'darwin') {
    return [
      path.join(home, 'Library', 'LaunchAgents', 'com.openclaw.gateway.plist')
    ];
  }

  return [
    path.join(home, '.config', 'systemd', 'user', 'openclaw-gateway.service')
  ];
}

function hasGatewayServiceArtifacts() {
  return getGatewayServiceArtifacts().some((artifact) => fs.existsSync(artifact));
}

function getRuntimeNodeInfo() {
  if (!process.execPath || !/^(node|node\.exe)$/i.test(path.basename(process.execPath))) {
    return { installed: false, path: null, version: null, source: null };
  }

  return {
    installed: true,
    path: process.execPath,
    version: process.version || readCommandVersion(process.execPath, ['-v']) || null,
    source: detectNodeSource(process.execPath)
  };
}

function inspectOpenClawState() {
  const openclawProbe = probeOpenClawInstallation();
  const openclawPath = openclawProbe.path;
  const installed = !!openclawProbe.installed;
  const version = openclawProbe.version || null;
  const clawhub = resolveClawHubBinary();
  const clawhubAvailable = isClawHubAvailable();
  const config = readOpenClawConfigFile();
  const gatewayStatus = installed ? getGatewayStatusJson() : {
    ok: false,
    status: null,
    data: null,
    stdout: '',
    stderr: '',
    error: 'openclaw 未安装'
  };
  const configReady = hasGatewayStartConditions(config.data);
  const gatewayReady = configReady && (
    isGatewayStatusPrepared(gatewayStatus.data)
    || (PLATFORM !== 'win32' && hasGatewayServiceArtifacts())
  );

  return {
    installed,
    openclawPath,
    version,
    clawhubAvailable,
    clawhubPath: clawhub.command === 'clawhub' ? null : clawhub.command,
    configExists: config.exists,
    configPath: config.path,
    configReady,
    configError: config.error || null,
    gatewayReady,
    gatewayRunning: gatewayStatus.ok && isGatewayStatusRunning(gatewayStatus.data),
    gatewayStatus,
    serviceArtifacts: getGatewayServiceArtifacts().filter((artifact) => fs.existsSync(artifact)),
    detection: {
      diagnostics: openclawProbe.diagnostics,
      whereOutput: openclawProbe.whereOutput,
      steps: openclawProbe.steps
    }
  };
}

function getCommandProbeCandidates(commandName, options = {}) {
  const normalized = [];
  const pushValue = (value) => {
    if (!value) return;
    const item = PLATFORM === 'win32'
      ? normalizeWindowsCliCandidate(value)
      : String(value).trim();
    if (!item) return;
    if (PLATFORM === 'win32' && /\.ps1$/i.test(item)) return;
    if (!normalized.includes(item)) normalized.push(item);
  };

  pushValue(options.cachedPath);
  for (const item of (options.directPaths || [])) pushValue(item);
  pushValue(commandName);
  return PLATFORM === 'win32'
    ? sortWindowsCommandCandidates(normalized)
    : normalized;
}

function verifyCommandCandidates(commandName, options = {}) {
  const env = options.env || getExtendedShellEnv();
  const candidates = getCommandProbeCandidates(commandName, options);
  const steps = [];
  const versionArgs = Array.isArray(options.versionArgs) ? options.versionArgs : ['--version'];
  const helpArgs = Array.isArray(options.helpArgs) ? options.helpArgs : ['--help'];
  const versionPattern = options.versionPattern || /\S+/i;
  const helpPattern = options.helpPattern || /\b(?:usage|commands?|options?)\b/i;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const step = { command: candidate, exists: null, versionOk: false, helpOk: false, versionText: '', helpText: '' };

    if (candidate !== commandName) {
      step.exists = fs.existsSync(candidate);
      if (!step.exists) {
        steps.push(step);
        continue;
      }
    }

    const versionResult = runCliCommand(candidate, versionArgs, { timeout: options.versionTimeout || 8000, env });
    step.versionText = getCommandResultText(versionResult);
    step.versionOk = versionResult.ok && versionPattern.test(step.versionText);
    if (step.versionOk) {
      steps.push(step);
      return { available: true, command: candidate, steps, matchedStep: step };
    }

    if (isMissingCommandResult(versionResult)) {
      steps.push(step);
      continue;
    }

    if (isCommandProbeExecutionFailure(versionResult)) {
      steps.push(step);
      continue;
    }

    const helpResult = runCliCommand(candidate, helpArgs, { timeout: options.helpTimeout || 8000, env });
    step.helpText = getCommandResultText(helpResult);
    step.helpOk = helpResult.ok || isLikelyCommandHelpText(step.helpText, commandName, helpPattern);
    steps.push(step);
    if (step.helpOk) {
      return { available: true, command: candidate, steps, matchedStep: step };
    }
  }

  return { available: false, command: candidates[0] || commandName, steps, matchedStep: null };
}

function getCommandProbeDiagnostics(commandName, probe) {
  const lines = [];
  for (const step of (probe?.steps || [])) {
    const bits = [step.command];
    if (step.exists === false) bits.push('missing');
    if (step.versionOk) bits.push(`version ok: ${step.versionText}`);
    else if (step.versionText) bits.push(`version: ${step.versionText}`);
    if (step.helpOk) bits.push('help ok');
    else if (step.helpText) bits.push(`help: ${step.helpText}`);
    lines.push(bits.join(' | '));
  }
  if (!lines.length) lines.push(`${commandName}: 无探测结果`);
  return lines.join('\n');
}

function resolveClawHubBinary(options = {}) {
  const env = options.env || getExtendedShellEnv();
  const cacheFile = path.join(os.homedir(), '.openclaw', 'clawhub-path.json');
  let cachedPath = '';

  try {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (cache.path && fs.existsSync(cache.path)) {
      cachedPath = cache.path;
    }
  } catch {}

  const home = os.homedir();
  const commonPaths = [
    path.join(home, '.local/share/pnpm/clawhub'),
    path.join(home, '.local/bin/clawhub'),
    path.join(home, '.nvm/current/bin/clawhub'),
  ];

  if (PLATFORM === 'darwin') {
    commonPaths.push('/opt/homebrew/bin/clawhub', '/usr/local/bin/clawhub');
  } else if (PLATFORM === 'win32') {
    commonPaths.push(
      path.join(path.dirname(process.execPath || ''), 'clawhub.cmd'),
      path.join(path.dirname(process.execPath || ''), 'clawhub.ps1'),
      path.join(path.dirname(process.execPath || ''), 'clawhub.exe'),
      path.join(process.env.ProgramFiles || '', 'nodejs', 'clawhub.cmd'),
      path.join(process.env.ProgramFiles || '', 'nodejs', 'clawhub.ps1'),
      path.join(process.env.ProgramFiles || '', 'nodejs', 'clawhub.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'clawhub.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'clawhub.ps1'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'clawhub.exe'),
      path.join(home, 'scoop/shims/clawhub.exe'),
      path.join(process.env.APPDATA || '', 'npm', 'clawhub.cmd'),
      path.join(process.env.APPDATA || '', 'npm', 'clawhub.ps1'),
      path.join(process.env.APPDATA || '', 'npm', 'clawhub'),
      path.join(process.env.APPDATA || '', 'npm-cache', '_npx', 'clawhub.cmd')
    );
  } else {
    commonPaths.push('/usr/local/bin/clawhub', '/usr/bin/clawhub');
  }

  const found = resolveExecutablePath('clawhub', { commonPaths: [cachedPath, ...commonPaths].filter(Boolean) });
  const command = found || cachedPath || 'clawhub';

  if (found && found !== cachedPath) {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify({ path: found, foundAt: Date.now() }));
    } catch {}
  }

  return { command, env, cacheFile, cachedPath: cachedPath || null, candidates: [...new Set(commonPaths.filter(Boolean))] };
}

function isClawHubCommandUsable(command) {
  if (!command) return false;
  return verifyCommandCandidates('clawhub', {
    env: getExtendedShellEnv(),
    cachedPath: command,
    versionArgs: ['--version'],
    helpArgs: ['help'],
    helpPattern: /clawhub|usage/i
  }).available;
}

function probeClawHubAvailability() {
  const binary = resolveClawHubBinary({ refresh: true });
  const probe = verifyCommandCandidates('clawhub', {
    env: binary.env,
    cachedPath: binary.cachedPath,
    directPaths: binary.candidates,
    versionArgs: ['--version'],
    helpArgs: ['help'],
    helpPattern: /clawhub|usage/i
  });

  if (probe.available && probe.command && probe.command !== binary.cachedPath && probe.command !== 'clawhub') {
    try {
      fs.mkdirSync(path.dirname(binary.cacheFile), { recursive: true });
      fs.writeFileSync(binary.cacheFile, JSON.stringify({ path: probe.command, foundAt: Date.now() }));
    } catch {}
  }

  const whereOutput = PLATFORM === 'win32'
    ? runShellCommand('where clawhub 2>nul || echo ""', { timeout: 5000, shell: 'cmd.exe' }).output
    : runShellCommand('which clawhub 2>/dev/null || command -v clawhub 2>/dev/null || echo ""', { timeout: 5000 }).output;

  return {
    available: probe.available,
    command: probe.command,
    diagnostics: getCommandProbeDiagnostics('clawhub', probe),
    whereOutput: String(whereOutput || '').trim(),
    cachePath: binary.cachedPath || null,
    candidates: binary.candidates,
    steps: probe.steps
  };
}

function getInstallCommandsByPlatform() {
  if (PLATFORM === 'win32') {
    return [{
      label: 'official_ps1_npmmirror',
      detail: '正在通过 PowerShell 安装 OpenClaw（npm 临时走 npmmirror）...',
      run: (notify) => new Promise((resolve, reject) => {
        const registry = 'https://registry.npmmirror.com';
        const commandText = buildWindowsInstallCommandText(registry);
        if (notify) {
          notify({ name: 'check_prereq', status: 'running', detail: '检查 Git / Node 环境...' });
          notify({ name: 'install_openclaw_stage', status: 'running', detail: '按官方 PowerShell 流程安装 OpenClaw（仅本次安装临时使用 npmmirror）...' });
          notify({ name: 'install_openclaw_stage', status: 'running', detail: `npm registry（临时）: ${registry}` });
        }

        const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandText], {
          env: { ...getExtendedShellEnv(), NPM_CONFIG_REGISTRY: registry, npm_config_registry: registry },
          windowsHide: true
        });
        let output = '';
        let lineBuffer = '';
        let settled = false;
        let lastOutputAt = Date.now();
        let currentPhase = 'check_prereq';
        let lastHint = '';
        let interactiveSetupDetected = false;

        const emitLine = (rawLine) => {
          const mappedLine = mapWindowsPowerShellProgressLine(rawLine);
          const line = String(mappedLine || '').trim();
          if (!line) return;
          lastOutputAt = Date.now();
          if (detectInteractiveSetupPrompt(line)) {
            interactiveSetupDetected = true;
            if (notify) {
              notify({ name: 'init_config', status: 'error', detail: '检测到 OpenClaw 进入交互式 setup / 安全确认界面；ClawBox 已中止自动 setup，后续改走非交互配置。' });
            }
            try { proc.kill(); } catch {}
            return;
          }
          const inferred = inferWindowsInstallStage(line);
          if (inferred) {
            currentPhase = inferred.phase;
            const phaseName = inferred.phase === 'verify'
              ? 'verify'
              : (inferred.phase === 'init_config' ? 'init_config' : (inferred.phase.startsWith('git') ? 'check_prereq' : 'install_openclaw_stage'));
            if (notify) notify({ name: phaseName, status: 'running', detail: inferred.detail });
          }
          if (notify) {
            notify({ name: 'install_openclaw_stream', status: 'running', detail: line.slice(0, 240) });
          }
        };

        const forwardChunk = (chunk) => {
          const chunkText = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
          output += chunkText;
          lineBuffer += chunkText;
          const parts = lineBuffer.split(/\r?\n/);
          lineBuffer = parts.pop() || '';
          for (const rawLine of parts) emitLine(rawLine);
        };

        const idleHandle = setInterval(() => {
          if (settled) return;
          if (Date.now() - lastOutputAt < 12000) return;
          const hint = mapWindowsPowerShellProgressLine(getWindowsIdleInstallHint(currentPhase));
          if (!hint || hint === lastHint) return;
          lastHint = hint;
          if (notify) notify({ name: 'install_openclaw_stage', status: 'running', detail: hint });
        }, 4000);

        const timeoutHandle = setTimeout(() => {
          if (settled) return;
          settled = true;
          clearInterval(idleHandle);
          try { proc.kill(); } catch {}
          reject(new Error(`安装脚本执行超时
${output.slice(-800)}`));
        }, 900000);

        proc.stdout?.on('data', forwardChunk);
        proc.stderr?.on('data', forwardChunk);
        proc.on('error', (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          clearInterval(idleHandle);
          reject(new Error(`启动 PowerShell 安装器失败: ${error.message}`));
        });
        proc.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          clearInterval(idleHandle);
          emitLine(lineBuffer);
          if (interactiveSetupDetected) {
            resolve(`${output.trim()}
CLAWBOX_NOTE:INTERACTIVE_SETUP_ABORTED`);
            return;
          }
          if (code === 0) resolve(output.trim());
          else reject(new Error(`安装脚本退出码: ${code}
${output.slice(-800)}`));
        });
      })
    }, createWindowsOfficialInstallCommand({
      label: 'official_ps1_npmmirror_git_mirror_fallback',
      detail: `首次尝试失败后，按官方 PowerShell 流程重试安装 OpenClaw（GitHub git 依赖临时改走 ${getWindowsGithubGitMirrorBaseUrl()}）...`,
      registry: 'https://registry.npmmirror.com',
      githubBaseUrl: getWindowsGithubGitMirrorBaseUrl()
    })];
  }

  if (PLATFORM === 'darwin') {
    return [{
      label: 'npm_global',
      detail: '正在通过 npm 安装 OpenClaw...',
      run: () => new Promise((resolve, reject) => {
        const proc = exec('npm install -g openclaw@latest', {
          timeout: 300000,
          shell: '/bin/bash',
          env: getExtendedShellEnv()
        });
        let output = '';
        proc.stdout?.on('data', (data) => { output += data; });
        proc.stderr?.on('data', (data) => { output += data; });
        proc.on('close', (code) => {
          if (code === 0) resolve(output.trim());
          else reject(new Error(`npm install 退出码: ${code}\n${output.slice(-800)}`));
        });
      })
    }];
  }

  return [{
    label: 'official_sh',
    detail: isRoot()
      ? '正在通过官方脚本安装 OpenClaw（root 模式）...'
      : '正在通过官方脚本安装 OpenClaw（可能需要 sudo 密码）...',
    run: () => new Promise((resolve, reject) => {
      const scriptPath = path.join(os.tmpdir(), 'openclaw-install.sh');
      const download = exec(
        `curl -fsSL --proto '=https' --tlsv1.2 -o "${scriptPath}" https://openclaw.ai/install.sh`,
        { timeout: 60000, shell: '/bin/bash', env: getExtendedShellEnv() }
      );

      download.on('close', (downloadCode) => {
        if (downloadCode !== 0) {
          reject(new Error(`下载安装脚本失败，退出码: ${downloadCode}`));
          return;
        }

        const runCmd = `${isRoot() ? '' : 'sudo '}bash "${scriptPath}" --no-onboard`;
        const proc = exec(runCmd, {
          timeout: 300000,
          shell: '/bin/bash',
          env: getExtendedShellEnv()
        });
        let output = '';
        proc.stdout?.on('data', (data) => { output += data; });
        proc.stderr?.on('data', (data) => { output += data; });
        proc.on('close', (code) => {
          try { fs.unlinkSync(scriptPath); } catch {}
          if (code === 0) resolve(output.trim());
          else reject(new Error(`安装脚本退出码: ${code}\n${output.slice(-800)}`));
        });
      });
    })
  }];
}

function getClawHubInstallCommands() {
  if (PLATFORM === 'win32') {
    const commands = [];
    const nodeInfo = getNodeInstallationInfo();
    const nodePath = nodeInfo.installed ? nodeInfo.path : process.execPath;
    const nodeDirCandidates = [
      nodePath ? path.dirname(nodePath) : '',
      process.execPath ? path.dirname(process.execPath) : ''
    ].filter(Boolean);

    for (const nodeDir of [...new Set(nodeDirCandidates)]) {
      const npmCliPath = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
      const npmCmdPath = path.join(nodeDir, 'npm.cmd');
      if (nodePath && fs.existsSync(npmCliPath)) {
        commands.push(`${quoteWindowsCmdArg(nodePath)} ${quoteWindowsCmdArg(npmCliPath)} --loglevel error --no-fund --no-audit install -g clawhub`);
      }
      if (fs.existsSync(npmCmdPath)) {
        commands.push(`${quoteWindowsCmdArg(npmCmdPath)} --loglevel error --no-fund --no-audit install -g clawhub`);
      }
    }

    commands.push(
      'npm --loglevel error --no-fund --no-audit install -g clawhub',
      'npm.cmd --loglevel error --no-fund --no-audit install -g clawhub'
    );

    return [...new Set(commands)];
  }

  if (PLATFORM === 'darwin') {
    return [
      'npm --loglevel error --no-fund --no-audit install -g clawhub',
      'pnpm add -g clawhub'
    ];
  }

  return [
    'npm --loglevel error --no-fund --no-audit install -g clawhub',
    'sudo npm --loglevel error --no-fund --no-audit install -g clawhub',
    'pnpm add -g clawhub'
  ];
}

function ensureClawHubInstalled(onProgress) {
  const initialProbe = probeClawHubAvailability();
  if (initialProbe.available) {
    return {
      success: true,
      installed: false,
      command: initialProbe.command,
      state: inspectOpenClawState()
    };
  }

  const attempts = [];
  for (const command of getClawHubInstallCommands()) {
    if (onProgress) onProgress(`尝试安装 ClawHub CLI: ${command}`);
    const result = runShellCommand(command, { timeout: 90000 });
    attempts.push({ command, ok: result.ok, output: result.output });

    if (result.ok) {
      const probe = probeClawHubAvailability();
      if (!probe.available) {
        const cleanOutput = String(result.output || '').trim();
        const whereOutput = PLATFORM === 'win32'
          ? runShellCommand('where clawhub 2>nul || echo ""', { timeout: 5000, shell: 'cmd.exe' }).output
          : runShellCommand('which clawhub 2>/dev/null || command -v clawhub 2>/dev/null || echo ""', { timeout: 5000 }).output;
        const appDataNpmPath = PLATFORM === 'win32'
          ? path.join(process.env.APPDATA || '', 'npm', 'clawhub.cmd')
          : '';
        const diagnostics = [
          `重新探测命令: ${probe.command || 'clawhub'}`,
          whereOutput ? `where/which 输出: ${whereOutput}` : '',
          appDataNpmPath ? `APPDATA npm 候选: ${appDataNpmPath} (${fs.existsSync(appDataNpmPath) ? 'exists' : 'missing'})` : '',
          probe.diagnostics ? `步骤探测:
${probe.diagnostics}` : '',
          `PATH: ${(getExtendedShellEnv().PATH || '').slice(0, 800)}`
        ].filter(Boolean).join('\n');
        return {
          success: false,
          state: inspectOpenClawState(),
          error: cleanOutput
            ? `安装命令已成功执行，但重新探测时仍未发现可用的 ClawHub CLI。\n成功命令: ${command}\n命令输出: ${cleanOutput}\n${diagnostics}`
            : `安装命令已成功执行，但重新探测时仍未发现可用的 ClawHub CLI。\n成功命令: ${command}\n${diagnostics}`
        };
      }

      const binary = resolveClawHubBinary();
      if (binary.command && binary.command !== 'clawhub' && PLATFORM !== 'win32') {
        try { fs.chmodSync(binary.command, 0o755); } catch {}
      }
      return { success: true, installed: true, command, state: inspectOpenClawState() };
    }
  }

  const failedAttempts = attempts.filter((attempt) => !attempt.ok);

  return {
    success: false,
    state: inspectOpenClawState(),
    error: failedAttempts.map((attempt) => `${attempt.command}: ${attempt.output || '失败'}`).join('\n') || 'ClawHub CLI 安装失败'
  };
}

function runOpenClawCommand(args, options = {}) {
  const openclawPath = resolveOpenClawPath();
  if (!openclawPath) {
    return { ok: false, status: null, stdout: '', stderr: '', output: '', error: new Error('未找到 openclaw 可执行文件') };
  }
  return runCliCommand(openclawPath, args, options);
}

function ensureOpenClawInitialized() {
  const currentConfig = readOpenClawConfigFile();
  const existingToken = readNestedValue(currentConfig.data, ['gateway', 'auth', 'token']);
  const nextConfig = mergeOpenClawConfig(currentConfig.data || {}, {
    gateway: {
      mode: 'local',
      auth: {
        mode: 'token',
        token: String(existingToken || '').trim() || crypto.randomBytes(24).toString('hex')
      }
    }
  });

  try {
    const configPath = writeOpenClawConfigFile(nextConfig);
    const state = inspectOpenClawState();
    if (!state.configReady) {
      return {
        success: false,
        state,
        requiresManualConfirmation: false,
        error: '已改为直接写入非交互配置，但配置文件仍未达到 Gateway 启动条件（期望 gateway.mode=local 且 gateway.auth.mode=token）'
      };
    }

    return {
      success: true,
      state: { ...state, configPath },
      mode: 'direct_file_write'
    };
  } catch (error) {
    return {
      success: false,
      state: inspectOpenClawState(),
      requiresManualConfirmation: false,
      error: `写入非交互配置失败: ${error.message}`
    };
  }
}

function isPermissionDeniedOutput(output) {
  const text = String(output || '').toLowerCase();
  if (!text) return false;
  return [
    'access is denied',
    '拒绝访问',
    'requires elevation',
    'elevation required',
    '拒绝',
    'access denied'
  ].some((token) => text.includes(token));
}

function ensureGatewayPrepared() {
  const attempts = [];
  const gatewayCommands = PLATFORM === 'win32'
    ? [
        { label: 'gateway install', args: ['gateway', 'install'] },
        { label: 'gateway install --force', args: ['gateway', 'install', '--force'] }
      ]
    : [
        { label: 'gateway install', args: ['gateway', 'install'] }
      ];

  for (const gatewayCommand of gatewayCommands) {
    const result = runOpenClawCommand(gatewayCommand.args, { timeout: 45000 });
    attempts.push({ ...gatewayCommand, ok: result.ok, output: result.output });
    const state = inspectOpenClawState();

    if (state.gatewayReady) {
      return { success: true, state, attempts };
    }

    if (isPermissionDeniedOutput(result.output)) {
      return {
        success: false,
        failureKind: 'permission',
        state,
        attempts,
        error: 'Gateway 注册需要管理员权限，但当前 Windows 会话未获授权；OpenClaw 本体已安装，初始化未完成，已阻止标记为安装成功。'
      };
    }
  }

  const state = inspectOpenClawState();
  const fallbackError = attempts.map((attempt) => `${attempt.label}: ${attempt.output || '失败'}`).join('\n') || state.gatewayStatus.error || 'Gateway 注册后仍未达到启动条件';
  return {
    success: false,
    failureKind: /timed out after 60s|health checks?/i.test(String(fallbackError || '')) ? 'timeout' : 'unknown',
    state,
    attempts,
    error: fallbackError
  };
}

function summarizeInstallVerifyFailure(verifyResult) {
  const issues = Array.isArray(verifyResult?.issues) ? verifyResult.issues : [];
  const state = verifyResult?.state || {};
  const headline = issues.length ? issues.join('；') : '安装验证失败';
  const evidence = [];

  if (state.version) evidence.push(`OpenClaw: ${state.version}`);
  if (state.openclawPath) evidence.push(`命令: ${state.openclawPath}`);
  if (state.configReady) evidence.push('配置已生成');
  if (state.gatewayRunning) evidence.push('Gateway 运行中');
  else if (state.gatewayReady) evidence.push('Gateway 可启动');

  return [headline, evidence.length ? `证据：${evidence.join(' / ')}` : ''].filter(Boolean).join('；');
}

function verifyInstallState() {
  const state = inspectOpenClawState();
  const issues = [];
  const openclawProbe = verifyCommandCandidates('openclaw', {
    cachedPath: state.openclawPath,
    directPaths: [resolveOpenClawPath()].filter(Boolean),
    versionArgs: ['--version'],
    helpArgs: ['--help'],
    helpPattern: /openclaw|usage/i
  });
  const clawhubProbe = probeClawHubAvailability();

  if (!openclawProbe.available || !state.installed) issues.push('OpenClaw 未安装或不可执行');
  if (!clawhubProbe.available || !state.clawhubAvailable) issues.push('ClawHub CLI 不可用');
  if (!state.configExists) issues.push('初始化配置文件未生成');
  if (!state.configReady) issues.push('初始化配置未达到 Gateway 启动条件');
  if (!state.gatewayReady) issues.push('Gateway 尚未具备启动条件');

  return {
    success: issues.length === 0,
    state: { ...state, clawhubPath: clawhubProbe.command === 'clawhub' ? state.clawhubPath : clawhubProbe.command },
    issues,
    summary: summarizeInstallVerifyFailure({ issues, state }),
    diagnostics: {
      openclaw: getCommandProbeDiagnostics('openclaw', openclawProbe),
      clawhub: clawhubProbe.diagnostics
    }
  };
}

function verifyUninstallState() {
  const state = inspectOpenClawState();
  const openclawResidue = [];
  const home = os.homedir();
  const extraResidueCandidates = [
    state.configPath,
    ...getOpenClawStateCleanupTargets(home),
    path.join(process.env.APPDATA || '', 'npm', 'openclaw.cmd'),
    path.join(process.env.APPDATA || '', 'npm', 'openclaw.ps1'),
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw'),
    path.join(process.env.LOCALAPPDATA || '', 'openclaw'),
    path.join(process.env.LOCALAPPDATA || '', 'openclaw-gateway'),
    path.join(home, '.openclaw', 'openclaw.exe'),
    path.join(home, '.openclaw', 'bin', 'openclaw.exe'),
    path.join(home, 'scoop', 'shims', 'openclaw.exe')
  ].filter(Boolean);

  if (state.openclawPath && fs.existsSync(state.openclawPath)) {
    openclawResidue.push(state.openclawPath);
  }

  for (const matchedPath of safeTrimLines(state?.detection?.whereOutput || '')) {
    if (fs.existsSync(matchedPath)) {
      openclawResidue.push(matchedPath);
    }
  }

  for (const artifact of state.serviceArtifacts || []) {
    openclawResidue.push(artifact);
  }

  for (const candidate of extraResidueCandidates) {
    if (fs.existsSync(candidate)) {
      openclawResidue.push(candidate);
    }
  }

  const residue = [...new Set(openclawResidue.filter(Boolean))];

  return {
    success: residue.length === 0,
    state,
    residue
  };
}

async function executeOpenClawInstall(onAttempt, onProgress) {
  const attempts = [];
  let interactiveSetupBlocked = false;

  for (const installCommand of getInstallCommandsByPlatform()) {
    const startedAt = Date.now();
    if (onAttempt) onAttempt(installCommand);
    try {
      const output = await installCommand.run(onProgress);
      const state = inspectOpenClawState();
      const outputText = String(output || '').trim();
      if (outputText.includes('CLAWBOX_NOTE:INTERACTIVE_SETUP_ABORTED')) interactiveSetupBlocked = true;
      const attempt = {
        label: installCommand.label,
        ok: state.installed,
        output: outputText.slice(-1200),
        durationMs: Date.now() - startedAt,
        interactiveSetupBlocked
      };
      attempts.push(attempt);
      if (state.installed) {
        return { success: true, attempt, attempts, state, interactiveSetupBlocked };
      }
    } catch (error) {
      attempts.push({
        label: installCommand.label,
        ok: false,
        output: (error.message || '').trim().slice(-1200),
        durationMs: Date.now() - startedAt
      });
    }
  }

  return {
    success: false,
    attempts,
    state: inspectOpenClawState(),
    error: attempts.map((attempt) => `${attempt.label}: ${attempt.output || '失败'}`).join('\n') || 'OpenClaw 安装失败'
  };
}

function stopGatewayProcesses() {
  const attempts = [];
  attempts.push(runOpenClawCommand(['gateway', 'stop'], { timeout: 20000 }));

  if (PLATFORM === 'win32') {
    attempts.push(runShellCommand('sc stop OpenClawGateway 2>nul', { timeout: 10000 }));
    attempts.push(runShellCommand('taskkill /F /IM openclaw-gateway.exe /T 2>nul', { timeout: 10000 }));
  } else if (PLATFORM === 'darwin') {
    const label = 'com.openclaw.gateway';
    attempts.push(runShellCommand(`launchctl bootout "gui/${process.getuid?.() || ''}/${label}" 2>/dev/null`, { timeout: 10000 }));
    attempts.push(runShellCommand('pkill -f "openclaw-gateway" 2>/dev/null', { timeout: 5000 }));
  } else {
    attempts.push(runShellCommand('systemctl --user stop openclaw-gateway.service 2>/dev/null', { timeout: 10000 }));
    attempts.push(runShellCommand('pkill -f "openclaw-gateway" 2>/dev/null', { timeout: 5000 }));
  }

  return attempts;
}

function getOpenClawRemovalCommands() {
  if (PLATFORM === 'win32') {
    return [
      'openclaw uninstall --all --yes --non-interactive',
      'npm rm -g openclaw'
    ];
  }

  if (PLATFORM === 'darwin') {
    return [
      'openclaw uninstall --all --yes --non-interactive',
      'npm rm -g openclaw'
    ];
  }

  return [
    'openclaw uninstall --all --yes --non-interactive',
    'npm rm -g openclaw',
    'sudo npm rm -g openclaw'
  ];
}

function removeOpenClawArtifacts() {
  const home = os.homedir();
  const targets = new Set();

  const resolvedPath = resolveOpenClawPath();
  if (resolvedPath) {
    targets.add(resolvedPath);
    const parentDir = path.dirname(resolvedPath);
    targets.add(path.join(parentDir, PLATFORM === 'win32' ? 'openclaw-gateway.exe' : 'openclaw-gateway'));
  }

  const commonTargets = [
    path.join(home, '.local', 'share', 'pnpm', 'openclaw'),
    path.join(home, '.local', 'share', 'pnpm', 'openclaw-gateway'),
    path.join(home, '.local', 'bin', 'openclaw'),
    path.join(home, '.local', 'bin', 'openclaw-gateway'),
    path.join(home, '.nvm', 'current', 'bin', 'openclaw'),
    path.join(home, '.nvm', 'current', 'bin', 'openclaw-gateway')
  ];

  if (PLATFORM === 'win32') {
    commonTargets.push(
      path.join(home, '.openclaw', 'openclaw.exe'),
      path.join(home, '.openclaw', 'bin', 'openclaw.exe'),
      path.join(process.env.APPDATA || '', 'npm', 'openclaw.cmd'),
      path.join(process.env.APPDATA || '', 'npm', 'openclaw.ps1'),
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw'),
      path.join(process.env.LOCALAPPDATA || '', 'openclaw'),
      path.join(process.env.LOCALAPPDATA || '', 'openclaw-gateway'),
      path.join(home, 'scoop', 'shims', 'openclaw.exe')
    );
  } else if (PLATFORM === 'darwin') {
    commonTargets.push(
      '/usr/local/bin/openclaw',
      '/opt/homebrew/bin/openclaw',
      '/usr/local/lib/node_modules/openclaw',
      '/opt/homebrew/lib/node_modules/openclaw'
    );
  } else {
    commonTargets.push(
      '/usr/local/bin/openclaw',
      '/usr/bin/openclaw',
      '/usr/local/lib/node_modules/openclaw',
      '/usr/lib/node_modules/openclaw'
    );
  }

  for (const target of commonTargets.filter(Boolean)) {
    targets.add(target);
  }

  for (const target of getOpenClawStateCleanupTargets(home)) {
    targets.add(target);
  }

  const removed = [];
  for (const target of targets) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(target);
    } catch {}
  }

  return removed;
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
      report('detect_os', 'done', 'Windows ✓');
    } else {
      report('detect_os', 'done', `${osType} ✓`);
    }

    // Step 2: 检查安装前置（仅在对应平台需要时执行）
    if (PLATFORM === 'linux') {
      report('check_prereq', 'running', '检查安装前置命令...');
      const curlResult = runShellCommand('curl --version', { timeout: 5000 });
      if (!curlResult.ok) {
        report('check_prereq', 'error', '未找到 curl，请先安装');
        return { success: false, steps };
      }
      report('check_prereq', 'done', '安装前置检查通过 ✓');
    }

    // Step 3: 安装 OpenClaw，并在动作后立即复检
    report('install_openclaw', 'running', '执行 OpenClaw 安装流程...');
    const installResult = await executeOpenClawInstall((installCommand) => {
      report('install_openclaw', 'running', installCommand.detail);
    }, (progress) => {
      report(progress.name || 'install_openclaw', progress.status || 'running', progress.detail || '安装流程正在执行...');
    });

    if (!installResult.success) {
      report('install_openclaw', 'error', [installResult.error || 'OpenClaw 安装失败', buildInstallFailureHint(installResult.error)].filter(Boolean).join('\n')); 
      return { success: false, steps };
    }
    report('install_openclaw', 'done', `OpenClaw 已安装 ✓ (${installResult.state.version || installResult.state.openclawPath || installResult.attempt.label})`);
    report('install_openclaw_stage', 'done', `安装验证: ${installResult.state.openclawPath || '已探测到 openclaw'} / ${installResult.state.version || '版本待确认'}`);

    // Step 4: 安装 ClawHub CLI，并以检测结果为准
    report('install_clawhub', 'running', '安装 ClawHub CLI...');
    const clawhubResult = ensureClawHubInstalled((detail) => {
      report('install_clawhub', 'running', detail);
    });
    if (!clawhubResult.success) {
      report('install_clawhub', 'error', clawhubResult.error || 'ClawHub CLI 安装失败');
      return { success: false, steps };
    }
    report('install_clawhub', 'done', clawhubResult.installed ? 'ClawHub CLI 已安装 ✓' : 'ClawHub CLI 已可用 ✓');
    if (clawhubResult.state?.clawhubPath) report('install_clawhub', 'done', `ClawHub 探测路径: ${clawhubResult.state.clawhubPath}`);

    // Step 5: 初始化配置，并验证配置已写入
    report('init_config', 'running', '初始化 Gateway 配置（非交互）...');
    if (installResult.interactiveSetupBlocked) {
      report('init_config', 'running', '已检测到官方安装脚本试图进入交互式 setup；ClawBox 改为直接写入 openclaw.json，避免卡在 Yes / No 安全确认界面。');
    }
    const initResult = ensureOpenClawInitialized();
    if (!initResult.success) {
      report('init_config', 'error', initResult.error || '初始化配置失败');
      const partialState = inspectOpenClawState();
      if (partialState.installed) {
        report('verify', 'error', 'OpenClaw 本体已安装，但自动初始化配置未完成');
      }
      return { success: false, partial: !!partialState.installed, steps, state: partialState };
    }
    report('init_config', 'done', `初始化配置完成 ✓ (${initResult.state.configPath || '~/.openclaw/openclaw.json'})`);

    // Step 6: 注册 Gateway，并验证启动条件已满足
    report('install_gateway', 'running', '注册 Gateway 服务...');
    const gatewayResult = ensureGatewayPrepared();
    if (!gatewayResult.success) {
      const stateAfterGateway = gatewayResult.state || inspectOpenClawState();
      report('install_gateway', 'error', gatewayResult.error || 'Gateway 注册失败');
      if (gatewayResult.failureKind === 'permission') {
        report('install_gateway', 'error', 'Windows 计划任务创建被拒绝访问，可能需要管理员权限；已降级为“OpenClaw 已安装，但 Gateway 服务未完成”。');
      } else if (gatewayResult.failureKind === 'timeout') {
        report('install_gateway', 'error', 'Gateway restart 超时，已降级为“后台服务配置未完成”，不会覆盖 OpenClaw 已安装状态。');
      }
      report('verify', 'error', 'OpenClaw 本体已安装，但自动初始化 / Gateway 服务配置未完全完成');
      return { success: false, partial: !!stateAfterGateway.installed, steps, state: stateAfterGateway, gateway: gatewayResult };
    }
    report('install_gateway', 'done', gatewayResult.state.gatewayRunning ? 'Gateway 已具备运行状态 ✓' : 'Gateway 已具备启动条件 ✓');
    const dashboardReady = gatewayResult.state.gatewayReady && !!(gatewayResult.state.gatewayStatus?.data?.dashboardUrl || gatewayResult.state.gatewayStatus?.data?.url);
    report('install_gateway', 'done', dashboardReady ? 'Dashboard 已可打开 ✓' : 'Dashboard URL 待 Gateway 返回');

    // Step 7: 统一验证最终状态
    report('verify', 'running', '验证安装闭环...');
    const verifyResult = verifyInstallState();
    if (!verifyResult.success) {
      report('verify', 'error', verifyResult.summary || verifyResult.issues.join('；') || '安装验证失败'); 
      return { success: false, partial: !!verifyResult.state.installed, steps, state: verifyResult.state };
    }

    const versionText = verifyResult.state.version || '已安装';
    const gatewayText = verifyResult.state.gatewayRunning ? 'Gateway 运行中' : 'Gateway 可启动';
    report('verify', 'done', `OpenClaw ${versionText}，ClawHub 可用，${gatewayText} ✓`);
    if (verifyResult.diagnostics?.openclaw) report('verify', 'done', `OpenClaw 验证: ${verifyResult.diagnostics.openclaw}`);
    if (verifyResult.diagnostics?.clawhub) report('verify', 'done', `ClawHub 验证: ${verifyResult.diagnostics.clawhub}`);
    report('all_done', 'done', 'OpenClaw 安装流程完成');
    return { success: true, partial: false, steps, state: verifyResult.state };

  } catch (err) {
    report('error', 'error', [err.message, buildInstallFailureHint(err.message)].filter(Boolean).join('\n'));
    return { success: false, steps };
  }
}

/**
 * 更新 OpenClaw
 */
function verifyOpenClawUpdatePreconditions(state = inspectOpenClawState()) {
  if (state?.installed && state?.openclawPath) {
    return { ok: true, state };
  }

  return {
    ok: false,
    state,
    error: '未检测到已安装的 OpenClaw，请先完成安装后再检查更新。'
  };
}

function findLatestNpmDebugLogPath() {
  const logDirs = [
    path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_logs'),
    path.join(os.homedir(), '.npm', '_logs')
  ].filter(Boolean);

  let latest = null;
  for (const dir of logDirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.log$/i.test(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(fullPath).mtimeMs || 0;
      } catch {
        continue;
      }
      if (!latest || mtimeMs > latest.mtimeMs) {
        latest = { path: fullPath, mtimeMs };
      }
    }
  }

  return latest?.path || '';
}

function formatOpenClawUpdateFailureMessage(message, output = '') {
  const trimmedOutput = String(output || '').trim();
  const outputTail = trimmedOutput ? trimmedOutput.slice(-1600) : '';
  const npmLogPath = findLatestNpmDebugLogPath();
  return [
    String(message || '更新失败').trim(),
    outputTail ? `最近输出：\n${outputTail}` : '',
    npmLogPath ? `npm 日志：${npmLogPath}` : ''
  ].filter(Boolean).join('\n');
}

function extractOpenClawReleaseVersion(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/\b(\d{4}\.\d+\.\d+)\b/);
  return match ? match[1] : text;
}

function getLatestOpenClawPackageVersion(registry = 'https://registry.npmmirror.com') {
  const normalizedRegistry = String(registry || 'https://registry.npmmirror.com').trim() || 'https://registry.npmmirror.com';
  const command = `npm view openclaw version --registry=${normalizedRegistry}`;
  const result = runShellCommand(command, { timeout: 30000, shell: PLATFORM === 'win32' ? 'cmd.exe' : undefined });
  if (!result.ok) {
    return {
      success: false,
      version: '',
      error: formatOpenClawUpdateFailureMessage(`获取最新版本失败，退出码: ${result.status}`, result.output)
    };
  }

  return {
    success: true,
    version: extractOpenClawReleaseVersion(result.output),
    error: ''
  };
}

function getWindowsOpenClawUpdateCommands() {
  return [
    {
      label: 'npm_install_latest_npmmirror',
      detail: '正在通过 npm 更新 OpenClaw（临时使用 npmmirror，并自动处理 Git 依赖）...',
      registry: 'https://registry.npmmirror.com',
      githubBaseUrl: DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL
    },
    {
      label: 'npm_install_latest_git_mirror_fallback',
      detail: `首次尝试失败后，按 npm 最新版流程重试更新 OpenClaw（GitHub git 依赖临时改走 ${getWindowsGithubGitMirrorBaseUrl()}）...`,
      registry: 'https://registry.npmmirror.com',
      githubBaseUrl: getWindowsGithubGitMirrorBaseUrl()
    }
  ];
}

function runWindowsOpenClawUpdateCommand(command, notify) {
  const registry = String(command?.registry || 'https://registry.npmmirror.com').trim() || 'https://registry.npmmirror.com';
  const githubBaseUrl = normalizeGithubGitBaseUrl(command?.githubBaseUrl, DEFAULT_WINDOWS_GITHUB_GIT_BASE_URL);
  const commandText = buildWindowsOpenClawUpdateCommandText({ registry, githubBaseUrl });

  if (notify) {
    notify({ name: 'check_prereq', status: 'running', detail: '检查 Git / Node 环境...' });
    notify({ name: 'update', status: 'running', detail: command.detail || '正在更新 OpenClaw...' });
    notify({ name: 'update', status: 'running', detail: `npm registry（临时）: ${registry}` });
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandText], {
      env: { ...getExtendedShellEnv(), NPM_CONFIG_REGISTRY: registry, npm_config_registry: registry },
      windowsHide: true
    });
    let output = '';
    let lineBuffer = '';
    let settled = false;
    let lastOutputAt = Date.now();

    const emitLine = (rawLine) => {
      const originalLine = String(rawLine || '').trim();
      const mappedLine = mapWindowsPowerShellProgressLine(rawLine);
      const line = String(mappedLine || '').trim();
      if (!originalLine && !line) return;
      lastOutputAt = Date.now();

      if (!notify) return;
      if (originalLine === 'CLAWBOX_STAGE:CHECK_PREREQ') {
        notify({ name: 'check_prereq', status: 'running', detail: '检查 Git / Node 环境...' });
        return;
      }
      if (originalLine === 'CLAWBOX_STAGE:GIT_BOOTSTRAP') {
        notify({ name: 'check_prereq', status: 'running', detail: '正在准备 portable Git / Git 依赖...' });
        return;
      }
      if (originalLine === 'CLAWBOX_STAGE:NPM_UPDATE') {
        notify({ name: 'update', status: 'running', detail: '正在通过 npm 更新 OpenClaw（可能持续数分钟）...' });
        return;
      }

      const detail = line || originalLine;
      if (detail) {
        notify({ name: 'update_stream', status: 'running', detail: detail.slice(0, 240) });
      }
    };

    const forwardChunk = (chunk) => {
      const chunkText = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
      output += chunkText;
      lineBuffer += chunkText;
      const parts = lineBuffer.split(/\r?\n/);
      lineBuffer = parts.pop() || '';
      for (const rawLine of parts) emitLine(rawLine);
    };

    const idleHandle = setInterval(() => {
      if (settled) return;
      if ((Date.now() - lastOutputAt) < 12000) return;
      if (notify) {
        notify({ name: 'update', status: 'running', detail: '提示：更新仍在继续，npm 安装最新版本时可能会停留一会儿。' });
      }
      lastOutputAt = Date.now();
    }, 4000);

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(idleHandle);
      try { proc.kill(); } catch {}
      reject(new Error(formatOpenClawUpdateFailureMessage('更新超时（15 分钟内未完成）', output)));
    }, 900000);

    proc.stdout?.on('data', forwardChunk);
    proc.stderr?.on('data', forwardChunk);
    proc.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      clearInterval(idleHandle);
      reject(new Error(formatOpenClawUpdateFailureMessage(`启动 PowerShell 更新器失败: ${error.message}`, output)));
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      clearInterval(idleHandle);
      emitLine(lineBuffer);
      if (code === 0) {
        resolve(String(output || '').trim());
        return;
      }
      reject(new Error(formatOpenClawUpdateFailureMessage(`更新失败，退出码: ${code}`, output)));
    });
  });
}

async function updateOpenClaw(onProgress) {
  const steps = [];
  const report = (name, status, detail) => {
    steps.push({ name, status, detail });
    if (onProgress) onProgress({ name, status, detail, steps: [...steps] });
  };

  const precheck = verifyOpenClawUpdatePreconditions();
  if (!precheck.ok) {
    report('update', 'error', precheck.error);
    return { success: false, steps, state: precheck.state };
  }

  report('check_prereq', 'done', `已检测到 OpenClaw：${precheck.state.version || precheck.state.openclawPath || '已安装'}`);

  const currentVersion = extractOpenClawReleaseVersion(precheck.state.version);
  const latestVersionResult = getLatestOpenClawPackageVersion();
  if (latestVersionResult.success && latestVersionResult.version) {
    report('check_prereq', 'done', `远端 latest 版本：${latestVersionResult.version}`);
    if (currentVersion && currentVersion === latestVersionResult.version) {
      report('update', 'done', `当前已是最新版本 ✓ (${latestVersionResult.version})`);
      return {
        success: true,
        steps,
        state: precheck.state,
        latestVersion: latestVersionResult.version,
        skipped: 'already_latest'
      };
    }
  } else if (latestVersionResult.error) {
    report('check_prereq', 'running', latestVersionResult.error);
  }

  const finalizeSuccess = (state, extra = {}) => ({
    success: true,
    steps,
    state,
    latestVersion: latestVersionResult.success ? latestVersionResult.version : '',
    ...extra
  });

  const finalizeFailure = (extra = {}) => ({
    success: false,
    steps,
    state: inspectOpenClawState(),
    ...extra
  });

  const verifyInstalledState = (output, fallbackLabel) => {
    const state = inspectOpenClawState();
    if (!state.installed) {
      throw new Error(formatOpenClawUpdateFailureMessage('更新命令已执行，但重新探测时仍未发现已安装的 OpenClaw。', output));
    }
    report('update', 'done', `更新完成 ✓ (${state.version || state.openclawPath || fallbackLabel || 'OpenClaw'})`);
    return state;
  };

  if (PLATFORM === 'win32') {
    const attempts = [];
    for (const command of getWindowsOpenClawUpdateCommands()) {
      const startedAt = Date.now();
      try {
        const output = await runWindowsOpenClawUpdateCommand(command, (progress) => {
          report(progress.name || 'update', progress.status || 'running', progress.detail || '更新流程正在执行...');
        });
        const state = verifyInstalledState(output, command.label);
        const attempt = {
          label: command.label,
          ok: true,
          output: String(output || '').trim().slice(-1200),
          durationMs: Date.now() - startedAt
        };
        attempts.push(attempt);
        return finalizeSuccess(state, { attempts, attempt });
      } catch (err) {
        const failureText = String(err?.message || '').trim() || '更新失败';
        attempts.push({
          label: command.label,
          ok: false,
          output: failureText.slice(-1200),
          durationMs: Date.now() - startedAt
        });
        report('update', 'error', failureText);
      }
    }
    return finalizeFailure({ attempts });
  }

  try {
    report('update', 'running', '正在通过 npm 安装最新版本的 OpenClaw...');
    const result = runShellCommand('npm install -g openclaw@latest', { timeout: 300000 });
    if (!result.ok) {
      throw new Error(formatOpenClawUpdateFailureMessage(`更新失败，退出码: ${result.status}`, result.output));
    }
    const state = verifyInstalledState(result.output, 'OpenClaw');
    return finalizeSuccess(state);
  } catch (err) {
    report('update', 'error', err.message);
    return finalizeFailure();
  }
}

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
    // Step 1: 停止 Gateway 相关进程与服务
    report('stop_gateway', 'running', '停止 Gateway 与残留进程...');
    stopGatewayProcesses();
    report('stop_gateway', 'done', 'Gateway 停止动作已执行 ✓');

    // Step 2: 先走统一卸载命令，并在每轮后复检
    report('uninstall', 'running', '执行 OpenClaw 卸载命令...');
    const uninstallAttempts = [];
    for (const command of getOpenClawRemovalCommands()) {
      const result = runShellCommand(command, { timeout: 120000 });
      uninstallAttempts.push({ command, ok: result.ok, output: result.output });
      const verify = verifyUninstallState();
      if (verify.success) {
        report('uninstall', 'done', `卸载命令已生效 ✓ (${command})`);
        break;
      }
    }

    // Step 3: 若仍有残留，继续执行文件级 fallback
    const postUninstallVerify = verifyUninstallState();
    if (!postUninstallVerify.success) {
      report('fallback_remove', 'running', '检测到 OpenClaw 仍存在，执行文件级清理...');
      const removed = removeOpenClawArtifacts();
      report('fallback_remove', 'done', removed.length ? `已清理 ${removed.length} 个残留路径 ✓` : '未找到可直接删除的残留路径');
    } else {
      report('fallback_remove', 'done', '未检测到 OpenClaw 可执行残留 ✓');
    }

    // Step 4: 清理配置、工作区与服务定义
    report('clean_runtime', 'running', '清理配置、工作区与服务定义...');
    const homeDir = os.homedir();
    for (const target of getOpenClawStateCleanupTargets(homeDir)) {
      try { fs.rmSync(target, { recursive: true, force: true }); } catch {}
    }

    if (PLATFORM === 'darwin') {
      const label = 'com.openclaw.gateway';
      const uid = process.getuid?.();
      runShellCommand(`launchctl bootout "gui/${uid || ''}/${label}" 2>/dev/null`, { timeout: 15000 });
      runShellCommand(`rm -f "${path.join(homeDir, 'Library', 'LaunchAgents', `${label}.plist`)}"`, { timeout: 10000 });
    } else if (PLATFORM === 'win32') {
      runShellCommand('sc stop OpenClawGateway 2>nul', { timeout: 15000 });
      runShellCommand('sc delete OpenClawGateway 2>nul', { timeout: 15000 });
    } else {
      runShellCommand('systemctl --user disable --now openclaw-gateway.service 2>/dev/null', { timeout: 15000 });
      runShellCommand(`rm -f "${path.join(homeDir, '.config', 'systemd', 'user', 'openclaw-gateway.service')}"`, { timeout: 10000 });
      runShellCommand('systemctl --user daemon-reload 2>/dev/null', { timeout: 15000 });
    }
    report('clean_runtime', 'done', '运行时目录与服务定义已清理 ✓');

    // Step 5: 最终复检，失败则明确提示具体残留
    report('final_check', 'running', '执行最终复检...');
    const finalVerify = verifyUninstallState();
    if (!finalVerify.success) {
      const residue = finalVerify.residue.length
        ? `残留路径: ${finalVerify.residue.join('，')}`
        : `当前检测路径: ${finalVerify.state.openclawPath || '未知'}`;
      report('final_check', 'error', `卸载后仍检测到 OpenClaw 残留；${residue}`);
      return { success: false, steps, state: finalVerify.state, attempts: uninstallAttempts };
    }

    report('final_check', 'done', '确认 OpenClaw 已完全移除 ✓');
    report('all_done', 'done', 'OpenClaw 卸载流程完成');
    return { success: true, steps, attempts: uninstallAttempts };
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
  const probe = probeClawHubAvailability();
  const env = getExtendedShellEnv();
  const command = probe.command || 'clawhub';

  if (!probe.available) {
    return {
      success: false,
      error: '未找到可用的 ClawHub CLI，请先在工具模块确认安装状态',
      detail: probe.diagnostics,
      diagnostics: probe.diagnostics,
      whereOutput: probe.whereOutput || ''
    };
  }

  const result = runCliCommand(command, ['search', '--no-input', query], {
    timeout: 30000,
    env
  });
  const output = result.output;

  if (result.ok) {
    return { success: true, output, diagnostics: probe.diagnostics, command };
  }

  if (output.includes('Rate limit')) {
    return { success: false, error: 'Rate limit exceeded', detail: output, diagnostics: probe.diagnostics, command };
  }

  if (/not found|ENOENT/i.test(output) || result.status === 127) {
    return { success: false, error: '未找到 clawhub 命令，请先安装 ClawHub CLI', detail: `${output}\n${probe.diagnostics}`.trim(), diagnostics: probe.diagnostics, command };
  }

  return { success: false, error: output || result.error?.message || '搜索失败', detail: output, diagnostics: probe.diagnostics, command };
}

/**
 * 安装 ClawHub Skill
 */
function installClawHubSkill(slug) {
  const probe = probeClawHubAvailability();
  const env = getExtendedShellEnv();
  const command = probe.command || 'clawhub';

  if (!probe.available) {
    return {
      success: false,
      error: '未找到可用的 ClawHub CLI，请先在工具模块确认安装状态',
      detail: probe.diagnostics,
      diagnostics: probe.diagnostics,
      whereOutput: probe.whereOutput || ''
    };
  }

  const result = runCliCommand(command, ['install', '--no-input', slug], {
    timeout: 90000,
    env
  });

  const output = result.output;

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT' || result.error.signal === 'SIGTERM') {
      return { success: false, error: '安装超时，请稍后重试', detail: output, diagnostics: probe.diagnostics, command };
    }
    return { success: false, error: result.error.message, detail: output, diagnostics: probe.diagnostics, command };
  }

  if (result.ok) {
    return { success: true, output, diagnostics: probe.diagnostics, command };
  }

  if (output.includes('Rate limit')) {
    return { success: false, error: '安装过于频繁，请稍后再试', detail: output, diagnostics: probe.diagnostics, command };
  }

  if (/not found|ENOENT/i.test(output) || result.status === 127) {
    return { success: false, error: '未找到 clawhub 命令，请先安装 ClawHub CLI', detail: `${output}\n${probe.diagnostics}`.trim(), diagnostics: probe.diagnostics, command };
  }

  return {
    success: false,
    error: output || `安装失败，退出码: ${result.status}`,
    detail: output,
    diagnostics: probe.diagnostics,
    command
  };
}

/**
 * 检查 ClawHub CLI 是否可用
 */
function isClawHubAvailable() {
  const { command } = resolveClawHubBinary();
  return isClawHubCommandUsable(command);
}

/**
 * 安装 ClawHub CLI
 */
function installClawHubCLI() {
  const result = ensureClawHubInstalled();
  const probe = probeClawHubAvailability();
  if (result.success) {
    return {
      success: !!probe.available,
      installed: !!result.installed,
      state: result.state || inspectOpenClawState(),
      available: !!probe.available,
      command: probe.command,
      diagnostics: probe.diagnostics,
      error: probe.available ? '' : 'ClawHub 安装命令执行后仍未通过最终探测'
    };
  }
  return {
    success: false,
    error: result.error || '所有安装方式都失败了',
    state: result.state || inspectOpenClawState(),
    available: !!probe.available,
    command: probe.command,
    diagnostics: probe.diagnostics
  };
}

module.exports = {
  checkNodeVersion,
  getNodeInstallationInfo,
  getRuntimeNodeInfo,
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
  installClawHubCLI,
  resolveExecutablePath,
  resolveOpenClawPath,
  resolveClawHubBinary,
  probeClawHubAvailability,
  getExtendedShellEnv,
  buildWindowsRepairEnvironmentReport,
  buildInstallFailureHint,
  inspectOpenClawState,
  __test: {
    isGatewayStatusRunning,
    isCommandProbeExecutionFailure,
    isLikelyCommandHelpText,
    getOpenClawStateCleanupTargets,
    getWindowsGithubGitMirrorBaseUrl,
    getWindowsPortableGitBootstrapConfig,
    getTemporaryGithubHttpsRewritePowerShellLines,
    buildWindowsInstallCommandText,
    buildWindowsOpenClawUpdateCommandText,
    buildWindowsPortableGitBootstrapPowerShellLines,
    verifyOpenClawUpdatePreconditions,
    formatOpenClawUpdateFailureMessage,
    extractOpenClawReleaseVersion
  }
};
