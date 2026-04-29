const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { exec, execSync, spawnSync, spawn } = require('child_process');
const { installOpenClaw, updateOpenClaw, uninstallOpenClaw, isOpenClawInstalled, getOpenClawVersion, isGatewayRunning, getOS, checkNodeVersion, getNodeInstallationInfo, getRuntimeNodeInfo, isRoot, searchClawHubSkills, installClawHubSkill, isClawHubAvailable, installClawHubCLI, resolveOpenClawPath, resolveClawHubBinary, probeClawHubAvailability, getExtendedShellEnv, buildWindowsRepairEnvironmentReport, inspectOpenClawState, __test: installerTest } = require('./installer');
const { getModelConfig, updateModelConfig, switchModel, switchModelById, deleteModel, getFeishuConfig, updateFeishuConfig, getConfigSummary, getInstalledModels, getChannelCatalog, getChannelConfig, getPersistedChannelConfig, getChannelsState, normalizeManualChannelPayload, upsertChannelConfig, removeChannelConfig, getDefaultBaseUrl } = require('./config');

const STATUS_STICKY_TTL_MS = 10000;
const STATUS_CACHE_TTL_MS = 5000;
const OPENCLAW_STATE_CACHE_TTL_MS = 3000;
const STATUS_LITE_INSPECT_TTL_MS = 3000;
const DASHBOARD_OBSERVED_STATUS_TTL_MS = 15000;
const GATEWAY_RECOVERY_TIMEOUT_MS = 45000;
const GATEWAY_RECOVERY_INTERVAL_MS = 2000;
const GATEWAY_STARTUP_GRACE_MS = 45000;
const ROOT_STATUS_CACHE_TTL_MS = 30000;
const CLAWHUB_PROBE_CACHE_TTL_MS = 5000;
const TOOLS_STATUS_CACHE_TTL_MS = 15000;
let lastHealthyOpenClawLifecycle = null;
let lastObservedDashboardOpenClawLifecycle = null;
let cachedStatusPayload = null;
let cachedStatusAt = 0;
let cachedLiteLifecycle = null;
let cachedLiteLifecycleAt = 0;
let cachedOpenClawState = null;
let cachedOpenClawStateAt = 0;
let quickOpenClawLifecycleSnapshotOverride = null;
let cachedRootStatus = null;
let cachedRootStatusAt = 0;
let cachedClawHubProbe = null;
let cachedClawHubProbeAt = 0;
let cachedToolsStatusPayload = null;
let cachedToolsStatusAt = 0;
let lastGatewayRecoveryObservedAt = 0;
let openClawStateWarmupPromise = null;

function invalidateStatusCaches(options = {}) {
  cachedStatusPayload = null;
  cachedStatusAt = 0;
  cachedLiteLifecycle = null;
  cachedLiteLifecycleAt = 0;
  lastObservedDashboardOpenClawLifecycle = null;
  cachedOpenClawState = null;
  cachedOpenClawStateAt = 0;
  cachedClawHubProbe = null;
  cachedClawHubProbeAt = 0;
  cachedToolsStatusPayload = null;
  cachedToolsStatusAt = 0;
  openClawStateWarmupPromise = null;
  if (options.clearGatewayRecovery) {
    lastGatewayRecoveryObservedAt = 0;
  }
  if (options.clearSticky) {
    lastHealthyOpenClawLifecycle = null;
  }
}

function noteGatewayRecoveryObservation(ageMs = 0) {
  lastGatewayRecoveryObservedAt = Date.now() - Math.max(0, Number(ageMs) || 0);
}

function clearGatewayRecoveryObservation() {
  lastGatewayRecoveryObservedAt = 0;
}

function hasFreshOpenClawStateCache(now = Date.now()) {
  return !!cachedOpenClawState && (now - cachedOpenClawStateAt) < OPENCLAW_STATE_CACHE_TTL_MS;
}

function getCachedOpenClawState(options = {}) {
  const now = Date.now();
  if (!options.force && hasFreshOpenClawStateCache(now)) {
    return cachedOpenClawState;
  }

  cachedOpenClawState = inspectOpenClawState();
  cachedOpenClawStateAt = now;
  return cachedOpenClawState;
}

function cacheOpenClawStateSnapshot(state, ageMs = 0) {
  if (!state || typeof state !== 'object') return;
  cachedOpenClawState = state;
  cachedOpenClawStateAt = Date.now() - Math.max(0, Number(ageMs) || 0);
  cachedLiteLifecycle = null;
  cachedLiteLifecycleAt = 0;
}

function scheduleOpenClawStateWarmup(options = {}) {
  const force = !!options.force;
  if (!force && hasFreshOpenClawStateCache()) {
    return Promise.resolve(cachedOpenClawState);
  }
  if (!force && openClawStateWarmupPromise) {
    return openClawStateWarmupPromise;
  }

  const warmupPromise = Promise.resolve().then(() => {
    const state = getCachedOpenClawState({ force: true });
    if (state) rememberObservedOpenClawState(state);
    return state;
  }).catch(() => null);

  openClawStateWarmupPromise = warmupPromise.finally(() => {
    if (openClawStateWarmupPromise === warmupPromise) {
      openClawStateWarmupPromise = null;
    }
  });

  return openClawStateWarmupPromise;
}

function getCachedRootStatus() {
  const now = Date.now();
  if (cachedRootStatus !== null && (now - cachedRootStatusAt) < ROOT_STATUS_CACHE_TTL_MS) {
    return cachedRootStatus;
  }

  cachedRootStatus = isRoot();
  cachedRootStatusAt = now;
  return cachedRootStatus;
}

function getCachedClawHubProbe(options = {}) {
  const now = Date.now();
  if (!options.force && cachedClawHubProbe && (now - cachedClawHubProbeAt) < CLAWHUB_PROBE_CACHE_TTL_MS) {
    return cachedClawHubProbe;
  }

  cachedClawHubProbe = probeClawHubAvailability();
  cachedClawHubProbeAt = now;
  return cachedClawHubProbe;
}

function detectGatewayHealthFlags(state) {
  const payload = state?.gatewayStatus?.data;
  const statusOutput = [state?.gatewayStatus?.stdout, state?.gatewayStatus?.stderr, state?.gatewayStatus?.error].filter(Boolean).join('\n');
  const dashboardUrl = payload ? parseOpenclawDashboardUrlFromJson(payload) : '';
  const port = (payload ? findGatewayPortInJson(payload) : null) || parseGatewayPortFromText(statusOutput);
  const rpcOk = !!readNestedValue(payload, ['rpc', 'ok'])
    || !!readNestedValue(payload, ['gateway', 'rpcOk'])
    || !!readNestedValue(payload, ['gateway', 'rpc', 'ok'])
    || !!readNestedValue(payload, ['health', 'rpcOk'])
    || !!readNestedValue(payload, ['probe', 'ok'])
    || /rpc probe:\s*ok/i.test(statusOutput);
  const rpcFailed = !!readNestedValue(payload, ['rpc', 'ok']) === false
    || !!readNestedValue(payload, ['gateway', 'rpcOk']) === false
    || !!readNestedValue(payload, ['gateway', 'rpc', 'ok']) === false
    || !!readNestedValue(payload, ['health', 'rpcOk']) === false
    || !!readNestedValue(payload, ['probe', 'ok']) === false
    || /rpc probe:\s*failed/i.test(statusOutput)
    || /\btimeout\b/i.test(statusOutput);
  const listening = (!!port && /listening\s*:\s*127\.0\.0\.1:\d+/i.test(statusOutput))
    || (!!port && os.platform() === 'win32' && getWindowsPortListeners(port).some(isLikelyOpenClawGatewayProcess));

  return {
    dashboardUrl,
    port,
    rpcOk,
    rpcFailed,
    listening,
    usable: !!(rpcOk && (dashboardUrl || listening || port)),
    unhealthy: !rpcOk && rpcFailed && !!(dashboardUrl || listening || port)
  };
}

function parseGatewayRuntimeTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const nativeTimestamp = Date.parse(text);
  if (Number.isFinite(nativeTimestamp)) return nativeTimestamp;

  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+|T)(?:(上午|下午|AM|PM)\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/i);
  if (!match) return null;

  const [, yearText, monthText, dayText, meridiemRaw, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  let hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText || '0');
  const meridiem = String(meridiemRaw || '').toLowerCase();

  if (meridiem === 'pm' || meridiem === '下午') {
    if (hour < 12) hour += 12;
  } else if ((meridiem === 'am' || meridiem === '上午') && hour === 12) {
    hour = 0;
  }

  const timestamp = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function readGatewayRuntimeMeta(state, now = Date.now()) {
  const payload = state?.gatewayStatus?.data;
  const runtimeStatus = findStringInObject(payload, [
    ['service', 'runtime', 'status'],
    ['gateway', 'runtime', 'status'],
    ['runtime', 'status'],
    ['status']
  ]).toLowerCase();
  const runtimeState = findStringInObject(payload, [
    ['service', 'runtime', 'state'],
    ['gateway', 'runtime', 'state'],
    ['runtime', 'state']
  ]).toLowerCase();
  const lastRunTimeText = findStringInObject(payload, [
    ['service', 'runtime', 'lastRunTime'],
    ['gateway', 'runtime', 'lastRunTime'],
    ['runtime', 'lastRunTime']
  ]);
  const serviceLoadedValueCandidates = [
    readNestedValue(payload, ['service', 'loaded']),
    readNestedValue(payload, ['gateway', 'loaded']),
    readNestedValue(payload, ['serviceLoaded'])
  ];
  const serviceLoaded = serviceLoadedValueCandidates.find((value) => typeof value === 'boolean');
  const portStatus = findStringInObject(payload, [
    ['port', 'status'],
    ['gateway', 'port', 'status'],
    ['health', 'portStatus']
  ]).toLowerCase();
  const lastRunAt = parseGatewayRuntimeTimestamp(lastRunTimeText);
  const recentLastRun = Number.isFinite(lastRunAt) && lastRunAt <= now && (now - lastRunAt) < GATEWAY_STARTUP_GRACE_MS;
  const observedRecovery = lastGatewayRecoveryObservedAt > 0 && (now - lastGatewayRecoveryObservedAt) < GATEWAY_STARTUP_GRACE_MS;

  return {
    serviceLoaded: serviceLoaded === true,
    runtimeStatus,
    runtimeState,
    portStatus,
    lastRunTimeText,
    lastRunAt,
    recentLastRun,
    observedRecovery,
    withinStartupGrace: recentLastRun || observedRecovery
  };
}

function detectGatewayStartupFlags(state, gatewayHealth, now = Date.now()) {
  const runtimeMeta = readGatewayRuntimeMeta(state, now);
  const payload = state?.gatewayStatus?.data;
  const statusOutput = [state?.gatewayStatus?.stdout, state?.gatewayStatus?.stderr, state?.gatewayStatus?.error].filter(Boolean).join('\n');
  const hasProcessFootprint = !!(
    gatewayHealth?.dashboardUrl
    || gatewayHealth?.port
    || gatewayHealth?.listening
    || runtimeMeta.portStatus === 'busy'
    || runtimeMeta.portStatus === 'free'
    || runtimeMeta.serviceLoaded
    || /\bstarting\b/i.test(statusOutput)
  );
  const runtimeSuggestsStartup = ['starting', 'booting', 'initializing', 'initialising', 'pending'].includes(runtimeMeta.runtimeStatus)
    || ['starting', 'booting', 'initializing', 'initialising', 'pending'].includes(runtimeMeta.runtimeState);
  const unknownButRecent = runtimeMeta.runtimeStatus === 'unknown' && runtimeMeta.withinStartupGrace;
  const rpcFailed = !!gatewayHealth?.rpcFailed;
  const startup = !state?.gatewayRunning
    && !gatewayHealth?.usable
    && hasProcessFootprint
    && (
      runtimeSuggestsStartup
      || unknownButRecent
      || (runtimeMeta.withinStartupGrace && rpcFailed)
    );

  return {
    ...runtimeMeta,
    hasProcessFootprint,
    startup
  };
}

function buildOpenClawLifecycle(state) {
  const gatewayHealth = detectGatewayHealthFlags(state);
  const gatewayStartup = detectGatewayStartupFlags(state, gatewayHealth);
  const status = {
    installed: !!state?.installed,
    version: state?.version || null,
    path: state?.openclawPath || null,
    configExists: !!state?.configExists,
    configReady: !!state?.configReady,
    gatewayReady: !!state?.gatewayReady,
    gatewayRunning: !!state?.gatewayRunning,
    gatewayUsable: gatewayHealth.usable,
    gatewayUnhealthy: gatewayHealth.unhealthy,
    gatewayStarting: gatewayStartup.startup,
    gatewayProbeTimeout: gatewayHealth.unhealthy && gatewayHealth.rpcFailed,
    gatewayFailure: null,
    summary: state?.installed
      ? `where/openclaw --version 探测通过${state?.openclawPath ? ` (${state.openclawPath})` : ''}`
      : 'where/openclaw --version 未通过'
  };

  if (!status.installed) {
    status.stage = 'not_installed';
    status.title = '未安装';
    status.detail = '尚未探测到可用的 OpenClaw。';
    return status;
  }

  if (!status.configReady) {
    status.stage = 'init_incomplete';
    status.title = '已安装，初始化未完成';
    status.detail = 'OpenClaw 本体已安装，但自动初始化配置未完成。';
    return status;
  }

  if (!status.gatewayReady) {
    status.stage = 'gateway_incomplete';
    status.title = '已安装，Gateway 未完成';
    const gatewayError = String(state?.gatewayStatus?.error || state?.gatewayStatus?.stderr || state?.gatewayStatus?.stdout || '').trim();
    if (/schtasks create failed|拒绝访问|access is denied/i.test(gatewayError)) {
      status.gatewayFailure = 'permission';
      status.detail = 'Windows 计划任务创建被拒绝访问，可能需要管理员权限；OpenClaw 本体已安装，但 Gateway service 未完成。';
    } else if (/timed out after 60s|health checks?/i.test(gatewayError)) {
      status.gatewayFailure = 'timeout';
      status.detail = 'Gateway restart 超时，健康检查未通过；OpenClaw 本体已安装，但后台服务配置未完成。';
    } else {
      status.detail = 'OpenClaw 本体已安装，但 Gateway 服务尚未具备启动条件。';
    }
    return status;
  }

  if (status.gatewayRunning) {
    status.stage = 'ready';
    status.title = '已安装并运行';
    status.detail = 'OpenClaw 与 Gateway 均已就绪。';
    return status;
  }

  if (status.gatewayUsable) {
    status.stage = 'gateway_degraded';
    status.title = 'Gateway 可用，状态待同步';
    status.detail = 'Gateway 已可连接，但官方 runtime 状态尚未完全同步。';
    return status;
  }

  if (status.gatewayStarting) {
    status.stage = 'gateway_starting';
    status.title = 'Gateway 启动中';
    status.detail = gatewayStartup.observedRecovery
      ? `Gateway 已收到重启/恢复请求，仍在启动中；当前宽限窗口为 ${Math.round(GATEWAY_STARTUP_GRACE_MS / 1000)} 秒。`
      : 'Gateway 已开始启动，但 RPC 健康检查尚未就绪；当前先按启动中处理，避免把正常冷启动误判为异常。';
    return status;
  }

  if (status.gatewayUnhealthy) {
    status.stage = 'gateway_unhealthy';
    status.title = 'Gateway 异常';
    status.detail = 'Gateway 端口已监听，但 RPC probe 未通过；常见于 Windows 开机自启动后的半活状态。';
    return status;
  }

  status.stage = 'installed_ready';
  status.title = '已安装，可启动';
  status.detail = 'OpenClaw 已安装，Gateway 已具备启动条件。';
  return status;
}

function buildOpenClawLifecycleFromConfigOnly() {
  const home = os.homedir();
  const quickCandidates = os.platform() === 'win32'
    ? [
        path.join(process.env.APPDATA || '', 'npm', 'openclaw.cmd'),
        path.join(home, '.openclaw', 'openclaw.exe'),
        path.join(home, '.openclaw', 'bin', 'openclaw.exe'),
        path.join(home, 'scoop', 'shims', 'openclaw.exe')
      ]
    : os.platform() === 'darwin'
      ? [
          path.join(home, '.local', 'bin', 'openclaw'),
          '/opt/homebrew/bin/openclaw',
          '/usr/local/bin/openclaw'
        ]
      : [
          path.join(home, '.local', 'bin', 'openclaw'),
          '/usr/local/bin/openclaw',
          '/usr/bin/openclaw'
        ];
  const openclawPath = quickCandidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
  const installed = !!openclawPath;
  const configAuth = readOpenClawDashboardAuthFromConfig();
  const configExists = !!configAuth?.exists;
  const configReady = configExists && ['none', 'token'].includes(configAuth?.mode || '');

  if (!installed) {
    return {
      installed: false,
      version: null,
      path: null,
      configExists,
      configReady: false,
      gatewayReady: false,
      gatewayRunning: false,
      gatewayUsable: false,
      gatewayUnhealthy: false,
      gatewayStarting: false,
      gatewayProbeTimeout: false,
      gatewayFailure: null,
      summary: 'where/openclaw 未通过',
      stage: 'not_installed',
      title: '未安装',
      detail: '尚未探测到可用的 OpenClaw。'
    };
  }

  if (!configReady) {
    return {
      installed: true,
      version: null,
      path: openclawPath || null,
      configExists,
      configReady: false,
      gatewayReady: false,
      gatewayRunning: false,
      gatewayUsable: false,
      gatewayUnhealthy: false,
      gatewayStarting: false,
      gatewayProbeTimeout: false,
      gatewayFailure: null,
      summary: `快速配置检测${openclawPath ? ` (${openclawPath})` : ''}`,
      stage: 'init_incomplete',
      title: '已安装，初始化未完成',
      detail: 'OpenClaw 本体已安装，但自动初始化配置未完成。'
    };
  }

  if (recentSticky) {
    return {
      ...recentSticky,
      sticky: true,
      detail: recentSticky.gatewayRunning
        ? '沿用最近一次成功状态，等待后台探测同步。'
        : '沿用最近一次可用状态，等待后台探测同步。'
    };
  }

  return {
    installed: true,
    version: null,
    path: openclawPath || null,
    configExists,
    configReady: true,
    gatewayReady: false,
    gatewayRunning: false,
    gatewayUsable: false,
    gatewayUnhealthy: false,
    gatewayStarting: false,
    gatewayProbeTimeout: false,
    gatewayFailure: null,
    summary: `快速配置检测${openclawPath ? ` (${openclawPath})` : ''}`,
    stage: 'gateway_incomplete',
    title: '已安装，等待检测',
    detail: '已检测到 OpenClaw 与基础配置，等待后台探测确认 Gateway 状态。'
  };
}

function applyOpenClawLifecycleSticky(status) {
  const now = Date.now();
  if (status?.stage === 'ready' || status?.stage === 'installed_ready' || status?.stage === 'gateway_degraded') {
    lastHealthyOpenClawLifecycle = {
      time: now,
      status: {
        ...status,
        sticky: false
      }
    };
    return status;
  }

  if (lastHealthyOpenClawLifecycle && (now - lastHealthyOpenClawLifecycle.time) < STATUS_STICKY_TTL_MS) {
    return {
      ...lastHealthyOpenClawLifecycle.status,
      sticky: true,
      detail: lastHealthyOpenClawLifecycle.status.gatewayRunning
        ? '沿用最近一次成功状态，等待后台探测同步。'
        : '沿用最近一次可用状态，等待后台探测同步。'
    };
  }

  return status;
}

function getRecentHealthyOpenClawLifecycle(now = Date.now()) {
  if (!lastHealthyOpenClawLifecycle) return null;
  if ((now - lastHealthyOpenClawLifecycle.time) >= STATUS_STICKY_TTL_MS) return null;
  return {
    ...lastHealthyOpenClawLifecycle.status,
    sticky: true,
    detail: lastHealthyOpenClawLifecycle.status.gatewayRunning
      ? '沿用最近一次成功状态，等待后台探测同步。'
      : '沿用最近一次可用状态，等待后台探测同步。'
  };
}

function getLiteOpenClawLifecycle() {
  if (cachedLiteLifecycle && (Date.now() - cachedLiteLifecycleAt) < STATUS_LITE_INSPECT_TTL_MS) {
    return cachedLiteLifecycle;
  }

  const configOnly = buildOpenClawLifecycleFromConfigOnly();
  if (!configOnly.installed || !configOnly.configReady) {
    cachedLiteLifecycle = configOnly;
    cachedLiteLifecycleAt = Date.now();
    return configOnly;
  }

  try {
    const inspected = applyOpenClawLifecycleSticky(buildOpenClawLifecycle(inspectOpenClawState()));
    cachedLiteLifecycle = inspected;
    cachedLiteLifecycleAt = Date.now();
    return inspected;
  } catch {
    cachedLiteLifecycle = configOnly;
    cachedLiteLifecycleAt = Date.now();
    return configOnly;
  }
}

function rememberHealthyOpenClawLifecycle(status) {
  if (status?.stage === 'ready' || status?.stage === 'installed_ready' || status?.stage === 'gateway_degraded') {
    lastHealthyOpenClawLifecycle = {
      time: Date.now(),
      status: {
        ...status,
        sticky: false
      }
    };
  }
  return status;
}

function rememberObservedDashboardOpenClawLifecycle(status) {
  if (!status?.installed) return status;
  lastObservedDashboardOpenClawLifecycle = {
    time: Date.now(),
    status: {
      ...status,
      sticky: false
    }
  };
  return status;
}

function buildObservedDashboardOpenClawLifecycle(state) {
  const openclawPath = state?.openclawPath || null;
  return {
    installed: true,
    version: state?.version || null,
    path: openclawPath,
    configExists: !!state?.configExists,
    configReady: !!state?.configReady,
    gatewayReady: true,
    gatewayRunning: true,
    gatewayUsable: true,
    gatewayUnhealthy: false,
    gatewayStarting: false,
    gatewayProbeTimeout: false,
    gatewayFailure: null,
    summary: openclawPath
      ? `Dashboard 地址探测通过 (${openclawPath})`
      : 'Dashboard 地址探测通过',
    stage: 'ready',
    title: '已安装并运行',
    detail: 'OpenClaw 与 Gateway 均已就绪。'
  };
}

function getRecentObservedDashboardOpenClawLifecycle(now = Date.now()) {
  if (!lastObservedDashboardOpenClawLifecycle) return null;
  if ((now - lastObservedDashboardOpenClawLifecycle.time) >= DASHBOARD_OBSERVED_STATUS_TTL_MS) return null;
  return {
    ...lastObservedDashboardOpenClawLifecycle.status,
    sticky: true,
    detail: '沿用最近一次确认可打开的 Dashboard 状态，等待后台探测同步。'
  };
}

function buildObservedOpenClawLifecycle(state) {
  return rememberHealthyOpenClawLifecycle(buildOpenClawLifecycle(state));
}

function rememberObservedOpenClawState(state, options = {}) {
  if (!state) return null;
  const lifecycle = options.lifecycle
    ? rememberHealthyOpenClawLifecycle(options.lifecycle)
    : buildObservedOpenClawLifecycle(state);
  cachedOpenClawState = state;
  cachedOpenClawStateAt = Date.now();
  cachedLiteLifecycle = lifecycle;
  cachedLiteLifecycleAt = Date.now();
  cachedStatusPayload = null;
  cachedStatusAt = 0;
  cachedToolsStatusPayload = null;
  cachedToolsStatusAt = 0;
  if (options.dashboardObserved) {
    rememberObservedDashboardOpenClawLifecycle(lifecycle);
  }
  return lifecycle;
}

function syncStatusCachesAfterOpenClawUpdate(result) {
  const state = result?.state;
  if (result?.success && state?.installed) {
    rememberObservedOpenClawState(state);
    if (state.gatewayRunning) {
      noteGatewayRecoveryObservation();
    }
    scheduleOpenClawStateWarmup();
    return;
  }

  invalidateStatusCaches({
    clearSticky: !state?.installed,
    clearGatewayRecovery: true
  });
}

function buildObservedDashboardOpenClawState(state, options = {}) {
  const gatewayPort = Number(options.port) || null;
  const gatewayToken = options.token ? String(options.token) : '';
  const dashboardUrl = options.url ? String(options.url) : '';
  const gatewayData = state?.gatewayStatus?.data && typeof state.gatewayStatus.data === 'object'
    ? { ...state.gatewayStatus.data }
    : {};
  const dashboardData = gatewayData.dashboard && typeof gatewayData.dashboard === 'object'
    ? { ...gatewayData.dashboard }
    : {};
  const gatewayMeta = gatewayData.gateway && typeof gatewayData.gateway === 'object'
    ? { ...gatewayData.gateway }
    : {};
  const rpcMeta = gatewayData.rpc && typeof gatewayData.rpc === 'object'
    ? { ...gatewayData.rpc }
    : {};

  if (dashboardUrl) {
    dashboardData.url = dashboardUrl;
    gatewayData.url = dashboardUrl;
  }
  if (gatewayPort) {
    dashboardData.port = gatewayPort;
    gatewayMeta.port = gatewayPort;
    gatewayData.port = gatewayPort;
  }
  if (gatewayToken) {
    dashboardData.token = gatewayToken;
    gatewayData.token = gatewayToken;
  }

  gatewayData.dashboard = dashboardData;
  gatewayData.gateway = gatewayMeta;
  gatewayData.rpc = {
    ...rpcMeta,
    ok: true
  };

  return {
    ...(state || {}),
    installed: state?.installed !== false,
    configExists: state?.configExists !== false,
    configReady: state?.configReady !== false,
    gatewayReady: true,
    gatewayRunning: true,
    gatewayStatus: {
      ...(state?.gatewayStatus || {}),
      ok: true,
      error: '',
      stderr: '',
      data: gatewayData
    }
  };
}

function cacheObservedOpenClawDashboardSuccess(openclawPath, configAuth, resolution, payload = null, statusOutputs = [], version = null) {
  const observedState = buildObservedDashboardOpenClawState({
    installed: true,
    openclawPath: openclawPath || null,
    version: version || null,
    configExists: !!configAuth?.exists,
    configReady: !!configAuth?.exists && (
      ['none', 'token'].includes(String(configAuth?.mode || '').trim().toLowerCase())
      || !!configAuth?.token
      || !!configAuth?.url
      || !!configAuth?.port
    ),
    gatewayReady: true,
    gatewayRunning: true,
    gatewayStatus: {
      ok: true,
      data: payload,
      stdout: statusOutputs.filter(Boolean).join('\n'),
      stderr: '',
      error: ''
    }
  }, {
    url: resolution.dashboardUrl,
    port: resolution.gatewayPort,
    token: resolution.gatewayToken
  });

  return rememberObservedOpenClawState(observedState, {
    dashboardObserved: true,
    lifecycle: buildObservedDashboardOpenClawLifecycle(observedState)
  });
}

function resolveOpenClawDashboardTarget(options = {}) {
  const payload = options.payload && typeof options.payload === 'object'
    ? options.payload
    : null;
  const configAuth = options.configAuth && typeof options.configAuth === 'object'
    ? options.configAuth
    : {};
  const statusOutputs = [
    ...(Array.isArray(options.statusOutputs) ? options.statusOutputs : []),
    options.statusOutput || ''
  ].filter(Boolean);
  const combinedOutput = statusOutputs.join('\n');
  const authMode = String(configAuth.mode || '').trim().toLowerCase();
  const preferTokenless = authMode === 'none';

  let gatewayRunning = !!options.gatewayRunning;
  if (payload) gatewayRunning = gatewayRunning || detectGatewayRunningFromPayload(payload);

  let gatewayPort = (payload ? findGatewayPortInJson(payload) : null)
    || configAuth.port
    || parseGatewayPortFromText(combinedOutput);
  let gatewayToken = (payload ? findGatewayTokenInJson(payload) : '')
    || configAuth.token
    || parseOpenClawTokenFromText(combinedOutput);

  if (preferTokenless) gatewayToken = '';

  let dashboardUrl = '';
  const payloadDashboardUrl = payload ? parseOpenclawDashboardUrlFromJson(payload) : '';
  const textDashboardUrl = parseOpenclawDashboardUrlFromText(combinedOutput);
  if (gatewayRunning && payloadDashboardUrl) dashboardUrl = payloadDashboardUrl;
  if (!dashboardUrl && gatewayRunning && textDashboardUrl) dashboardUrl = textDashboardUrl;
  if (!dashboardUrl && gatewayRunning && configAuth.url && isPreferredOpenClawPanelUrl(configAuth.url)) {
    dashboardUrl = configAuth.url;
  }
  if (!dashboardUrl && gatewayRunning && gatewayPort && (preferTokenless || gatewayToken)) {
    dashboardUrl = buildOpenClawDashboardUrlFromParts(gatewayPort, gatewayToken);
  }
  dashboardUrl = normalizeOpenClawDashboardUrl(dashboardUrl, gatewayToken);

  const needsDeepProbe = !dashboardUrl
    && (gatewayRunning || !payload)
    && (!gatewayPort || (!preferTokenless && !gatewayToken));

  return {
    dashboardUrl,
    gatewayPort,
    gatewayToken,
    gatewayRunning,
    authMode,
    needsDeepProbe
  };
}

function buildQuickOpenClawLifecycleSnapshot() {
  if (quickOpenClawLifecycleSnapshotOverride) {
    return {
      ...quickOpenClawLifecycleSnapshotOverride
    };
  }

  const home = os.homedir();
  const quickCandidates = os.platform() === 'win32'
    ? [
        path.join(process.env.APPDATA || '', 'npm', 'openclaw.cmd'),
        path.join(home, '.openclaw', 'openclaw.exe'),
        path.join(home, '.openclaw', 'bin', 'openclaw.exe'),
        path.join(home, 'scoop', 'shims', 'openclaw.exe')
      ]
    : os.platform() === 'darwin'
      ? [
          path.join(home, '.local', 'bin', 'openclaw'),
          '/opt/homebrew/bin/openclaw',
          '/usr/local/bin/openclaw'
        ]
      : [
          path.join(home, '.local', 'bin', 'openclaw'),
          '/usr/local/bin/openclaw',
          '/usr/bin/openclaw'
        ];
  const openclawPath = quickCandidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
  const configAuth = readOpenClawDashboardAuthFromConfig();
  const configExists = !!configAuth?.exists;
  const configReady = configExists && ['none', 'token'].includes(configAuth?.mode || '');

  if (!openclawPath) {
    return {
      installed: false,
      version: null,
      path: null,
      configExists,
      configReady: false,
      gatewayReady: false,
      gatewayRunning: false,
      gatewayUsable: false,
      gatewayUnhealthy: false,
      gatewayStarting: false,
      gatewayProbeTimeout: false,
      gatewayFailure: null,
      summary: 'where/openclaw 未通过',
      stage: 'not_installed',
      title: '未安装',
      detail: '尚未探测到可用的 OpenClaw。'
    };
  }

  if (!configReady) {
    return {
      installed: true,
      version: null,
      path: openclawPath,
      configExists,
      configReady: false,
      gatewayReady: false,
      gatewayRunning: false,
      gatewayUsable: false,
      gatewayUnhealthy: false,
      gatewayStarting: false,
      gatewayProbeTimeout: false,
      gatewayFailure: null,
      summary: `快速配置检测${openclawPath ? ` (${openclawPath})` : ''}`,
      stage: 'init_incomplete',
      title: '已安装，初始化未完成',
      detail: 'OpenClaw 本体已安装，但自动初始化配置未完成。'
    };
  }

  return {
    installed: true,
    version: null,
    path: openclawPath,
    configExists,
    configReady: true,
    gatewayReady: false,
    gatewayRunning: false,
    gatewayUsable: false,
    gatewayUnhealthy: false,
    gatewayStarting: false,
    gatewayProbeTimeout: false,
    gatewayFailure: null,
    summary: `快速配置检测${openclawPath ? ` (${openclawPath})` : ''}`,
    stage: 'gateway_incomplete',
    title: '已安装，等待检测',
    detail: '已检测到 OpenClaw 与基础配置，等待后台探测确认 Gateway 状态。'
  };
}

function getFastLiteOpenClawLifecycle() {
  if (cachedLiteLifecycle && (Date.now() - cachedLiteLifecycleAt) < STATUS_LITE_INSPECT_TTL_MS) {
    return cachedLiteLifecycle;
  }

  if (hasFreshOpenClawStateCache()) {
    const inspected = buildObservedOpenClawLifecycle(cachedOpenClawState);
    cachedLiteLifecycle = inspected;
    cachedLiteLifecycleAt = Date.now();
    return inspected;
  }

  const snapshot = buildQuickOpenClawLifecycleSnapshot();
  if (snapshot.installed && snapshot.configReady) {
    const observedDashboardLifecycle = getRecentObservedDashboardOpenClawLifecycle();
    if (observedDashboardLifecycle) {
      cachedLiteLifecycle = observedDashboardLifecycle;
      cachedLiteLifecycleAt = Date.now();
      return observedDashboardLifecycle;
    }

    const recentHealthyLifecycle = getRecentHealthyOpenClawLifecycle();
    if (recentHealthyLifecycle) {
      cachedLiteLifecycle = recentHealthyLifecycle;
      cachedLiteLifecycleAt = Date.now();
      return recentHealthyLifecycle;
    }
  }
  cachedLiteLifecycle = snapshot;
  cachedLiteLifecycleAt = Date.now();
  return snapshot;
}

function runPowerShellJson(script, timeout = 15000) {
  try {
    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      timeout,
      env: getExtendedShellEnv()
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (result.status !== 0 || result.error) return [];
    if (!output) return [];
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function quoteWindowsCmdArg(value) {
  const stringValue = String(value ?? '');
  return `"${stringValue.replace(/"/g, '""').replace(/%/g, '%%')}"`;
}

function normalizeWindowsWrapperPath(commandPath) {
  let normalized = String(commandPath || '').trim();
  while ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
}

function resolveWindowsCliCommandPath(commandPath) {
  const normalized = normalizeWindowsWrapperPath(commandPath);
  if (os.platform() !== 'win32' || !normalized) return normalized;

  if (/\.ps1$/i.test(normalized)) {
    const cmdCandidate = `${normalized.slice(0, -4)}.cmd`;
    if (fs.existsSync(cmdCandidate)) return cmdCandidate;
  }

  if (!path.extname(normalized)) {
    const cmdCandidate = `${normalized}.cmd`;
    if (fs.existsSync(cmdCandidate)) return cmdCandidate;
  }

  return normalized;
}

function createRequestTimer(label, req) {
  const startedAt = Date.now();
  const steps = [];
  const route = req?.originalUrl || req?.url || label;

  return {
    step(name, meta = {}) {
      const stepStartedAt = Date.now();
      return (extra = {}) => {
        steps.push({
          name,
          ms: Date.now() - stepStartedAt,
          ...meta,
          ...extra
        });
      };
    },
    log(status = 'ok', meta = {}) {
      const payload = {
        route,
        status,
        totalMs: Date.now() - startedAt,
        ...meta,
        steps
      };
      console.log(`[timing] ${label} ${JSON.stringify(payload)}`);
    }
  };
}

function shouldAutoOpenBrowser(devMode) {
  if (devMode) return false;
  if (process.env.CLAWBOX_DESKTOP === '1') return false;
  if (process.env.CLAWBOX_NO_AUTO_OPEN === '1') return false;
  if (String(process.env.BROWSER || '').toLowerCase() === 'none') return false;
  return true;
}

function openBrowserUrl(url) {
  if (!url) return;

  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/d', '/s', '/c', `start "" ${quoteWindowsCmdArg(url)}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
      return;
    }

    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(command, [url], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  } catch {}
}

function runResolvedCliCommand(commandPath, args = [], timeout = 10000) {
  if (!commandPath) {
    return { ok: false, status: null, stdout: '', stderr: '', output: '', error: new Error('未找到可执行文件') };
  }

  const normalizedCommandPath = os.platform() === 'win32'
    ? resolveWindowsCliCommandPath(commandPath)
    : commandPath;
  const isWindowsWrapper = os.platform() === 'win32' && /\.(cmd|bat)$/i.test(normalizedCommandPath);
  const result = isWindowsWrapper
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', normalizedCommandPath, ...args], {
        encoding: 'utf8',
        timeout,
        env: getExtendedShellEnv(),
        windowsHide: true,
        windowsVerbatimArguments: true
      })
    : spawnSync(normalizedCommandPath, args, {
        encoding: 'utf8',
        timeout,
        env: getExtendedShellEnv(),
        windowsHide: os.platform() === 'win32'
      });

  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
    error: result.error || null
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readNestedValue(value, pathParts) {
  let current = value;
  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function findStringInObject(value, candidatePaths) {
  for (const candidatePath of candidatePaths) {
    const candidate = readNestedValue(value, candidatePath);
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

function findNumberInObject(value, candidatePaths) {
  for (const candidatePath of candidatePaths) {
    const candidate = readNestedValue(value, candidatePath);
    const num = Number(candidate);
    if (Number.isInteger(num) && num > 0 && num <= 65535) return num;
  }
  return null;
}

function parseGatewayPortFromText(output) {
  const text = String(output || '');
  const patterns = [
    /gateway port\s+(\d{2,5})/i,
    /port\s+(\d{2,5})\s+is already in use/i,
    /127\.0\.0\.1:(\d{2,5})/i,
    /localhost:(\d{2,5})/i,
    /--port\s+(\d{2,5})/i,
    /\bport\D{0,6}(\d{2,5})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const port = Number(match?.[1]);
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  }
  return null;
}

function findGatewayPortInJson(payload) {
  return findNumberInObject(payload, [
    ['dashboard', 'port'],
    ['gateway', 'port'],
    ['gateway', 'listenPort'],
    ['service', 'port'],
    ['runtime', 'port'],
    ['port']
  ]);
}

function parseOpenClawTokenFromText(output) {
  const text = String(output || '');
  const patterns = [
    /[?&](?:token|auth)=([^\s'"&]+)/i,
    /\btoken\b\s*[:=]\s*([^\s'\";]+)/i,
    /\bauth\b\s*[:=]\s*([^\s'\";]+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function findGatewayTokenInJson(payload) {
  return findStringInObject(payload, [
    ['dashboard', 'token'],
    ['gateway', 'token'],
    ['auth', 'token'],
    ['token'],
    ['auth']
  ]);
}

function buildOpenClawDashboardUrlFromParts(port, token) {
  const normalizedPort = Number(port);
  if (!Number.isInteger(normalizedPort) || normalizedPort <= 0 || normalizedPort > 65535) return null;
  const url = new URL(`http://127.0.0.1:${normalizedPort}/`);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

function readOpenClawDashboardAuthFromConfig(configPath) {
  const fallbackPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  const targetPath = String(configPath || '').trim() || fallbackPath;

  try {
    if (!fs.existsSync(targetPath)) {
      return {
        exists: false,
        path: targetPath,
        mode: null,
        token: '',
        port: null,
        url: null
      };
    }

    const payload = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    const mode = findStringInObject(payload, [
      ['gateway', 'auth', 'mode'],
      ['config', 'gateway', 'auth', 'mode']
    ]) || null;
    const token = findStringInObject(payload, [
      ['gateway', 'auth', 'token'],
      ['config', 'gateway', 'auth', 'token']
    ]) || '';
    const port = findNumberInObject(payload, [
      ['gateway', 'port'],
      ['gateway', 'listenPort'],
      ['config', 'gateway', 'port'],
      ['config', 'gateway', 'listenPort']
    ]) || null;
    const url = findStringInObject(payload, [
      ['gateway', 'dashboard', 'url'],
      ['config', 'gateway', 'dashboard', 'url']
    ]) || null;

    return { exists: true, path: targetPath, mode, token, port, url };
  } catch (error) {
    return {
      exists: true,
      path: targetPath,
      mode: null,
      token: '',
      port: null,
      url: null,
      error: error.message
    };
  }
}

function normalizeOpenClawDashboardUrl(url, token) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    if (token && !parsed.searchParams.get('token') && !parsed.searchParams.get('auth')) {
      parsed.searchParams.set('token', token);
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function detectGatewayRunningFromPayload(payload) {
  return installerTest.isGatewayStatusRunning(payload);
}

function getWindowsPortListeners(port) {
  const normalizedPort = Number(port);
  if (os.platform() !== 'win32' || !Number.isInteger(normalizedPort) || normalizedPort <= 0) return [];
  const script = [
    `$port=${normalizedPort};`,
    "$conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue;",
    "if (-not $conns) { '[]'; exit 0 }",
    "$items = foreach ($conn in $conns) {",
    "  $proc = Get-CimInstance Win32_Process -Filter \"ProcessId = $($conn.OwningProcess)\" -ErrorAction SilentlyContinue;",
    "  [PSCustomObject]@{ pid = $conn.OwningProcess; localAddress = $conn.LocalAddress; localPort = $conn.LocalPort; name = $proc.Name; commandLine = $proc.CommandLine; executablePath = $proc.ExecutablePath }",
    "}",
    "$items | ConvertTo-Json -Compress"
  ].join(' ');
  return runPowerShellJson(script, 15000).map((item) => ({
    pid: Number(item.pid || item.ProcessId || item.OwningProcess || 0),
    localAddress: item.localAddress || item.LocalAddress || '',
    localPort: Number(item.localPort || item.LocalPort || normalizedPort),
    name: item.name || item.Name || '',
    commandLine: item.commandLine || item.CommandLine || '',
    executablePath: item.executablePath || item.ExecutablePath || ''
  })).filter((item) => item.pid > 0);
}

function isLikelyOpenClawGatewayProcess(processInfo) {
  const haystack = [processInfo?.name, processInfo?.commandLine, processInfo?.executablePath].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes('openclaw') && haystack.includes('gateway');
}

async function waitForPortState(port, shouldBeFree, timeoutMs = 20000) {
  const normalizedPort = Number(port);
  if (!Number.isInteger(normalizedPort) || normalizedPort <= 0) return { success: !shouldBeFree, listeners: [] };
  const start = Date.now();
  let listeners = [];
  while (Date.now() - start < timeoutMs) {
    listeners = getWindowsPortListeners(normalizedPort);
    if (shouldBeFree ? listeners.length === 0 : listeners.length > 0) {
      return { success: true, listeners };
    }
    await sleep(1000);
  }
  listeners = getWindowsPortListeners(normalizedPort);
  return { success: shouldBeFree ? listeners.length === 0 : listeners.length > 0, listeners };
}

async function waitForGatewayHealthy(timeoutMs = GATEWAY_RECOVERY_TIMEOUT_MS) {
  const start = Date.now();
  let lastState = inspectOpenClawState();
  cacheOpenClawStateSnapshot(lastState);
  while (Date.now() - start < timeoutMs) {
    lastState = inspectOpenClawState();
    cacheOpenClawStateSnapshot(lastState);
    if (lastState.gatewayRunning) {
      clearGatewayRecoveryObservation();
      return { success: true, state: lastState };
    }
    await sleep(1000);
  }
  lastState = inspectOpenClawState();
  cacheOpenClawStateSnapshot(lastState);
  if (lastState.gatewayRunning) {
    clearGatewayRecoveryObservation();
  }
  return { success: !!lastState.gatewayRunning, state: lastState };
}

function isGatewayUsableFromState(state) {
  if (!state || typeof state !== 'object') return false;
  if (state.gatewayRunning) return true;

  const payload = state.gatewayStatus?.data;
  const statusOutput = [state.gatewayStatus?.stdout, state.gatewayStatus?.stderr, state.gatewayStatus?.error].filter(Boolean).join('\n');
  const dashboardUrl = payload ? parseOpenclawDashboardUrlFromJson(payload) : '';
  const port = (payload ? findGatewayPortInJson(payload) : null) || parseGatewayPortFromText(statusOutput);

  const rpcOk = !!readNestedValue(payload, ['rpc', 'ok'])
    || !!readNestedValue(payload, ['gateway', 'rpcOk'])
    || !!readNestedValue(payload, ['gateway', 'rpc', 'ok'])
    || !!readNestedValue(payload, ['health', 'rpcOk'])
    || !!readNestedValue(payload, ['probe', 'ok'])
    || /rpc probe:\s*ok/i.test(statusOutput);

  const listening = (!!port && /listening\s*:\s*127\.0\.0\.1:\d+/i.test(statusOutput))
    || (!!port && os.platform() === 'win32' && getWindowsPortListeners(port).some(isLikelyOpenClawGatewayProcess));

  return !!(rpcOk && (dashboardUrl || listening || port));
}

async function observeWindowsGatewayRecovery(timeoutMs = GATEWAY_RECOVERY_TIMEOUT_MS, intervalMs = GATEWAY_RECOVERY_INTERVAL_MS) {
  const start = Date.now();
  let lastState = inspectOpenClawState();
  cacheOpenClawStateSnapshot(lastState);

  while (Date.now() - start < timeoutMs) {
    lastState = inspectOpenClawState();
    cacheOpenClawStateSnapshot(lastState);
    if (isGatewayUsableFromState(lastState)) {
      clearGatewayRecoveryObservation();
      return { success: true, state: lastState, degraded: !lastState.gatewayRunning };
    }
    await sleep(intervalMs);
  }

  lastState = inspectOpenClawState();
  cacheOpenClawStateSnapshot(lastState);
  if (isGatewayUsableFromState(lastState)) {
    clearGatewayRecoveryObservation();
  }
  return { success: isGatewayUsableFromState(lastState), state: lastState, degraded: !lastState.gatewayRunning };
}

function summarizeWindowsGatewayListeners(port, listeners = []) {
  if (!listeners.length) return port ? `端口 ${port} 当前无监听进程` : '当前未检测到监听进程';
  return listeners.map((item) => `pid ${item.pid}: ${item.commandLine || item.name || item.executablePath || '未知进程'}`).join('；');
}

function killWindowsProcessTree(pid) {
  const normalizedPid = Number(pid);
  if (os.platform() !== 'win32' || !Number.isInteger(normalizedPid) || normalizedPid <= 0) {
    return { ok: false, output: '无效的 PID' };
  }

  try {
    const result = spawnSync('taskkill', ['/PID', String(normalizedPid), '/F', '/T'], {
      encoding: 'utf8',
      timeout: 15000,
      env: getExtendedShellEnv(),
      windowsHide: true
    });
    return {
      ok: result.status === 0 && !result.error,
      output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
      error: result.error || null
    };
  } catch (error) {
    return { ok: false, output: error.message || 'taskkill 执行失败', error };
  }
}

async function recoverWindowsGateway(openclawPath) {
  const beforeState = inspectOpenClawState();
  const statusOutput = [beforeState?.gatewayStatus?.stdout, beforeState?.gatewayStatus?.stderr, beforeState?.gatewayStatus?.error].filter(Boolean).join('\n');
  const port = findGatewayPortInJson(beforeState?.gatewayStatus?.data) || parseGatewayPortFromText(statusOutput) || findNumberInObject(beforeState, [['gatewayPort']]);
  const listenersBefore = getWindowsPortListeners(port);
  const shouldStopFirst = !!beforeState.gatewayRunning || listenersBefore.some(isLikelyOpenClawGatewayProcess);
  let stopResult = null;

  if (shouldStopFirst) {
    stopResult = runResolvedCliCommand(openclawPath || 'openclaw', ['gateway', 'stop'], 30000);
    let release = await waitForPortState(port, true, 25000);
    if (!release.success) {
      const staleGatewayListeners = release.listeners.filter(isLikelyOpenClawGatewayProcess);
      if (staleGatewayListeners.length) {
        const killOutputs = staleGatewayListeners
          .map((item) => ({ pid: item.pid, result: killWindowsProcessTree(item.pid) }))
          .filter((item) => item.result.output)
          .map((item) => `taskkill pid ${item.pid}: ${item.result.output}`);
        release = await waitForPortState(port, true, 10000);
        if (release.success) {
          stopResult = {
            ...stopResult,
            output: [stopResult?.output, ...killOutputs].filter(Boolean).join('\n')
          };
        }
      }
    }
    if (!release.success) {
      return {
        success: false,
        stage: 'stop',
        port,
        stopResult,
        listeners: release.listeners,
        error: `已尝试停止 Gateway，但端口 ${port || '未知'} 仍被占用：${summarizeWindowsGatewayListeners(port, release.listeners)}`
      };
    }
  }

  const startResult = runResolvedCliCommand(openclawPath || 'openclaw', ['gateway', 'start'], 30000);
  if (!startResult.ok) {
    return {
      success: false,
      stage: 'start',
      port,
      stopResult,
      startResult,
      error: startResult.output || startResult.error?.message || 'Gateway 启动失败'
    };
  }

  noteGatewayRecoveryObservation();
  const health = await waitForGatewayHealthy(GATEWAY_RECOVERY_TIMEOUT_MS);
  if (!health.success) {
    const listenersAfter = getWindowsPortListeners(port || findGatewayPortInJson(health.state?.gatewayStatus?.data) || parseGatewayPortFromText([health.state?.gatewayStatus?.stdout, health.state?.gatewayStatus?.stderr, health.state?.gatewayStatus?.error].filter(Boolean).join('\n')));
    return {
      success: false,
      stage: 'health',
      port: port || findGatewayPortInJson(health.state?.gatewayStatus?.data) || null,
      stopResult,
      startResult,
      state: health.state,
      listeners: listenersAfter,
      error: `Gateway 已启动但健康检查未通过${listenersAfter.length ? `；${summarizeWindowsGatewayListeners(port, listenersAfter)}` : ''}`
    };
  }

  return {
    success: true,
    stage: 'done',
    port: port || findGatewayPortInJson(health.state?.gatewayStatus?.data) || null,
    stopResult,
    startResult,
    state: health.state
  };
}

function getWindowsNodeRegistryEntries() {
  if (os.platform() !== 'win32') return [];

  const script = [
    "$roots=@(",
    "'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
    "'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',",
    "'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'",
    ");",
    "Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue |",
    "Where-Object {",
    "  ($_.DisplayName -match 'Node\\.js') -or",
    "  ($_.DisplayName -match '^Node.js') -or",
    "  ($_.Publisher -match 'OpenJS')",
    "} |",
    "Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, QuietUninstallString, UninstallString, PSChildName |",
    "ConvertTo-Json -Compress"
  ].join(' ');

  return runPowerShellJson(script).map((entry) => ({
    displayName: entry.DisplayName || '',
    displayVersion: entry.DisplayVersion || '',
    publisher: entry.Publisher || '',
    installLocation: entry.InstallLocation || '',
    quietUninstallString: entry.QuietUninstallString || '',
    uninstallString: entry.UninstallString || '',
    productCode: entry.PSChildName || ''
  }));
}

function buildWindowsNodeManualHint(nodeInfo, registryEntries, logs) {
  const entry = registryEntries[0];
  const lines = [
    '无法完成 Node.js 自动卸载。',
    '',
    `当前检测路径: ${nodeInfo.path || '未找到'}`,
  ];

  if (nodeInfo.version) lines.push(`当前检测版本: ${nodeInfo.version}`);
  if (entry?.displayName) lines.push(`注册表安装项: ${entry.displayName}${entry.displayVersion ? ` ${entry.displayVersion}` : ''}`);
  if (entry?.uninstallString) lines.push(`卸载命令: ${entry.uninstallString}`);
  if (entry?.installLocation) lines.push(`安装目录: ${entry.installLocation}`);

  lines.push(
    '',
    '建议后续路径：',
    '1. 设置 → 应用 → 已安装的应用，搜索 Node.js 后卸载',
    '2. 以管理员 PowerShell 执行 winget uninstall OpenJS.NodeJS.LTS 或 winget uninstall OpenJS.NodeJS',
    '3. 如果界面弹出官方卸载器，请完成向导后重新打开 ClawBox'
  );

  if (logs.length) {
    lines.push('', logs.join('\n'));
  }

  return lines.join('\n');
}

function getWindowsNodeUninstallGuard(nodeInfo, runtimeNode, registryEntries) {
  const normalizedNodePath = String(nodeInfo?.path || '').toLowerCase();
  const normalizedRuntimePath = String(runtimeNode?.path || '').toLowerCase();
  const sameRuntime = normalizedNodePath && normalizedRuntimePath && normalizedNodePath === normalizedRuntimePath;
  const runtimeLooksBundled = normalizedRuntimePath && !['windows_official', 'chocolatey', 'scoop'].includes(runtimeNode?.source) && !registryEntries.some((entry) => String(entry.installLocation || '').toLowerCase() === normalizedRuntimePath);
  const systemManagedNode = registryEntries.length > 0 || ['windows_official', 'chocolatey', 'scoop'].includes(nodeInfo?.source);

  if (sameRuntime) {
    return { blocked: true, reason: 'runtime_in_use', detail: '当前 ClawBox 仍直接运行在这个系统 Node.js 上，当前会话内不能自动卸载。' };
  }

  if (runtimeNode?.installed && !runtimeLooksBundled) {
    return { blocked: true, reason: 'runtime_not_isolated', detail: '当前运行时尚未证明与系统 Node.js 隔离；为避免误导，本轮禁用自动卸载。' };
  }

  if (systemManagedNode) {
    return { blocked: true, reason: 'system_managed', detail: runtimeLooksBundled ? '当前检测到系统级 Node.js；即使 ClawBox 可能有独立 runtime，本轮仍仅支持手动卸载。' : '当前检测到系统级 Node.js，且 ClawBox 运行时仍依赖或可能依赖系统 Node.js；本轮仅支持手动卸载。' };
  }

  return { blocked: false, reason: null, detail: '' };
}

function getWindowsNodeUninstallState(nodeInfo, runtimeNode, registryEntries) {
  const guard = getWindowsNodeUninstallGuard(nodeInfo, runtimeNode, registryEntries);
  const diagnostics = {
    nodePath: nodeInfo?.path || null,
    nodeVersion: nodeInfo?.version || null,
    nodeSource: nodeInfo?.source || null,
    runtimePath: runtimeNode?.path || null,
    runtimeVersion: runtimeNode?.version || null,
    runtimeSource: runtimeNode?.source || null,
    registryCount: registryEntries.length,
    registryDisplayName: registryEntries[0]?.displayName || ''
  };

  if (nodeInfo?.installed) {
    if (guard.reason === 'runtime_in_use') {
      return {
        installed: true,
        blocked: true,
        reason: 'runtime_in_use',
        status: 'runtime_in_use',
        detail: guard.detail,
        diagnostics
      };
    }

    if (guard.reason === 'runtime_not_isolated') {
      return {
        installed: true,
        blocked: true,
        reason: 'runtime_not_isolated',
        status: 'runtime_not_isolated',
        detail: guard.detail,
        diagnostics
      };
    }

    if (guard.reason === 'system_managed') {
      return {
        installed: true,
        blocked: true,
        reason: 'system_managed',
        status: 'system_managed',
        detail: guard.detail,
        diagnostics
      };
    }

    return {
      installed: true,
      blocked: false,
      reason: null,
      status: 'removable',
      detail: '当前检测到独立系统 Node.js，可尝试自动卸载。',
      diagnostics
    };
  }

  if (runtimeNode?.installed) {
    return {
      installed: false,
      blocked: true,
      reason: 'runtime_only',
      status: 'runtime_only',
      detail: `当前 ClawBox 使用独立运行时 ${runtimeNode.version || 'Node.js'}，未检测到可单独卸载的系统 Node.js。`,
      diagnostics
    };
  }

  return {
    installed: false,
    blocked: true,
    reason: 'absent',
    status: 'absent',
    detail: '未检测到可卸载的 Node.js。',
    diagnostics
  };
}

function tryExecCommand(command, options = {}) {
  try {
    execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      env: getExtendedShellEnv(),
      timeout: options.timeout || 60000,
      shell: options.shell
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      output: [error.stdout, error.stderr].filter(Boolean).join('\n').trim() || error.message
    };
  }
}

function isPreferredOpenClawPanelUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    const pathname = parsed.pathname || '/';
    if (/^\/chat\b/i.test(pathname) || /^\/session\b/i.test(pathname)) return false;
    if (parsed.searchParams.get('session')) return false;
    return pathname === '/' || pathname === '' || parsed.searchParams.has('token') || parsed.searchParams.has('auth');
  } catch {
    return false;
  }
}

function parseOpenclawDashboardUrlFromJson(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const queue = [payload];
  const fallbackUrls = [];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    for (const [key, value] of Object.entries(current)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        const isHttpUrl = /^https?:\/\/\S+/i.test(trimmed);
        const isDashboardKey = /dashboard/i.test(key);
        const looksLikePanelUrl = isHttpUrl && isPreferredOpenClawPanelUrl(trimmed);
        if (isDashboardKey && looksLikePanelUrl) return trimmed;
        if (looksLikePanelUrl) return trimmed;
        if (isHttpUrl) fallbackUrls.push(trimmed);
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return fallbackUrls.find(isPreferredOpenClawPanelUrl) || null;
}

function parseOpenclawDashboardUrlFromText(output) {
  if (!output) return null;
  const match = output.match(/Dashboard:\s+(https?:\/\/\S+)/i);
  if (match && isPreferredOpenClawPanelUrl(match[1])) return match[1];
  const urls = output.match(/https?:\/\/[^\s'"]+/ig) || [];
  const preferred = urls.find((url) => isPreferredOpenClawPanelUrl(url));
  return preferred || null;
}

function getOpenClawDashboardFallbackUrl() {
  const port = Number(process.env.OPENCLAW_DASHBOARD_PORT || process.env.OPENCLAW_PORT || 29135);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return `http://127.0.0.1:${port}`;
}

const quickChannelSessions = new Map();

const QUICK_CONFIG_STATUS = {
  IDLE: 'idle',
  PENDING_SCAN: 'pending_scan',
  SCANNED: 'scanned',
  AUTHORIZED: 'authorized',
  PROVISIONING: 'provisioning',
  CONFIGURED_PENDING_PAIRING: 'configured_pending_pairing',
  FAILED: 'failed'
};

function buildRequestBaseUrl(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function hydrateQuickConfigTemplate(value, channelKey, sessionId, callbackUrl) {
  return String(value || '')
    .trim()
    .replaceAll('{sessionId}', sessionId)
    .replaceAll('{channelKey}', channelKey)
    .replaceAll('{callbackUrl}', callbackUrl);
}

function getFeishuQuickConfigQrSeed(req, channelKey, sessionId) {
  const baseUrl = buildRequestBaseUrl(req);
  const callbackUrl = baseUrl
    ? `${baseUrl}/api/channels/${encodeURIComponent(channelKey)}/quick-config/${encodeURIComponent(sessionId)}/complete`
    : '';
  const rawContent = String(process.env.FEISHU_AUTOCONFIG_QR_CONTENT || '').trim();
  const rawImageUrl = String(process.env.FEISHU_AUTOCONFIG_QR_URL || '').trim();

  if (!rawContent && !rawImageUrl) {
    return {
      ready: false,
      blockers: [
        {
          code: 'missing_real_qr_payload',
          title: '缺少真实扫码内容',
          detail: '当前后端之前只返回占位 SVG，没有接入飞书真实扫码载荷。请提供 FEISHU_AUTOCONFIG_QR_CONTENT（扫码内容）或 FEISHU_AUTOCONFIG_QR_URL（二维码图片地址）。'
        },
        {
          code: 'missing_feishu_qr_bridge',
          title: '飞书扫码桥接未接通',
          detail: '真实二维码应来自飞书自动化链路或中间服务，而不是本地伪造 session 图。当前仅已打通真实载荷返回入口。'
        }
      ],
      qrCode: null
    };
  }

  const content = rawContent
    ? hydrateQuickConfigTemplate(rawContent, channelKey, sessionId, callbackUrl)
    : '';
  const imageUrl = rawImageUrl
    ? hydrateQuickConfigTemplate(rawImageUrl, channelKey, sessionId, callbackUrl)
    : '';

  return {
    ready: true,
    qrCode: {
      content,
      imageUrl,
      source: rawContent ? 'env_content' : 'env_image_url',
      callbackUrl
    }
  };
}

function getFeishuProvisionResultExample() {
  return {
    appId: 'cli_xxxxxxxxxxxx',
    appSecret: 'xxxxxxxxxxxxxxxx',
    automation: {
      appCreated: true,
      botEnabled: true,
      scopesConfigured: true,
      eventSubscriptionConfigured: true,
      publishReady: true,
      provider: 'bridge',
      lastProvisionedAt: new Date().toISOString()
    }
  };
}

function getFeishuAutoProvisionSeed() {
  const rawProvisionResult = String(process.env.FEISHU_AUTOCONFIG_PROVISION_RESULT || '').trim();

  if (rawProvisionResult) {
    try {
      const parsed = JSON.parse(rawProvisionResult);
      const appId = String(parsed.appId || '').trim();
      const appSecret = String(parsed.appSecret || '').trim();

      if (appId && appSecret) {
        return {
          ready: true,
          appId,
          appSecret,
          automation: {
            appCreated: parsed.automation?.appCreated !== false,
            botEnabled: parsed.automation?.botEnabled !== false,
            scopesConfigured: parsed.automation?.scopesConfigured !== false,
            eventSubscriptionConfigured: parsed.automation?.eventSubscriptionConfigured !== false,
            publishReady: parsed.automation?.publishReady !== false,
            provider: parsed.automation?.provider || 'bridge',
            lastProvisionedAt: parsed.automation?.lastProvisionedAt || new Date().toISOString()
          }
        };
      }
    } catch (error) {
      return {
        ready: false,
        blockers: [
          {
            code: 'invalid_autoprovision_result',
            title: '自动配置结果格式错误',
            detail: `FEISHU_AUTOCONFIG_PROVISION_RESULT 不是可用 JSON，或缺少 appId / appSecret。期望格式示例：${JSON.stringify(getFeishuProvisionResultExample())}`
          },
          {
            code: 'autoprovision_result_parse_failed',
            title: '桥接结果未落成可消费结构',
            detail: `解析自动配置结果失败：${error.message}`
          }
        ]
      };
    }
  }

  const appId = String(process.env.FEISHU_AUTOCONFIG_APP_ID || '').trim();
  const appSecret = String(process.env.FEISHU_AUTOCONFIG_APP_SECRET || '').trim();

  if (!appId || !appSecret) {
    return {
      ready: false,
      blockers: [
        {
          code: 'missing_feishu_automation_bridge',
          title: '飞书自动化桥接未接通',
          detail: '当前已落好状态流、自动写入入口和待配对状态，但真实飞书应用创建、权限配置与事件订阅流程还未真正接通。'
        },
        {
          code: 'missing_autoprovision_credentials',
          title: '缺少自动配置产物',
          detail: `需要桥接流程最终返回 appId / appSecret（推荐用 FEISHU_AUTOCONFIG_PROVISION_RESULT 注入，或 POST 到 /api/channels/feishu/quick-config/{sessionId}/provision-result，示例：${JSON.stringify(getFeishuProvisionResultExample())}），系统才能自动写入 OpenClaw 并进入已配置，待配对。`
        }
      ]
    };
  }

  return {
    ready: true,
    appId,
    appSecret,
    automation: {
      appCreated: true,
      botEnabled: true,
      scopesConfigured: true,
      eventSubscriptionConfigured: true,
      publishReady: true,
      provider: 'env',
      lastProvisionedAt: new Date().toISOString()
    }
  };
}

function createQuickConfigSession(req, channelKey) {
  const sessionId = crypto.randomUUID();
  const qrSeed = getFeishuQuickConfigQrSeed(req, channelKey, sessionId);

  return {
    sessionId,
    channelKey,
    status: QUICK_CONFIG_STATUS.PENDING_SCAN,
    supported: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    pollIntervalMs: 2500,
    nextAction: 'scan',
    message: qrSeed.ready
      ? '请使用飞书扫码，开始自动配置应用与机器人能力。'
      : '当前还没有拿到真实飞书扫码内容，不能展示假二维码。',
    blockerTitle: qrSeed.ready ? '自动化步骤' : '真实缺口',
    blockers: qrSeed.ready ? [] : qrSeed.blockers,
    qrCode: {
      content: qrSeed.qrCode?.content || '',
      imageUrl: qrSeed.qrCode?.imageUrl || '',
      source: qrSeed.qrCode?.source || '',
      callbackUrl: qrSeed.qrCode?.callbackUrl || ''
    },
    automationPlan: [
      '创建或接管飞书企业应用',
      '启用 Bot 能力',
      '配置 OpenClaw 所需权限',
      '配置事件订阅与长连接事件',
      '写入 App ID / App Secret',
      '进入已配置，待配对'
    ],
    result: null
  };
}

function updateQuickConfigSessionState(session, status, patch = {}) {
  session.status = status;
  Object.assign(session, patch);
  return session;
}

function applyFeishuProvisionResult(channelKey, provisionSeed) {
  return upsertChannelConfig(channelKey, {
    appId: provisionSeed.appId,
    appSecret: provisionSeed.appSecret,
    streaming: true,
    accessMode: 'quick',
    status: 'configured_pending_pairing',
    pairingStatus: 'pending',
    automation: provisionSeed.automation
  });
}

function normalizeFeishuProvisionPayload(payload = {}) {
  const appId = String(payload.appId || '').trim();
  const appSecret = String(payload.appSecret || '').trim();

  if (!appId || !appSecret) {
    return {
      ok: false,
      error: '缺少 appId 或 appSecret'
    };
  }

  return {
    ok: true,
    provisionSeed: {
      appId,
      appSecret,
      automation: {
        appCreated: payload.automation?.appCreated !== false,
        botEnabled: payload.automation?.botEnabled !== false,
        scopesConfigured: payload.automation?.scopesConfigured !== false,
        eventSubscriptionConfigured: payload.automation?.eventSubscriptionConfigured !== false,
        publishReady: payload.automation?.publishReady !== false,
        provider: payload.automation?.provider || 'callback',
        lastProvisionedAt: payload.automation?.lastProvisionedAt || new Date().toISOString()
      }
    }
  };
}

function serializeQuickConfigSession(session, includeQr = false) {
  if (!session) return null;

  return {
    sessionId: session.sessionId,
    channelKey: session.channelKey,
    status: session.status,
    supported: !!session.supported,
    expiresAt: session.expiresAt,
    message: session.message,
    blockerTitle: session.blockerTitle,
    blockers: Array.isArray(session.blockers) ? session.blockers : [],
    pollIntervalMs: session.pollIntervalMs,
    nextAction: session.nextAction,
    automationPlan: Array.isArray(session.automationPlan) ? session.automationPlan : [],
    result: session.result || null,
    qrCode: includeQr ? {
      content: session.qrCode.content || '',
      imageUrl: session.qrCode.imageUrl || '',
      source: session.qrCode.source || '',
      callbackUrl: session.qrCode.callbackUrl || ''
    } : undefined
  };
}

function startServer(port = 3456, devMode = false) {
  const app = express();
  cachedRootStatus = isRoot();
  cachedRootStatusAt = Date.now();
  const initialClawHubProbe = getCachedClawHubProbe({ force: true });
  const initialClawHubAvailable = !!initialClawHubProbe.available;
  const clawhubBootstrap = {
    status: initialClawHubAvailable ? 'ready' : 'idle',
    detail: initialClawHubAvailable ? 'ClawHub CLI 已可用' : '等待自动准备 ClawHub CLI',
    error: '',
    diagnostics: initialClawHubProbe.diagnostics || '',
    startedAt: null,
    finishedAt: null,
    installed: false
  };

  const serializeClawHubBootstrap = (options = {}) => {
    const probe = options.forceProbe ? getCachedClawHubProbe() : cachedClawHubProbe;
    const available = probe ? !!probe.available : clawhubBootstrap.status === 'ready';
    return {
      status: available ? 'ready' : clawhubBootstrap.status,
      detail: available ? 'ClawHub CLI 已就绪' : clawhubBootstrap.detail,
      error: available ? '' : clawhubBootstrap.error,
      diagnostics: probe?.diagnostics || clawhubBootstrap.diagnostics || '',
      startedAt: clawhubBootstrap.startedAt,
      finishedAt: clawhubBootstrap.finishedAt,
      installed: available,
      path: available && probe?.command && probe.command !== 'clawhub' ? probe.command : null,
      autoInstalled: !!clawhubBootstrap.installed
    };
  };

  const ensureClawHubBootstrap = () => {
    const probe = getCachedClawHubProbe();
    if (probe.available) {
      clawhubBootstrap.status = 'ready';
      clawhubBootstrap.detail = 'ClawHub CLI 已可用';
      clawhubBootstrap.error = '';
      clawhubBootstrap.diagnostics = probe.diagnostics || '';
      clawhubBootstrap.finishedAt = Date.now();
      return;
    }

    if (clawhubBootstrap.status === 'running') {
      return;
    }

    clawhubBootstrap.status = 'running';
    clawhubBootstrap.detail = '首次启动，正在自动准备 ClawHub CLI...';
    clawhubBootstrap.error = '';
    clawhubBootstrap.startedAt = Date.now();

    setImmediate(() => {
      try {
        const result = installClawHubCLI();
        clawhubBootstrap.finishedAt = Date.now();
        if (result.success) {
          clawhubBootstrap.status = 'ready';
          clawhubBootstrap.installed = !!result.installed;
          clawhubBootstrap.detail = result.installed ? '首次启动已自动安装 ClawHub CLI' : 'ClawHub CLI 已可用';
          clawhubBootstrap.error = '';
          clawhubBootstrap.diagnostics = result.diagnostics || '';
          cachedClawHubProbe = null;
          cachedClawHubProbeAt = 0;
        } else {
          clawhubBootstrap.status = 'error';
          clawhubBootstrap.installed = false;
          clawhubBootstrap.detail = 'ClawHub CLI 自动准备失败';
          clawhubBootstrap.error = result.error || '未知错误';
          clawhubBootstrap.diagnostics = result.diagnostics || '';
          cachedClawHubProbe = null;
          cachedClawHubProbeAt = 0;
        }
      } catch (error) {
        clawhubBootstrap.status = 'error';
        clawhubBootstrap.detail = 'ClawHub CLI 自动准备失败';
        clawhubBootstrap.error = error.message;
        clawhubBootstrap.diagnostics = '';
        clawhubBootstrap.finishedAt = Date.now();
        cachedClawHubProbe = null;
        cachedClawHubProbeAt = 0;
      }
    });
  };

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ========== API 路由 ==========

  // 系统状态
  app.get('/api/status-lite', (req, res) => {
    const timer = createRequestTimer('/api/status-lite', req);
    try {
      const lifecycle = getFastLiteOpenClawLifecycle();
      if (
        lifecycle?.installed &&
        lifecycle?.configReady &&
        !hasFreshOpenClawStateCache() &&
        (
          lifecycle.stage === 'gateway_incomplete' ||
          lifecycle.stage === 'gateway_starting' ||
          lifecycle.sticky === true
        )
      ) {
        scheduleOpenClawStateWarmup().catch(() => {});
      }
      const payload = {
        os: getOS(),
        nodeVersion: process.version,
        nodeOk: checkNodeVersion(),
        openclawInstalled: lifecycle.installed,
        openclawVersion: lifecycle.version,
        openclawPath: lifecycle.path,
        gatewayRunning: lifecycle.gatewayRunning,
        openclawLifecycle: lifecycle,
        isRoot: getCachedRootStatus(),
        clawhubBootstrap: serializeClawHubBootstrap()
      };
      timer.log('ok', { installed: payload.openclawInstalled, stage: lifecycle.stage || 'unknown', lite: true });
      res.json(payload);
    } catch (err) {
      timer.log('error', { error: err.message, lite: true });
      throw err;
    }
  });

  app.get('/api/status', (req, res) => {
    const timer = createRequestTimer('/api/status', req);
    try {
      if (cachedStatusPayload && (Date.now() - cachedStatusAt) < STATUS_CACHE_TTL_MS) {
        timer.log('ok', { cacheHit: true, stage: cachedStatusPayload.openclawLifecycle?.stage || 'unknown' });
        return res.json(cachedStatusPayload);
      }

      const inspectCacheHit = hasFreshOpenClawStateCache();
      const finishInspect = timer.step('inspectOpenClawState');
      const openclawState = getCachedOpenClawState();
      finishInspect({
        installed: !!openclawState?.installed,
        configReady: !!openclawState?.configReady,
        gatewayRunning: !!openclawState?.gatewayRunning,
        cacheHit: inspectCacheHit
      });

      const finishLifecycle = timer.step('buildOpenClawLifecycle');
      const lifecycle = buildObservedOpenClawLifecycle(openclawState);
      finishLifecycle({ stage: lifecycle.stage || 'unknown', sticky: !!lifecycle.sticky });

      const payload = {
        os: getOS(),
        nodeVersion: process.version,
        nodeOk: checkNodeVersion(),
        openclawInstalled: lifecycle.installed,
        openclawVersion: lifecycle.version,
        openclawPath: lifecycle.path,
        gatewayRunning: lifecycle.gatewayRunning,
        openclawLifecycle: lifecycle,
        isRoot: getCachedRootStatus(),
        clawhubBootstrap: serializeClawHubBootstrap()
      };
      cachedStatusPayload = payload;
      cachedStatusAt = Date.now();
      cachedLiteLifecycle = lifecycle;
      cachedLiteLifecycleAt = cachedStatusAt;
      timer.log('ok', { installed: payload.openclawInstalled, stage: lifecycle.stage || 'unknown', cacheHit: false });
      res.json(payload);
    } catch (err) {
      timer.log('error', { error: err.message });
      throw err;
    }
  });

  // 获取配置摘要
  app.get('/api/config', (req, res) => {
    res.json(getConfigSummary());
  });

  // 获取模型列表
  app.get('/api/models', (req, res) => {
    res.json(getModelConfig());
  });

  // 验证 API Key
  async function verifyApiKey(provider, model, apiKey, baseUrl) {
    const http = require('http');
    const https = require('https');

    return new Promise((resolve) => {
      let reqUrl, reqBody, reqHeaders;

      if (provider === 'anthropic' || provider === 'minimax') {
        const cleanBaseUrl = (String(baseUrl || '').trim().replace(/\/+$/, '')) || getDefaultBaseUrl(provider) || (provider === 'minimax'
          ? 'https://api.minimaxi.com/anthropic'
          : 'https://api.anthropic.com');
        reqUrl = cleanBaseUrl + '/v1/messages';
        reqBody = JSON.stringify({
          model: model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        });
        reqHeaders = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        };
      } else {
        // OpenAI 兼容接口
        const cleanBaseUrl = (String(baseUrl || '').trim().replace(/\/+$/, '')) || getDefaultBaseUrl(provider);
        if (!cleanBaseUrl) {
          resolve({ valid: false, error: `未找到 ${provider} 的默认 baseUrl` });
          return;
        }
        reqUrl = cleanBaseUrl + '/chat/completions';
        reqBody = JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1
        });
        reqHeaders = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        };
      }

      const parsed = new URL(reqUrl);
      const transport = parsed.protocol === 'https:' ? https : http;

      const req = transport.request(reqUrl, {
        method: 'POST',
        headers: reqHeaders,
        timeout: 10000
      }, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          if (resp.statusCode === 200 || resp.statusCode === 201) {
            resolve({ valid: true });
          } else if (resp.statusCode === 401 || resp.statusCode === 403) {
            resolve({ valid: false, error: 'API Key 无效或已过期' });
          } else {
            let detail = '';
            try {
              const parsed = JSON.parse(data);
              detail = parsed.error?.message || parsed.message || data.slice(0, 200);
            } catch {
              detail = data.slice(0, 200);
            }
            resolve({ valid: false, error: `服务器返回 ${resp.statusCode}: ${detail}` });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ valid: false, error: `网络错误: ${err.message}` });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ valid: false, error: '请求超时（10秒），请检查 baseUrl 是否正确' });
      });

      req.write(reqBody);
      req.end();
    });
  }

  app.post('/api/models/verify', async (req, res) => {
    const timer = createRequestTimer('/api/models/verify', req);
    try {
      const { provider, model, apiKey, baseUrl } = req.body;
      if (!provider || !model || !apiKey) {
        timer.log('bad_request', { provider: provider || null, model: model || null });
        return res.status(400).json({ success: false, error: '缺少必要参数' });
      }
      const finishVerify = timer.step('verifyApiKey', { provider, model });
      const result = await verifyApiKey(provider, model, apiKey, baseUrl);
      finishVerify({ valid: !!result.valid, hasError: !!result.error });
      timer.log('ok', { provider, model, valid: !!result.valid });
      res.json({ success: result.valid, error: result.error || null });
    } catch (err) {
      timer.log('error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 添加模型
  app.post('/api/models/add', async (req, res) => {
    const timer = createRequestTimer('/api/models/add', req);
    try {
      const { provider, model, apiKey, baseUrl, skipVerify } = req.body;
      if (!provider || !model || !apiKey) {
        timer.log('bad_request', { provider: provider || null, model: model || null });
        return res.status(400).json({ success: false, error: '缺少必要参数' });
      }
      if (!skipVerify) {
        const finishVerify = timer.step('verifyApiKey', { provider, model });
        const verify = await verifyApiKey(provider, model, apiKey, baseUrl);
        finishVerify({ valid: !!verify.valid, hasError: !!verify.error });
        if (!verify.valid) {
          timer.log('verify_failed', { provider, model });
          return res.status(400).json({ success: false, error: 'API Key 验证失败: ' + (verify.error || '未知错误') });
        }
      } else {
        timer.log('skip_verify', { provider, model });
      }
      const result = updateModelConfig({ provider, model, apiKey, baseUrl });
      timer.log('ok', { provider, model, skipVerify: !!skipVerify });
      res.json({ success: true, config: result });
    } catch (err) {
      timer.log('error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 切换模型
  app.post('/api/models/switch', (req, res) => {
    try {
      const { provider, modelId } = req.body;
      // 支持完整模型ID格式 (provider/modelId) — 优先用 switchModelById
      if (modelId && modelId.includes('/')) {
        const result = switchModelById(modelId);
        return res.json({ success: true, config: result });
      }
      const result = switchModel(provider, modelId);
      res.json({ success: true, config: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 删除模型
  app.delete('/api/models/:provider', (req, res) => {
    try {
      const result = deleteModel(req.params.provider);
      res.json({ success: true, config: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 获取已安装的模型（从 openclaw.json 读取）
  app.get('/api/models/installed', (req, res) => {
    try {
      const result = getInstalledModels();
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 兼容旧接口
  app.get('/api/config/model', (req, res) => {
    res.json(getModelConfig());
  });

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

  // 获取消息通道目录
  app.get('/api/channels/catalog', (req, res) => {
    res.json({ success: true, catalog: getChannelCatalog() });
  });

  // 获取消息通道列表
  app.get('/api/channels', (req, res) => {
    res.json({ success: true, ...getChannelsState() });
  });

  // 获取单个消息通道配置
  app.get('/api/channels/:channelKey', (req, res) => {
    try {
      const key = req.params.channelKey;
      const channel = getChannelConfig(key);
      if (!channel) {
        return res.status(404).json({ success: false, error: '消息通道不存在' });
      }
      res.json({ success: true, channel });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 手动配置消息通道
  app.post('/api/channels/:channelKey/manual-config', (req, res) => {
    try {
      const key = req.params.channelKey;
      const normalized = normalizeManualChannelPayload(key, req.body || {});
      if (!normalized.ok) {
        return res.status(400).json({ success: false, error: normalized.errors.join('，') });
      }
      const current = getChannelConfig(key);
      const schema = current?.schema?.credentials || getChannelCatalog().find((item) => item.key === key)?.schema?.credentials || [];
      const missingFields = schema
        .filter((field) => field.required)
        .filter((field) => {
          const nextValue = normalized.payload.credentials[field.key] !== undefined
            ? normalized.payload.credentials[field.key]
            : current?.credentials?.[field.key];
          return !String(nextValue || '').trim();
        })
        .map((field) => field.label);
      if (missingFields.length) {
        return res.status(400).json({ success: false, error: `请填写${missingFields.join('、')}` });
      }
      const credentialsChanged = key === 'feishu'
        ? schema.some((field) => {
          const explicitValue = normalized.payload.credentials[field.key];
          if (explicitValue === undefined) return false;
          return String(explicitValue || '').trim() !== String(current?.credentials?.[field.key] || '').trim();
        })
        : false;
      const channel = upsertChannelConfig(key, {
        ...normalized.payload,
        enabled: true,
        pairingStatus: key === 'feishu'
          ? (credentialsChanged ? 'pending' : (current?.pairingStatus === 'paired' ? 'paired' : 'pending'))
          : 'unpaired',
        validation: {
          status: 'pending',
          message: ''
        },
        lastError: ''
      });
      res.json({ success: true, channel });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/channels/:channelKey/enabled', (req, res) => {
    try {
      const key = req.params.channelKey;
      const enabled = !!req.body?.enabled;
      const resolved = resolveChannelEnableToggleContext(key, enabled);
      if (!resolved.ok) {
        return res.status(resolved.statusCode).json({ success: false, error: resolved.error });
      }
      const current = resolved.current;

      const channel = upsertChannelConfig(key, {
        enabled,
        status: key === 'feishu'
          ? (enabled ? (current.pairingStatus === 'paired' ? 'connected' : 'configured_pending_pairing') : 'configured')
          : (enabled ? 'enabled' : 'configured'),
        pairingStatus: key === 'feishu'
          ? (enabled ? (current.pairingStatus === 'paired' ? 'paired' : 'pending') : (current.pairingStatus || 'unpaired'))
          : 'unpaired'
      });
      res.json({ success: true, channel });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 删除消息通道配置
  app.delete('/api/channels/:channelKey', (req, res) => {
    try {
      const key = req.params.channelKey;
      const result = removeChannelConfig(key);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/channels/:channelKey/pairing-status', (req, res) => {
    try {
      const key = req.params.channelKey;
      const { paired, pairingCode } = req.body;
      const channel = upsertChannelConfig(key, {
        pairingStatus: paired ? 'paired' : 'pending',
        pairingCode,
        status: paired ? 'connected' : 'configured_pending_pairing'
      });
      res.json({ success: true, channel });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 开始快捷配置消息通道
  app.post('/api/channels/:channelKey/quick-config/start', (req, res) => {
    try {
      const channelKey = String(req.params.channelKey || '').trim();
      const channelMeta = getChannelCatalog().find((item) => item.key === channelKey);
      if (!channelMeta) {
        return res.status(404).json({ success: false, error: '消息通道不存在' });
      }

      const session = createQuickConfigSession(req, channelKey);
      if (!channelMeta.quickConfigEnabled) {
        updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.FAILED, {
          supported: false,
          nextAction: 'manual_fallback',
          message: '当前版本仅开放手动配置，快捷配置暂未开放。',
          blockers: [{
            code: 'quick_config_disabled',
            title: '快捷配置暂未开放',
            detail: '当前版本优先交付手动添加闭环，请使用手动配置。'
          }]
        });
      } else if (!session.qrCode.content && !session.qrCode.imageUrl) {
        updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.FAILED, {
          nextAction: 'integrate_real_qr',
          message: '当前缺少真实飞书二维码来源，已停止展示占位二维码。',
          blockerTitle: '真实缺口',
          blockers: session.blockers
        });
      }

      quickChannelSessions.set(session.sessionId, session);
      res.json({ success: true, session: serializeQuickConfigSession(session, true) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 查询快捷配置状态
  app.get('/api/channels/:channelKey/quick-config/:sessionId', (req, res) => {
    try {
      const { channelKey, sessionId } = req.params;
      const session = quickChannelSessions.get(sessionId);
      if (!session || session.channelKey !== channelKey) {
        return res.status(404).json({ success: false, error: '快捷配置会话不存在或已失效' });
      }

      if (Date.now() > new Date(session.expiresAt).getTime()) {
        updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.FAILED, {
          message: '快捷配置会话已过期，请重新开始。',
          nextAction: 'restart',
          blockers: [{
            code: 'session_expired',
            title: '会话已过期',
            detail: '请重新发起快捷配置，再次扫码。'
          }]
        });
      }

      res.json({ success: true, session: serializeQuickConfigSession(session, false) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 外部自动化桥接回写快捷配置结果
  app.post('/api/channels/:channelKey/quick-config/:sessionId/provision-result', (req, res) => {
    try {
      const { channelKey, sessionId } = req.params;
      const session = quickChannelSessions.get(sessionId);
      if (!session || session.channelKey !== channelKey) {
        return res.status(404).json({ success: false, error: '快捷配置会话不存在或已失效' });
      }

      const normalized = normalizeFeishuProvisionPayload(req.body || {});
      if (!normalized.ok) {
        return res.status(400).json({
          success: false,
          error: normalized.error,
          expected: getFeishuProvisionResultExample()
        });
      }

      const channel = applyFeishuProvisionResult(channelKey, normalized.provisionSeed);
      updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.CONFIGURED_PENDING_PAIRING, {
        message: '飞书应用配置已由外部桥接写回，当前状态为已配置，待配对。',
        nextAction: 'pairing',
        blockerTitle: '下一步',
        blockers: [
          {
            code: 'pairing_manual_step',
            title: '继续完成配对',
            detail: '去飞书里给机器人发送消息，拿到 pairing code 后执行 openclaw pairing approve feishu CODE。'
          }
        ],
        result: {
          channel,
          source: 'callback'
        }
      });

      return res.json({ success: true, session: serializeQuickConfigSession(session, false), channel });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 确认快捷配置结果
  app.post('/api/channels/:channelKey/quick-config/:sessionId/complete', (req, res) => {
    try {
      const { channelKey, sessionId } = req.params;
      const session = quickChannelSessions.get(sessionId);
      if (!session || session.channelKey !== channelKey) {
        return res.status(404).json({ success: false, error: '快捷配置会话不存在或已失效' });
      }
      if (!session.qrCode?.content && !session.qrCode?.imageUrl) {
        return res.status(409).json({
          success: false,
          error: '当前尚未接入真实二维码来源，无法继续快捷配置。',
          session: serializeQuickConfigSession(session, false)
        });
      }
      if (session.status === QUICK_CONFIG_STATUS.PENDING_SCAN) {
        updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.SCANNED, {
          message: '已记录扫码，请在飞书完成授权确认。',
          nextAction: 'confirm_authorization',
          blockers: []
        });
        return res.json({ success: true, session: serializeQuickConfigSession(session, false) });
      }

      if (session.status === QUICK_CONFIG_STATUS.SCANNED) {
        updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.AUTHORIZED, {
          message: '授权状态已确认，准备自动配置飞书应用。',
          nextAction: 'provision'
        });
        return res.json({ success: true, session: serializeQuickConfigSession(session, false) });
      }

      if (session.status === QUICK_CONFIG_STATUS.AUTHORIZED || session.status === QUICK_CONFIG_STATUS.PROVISIONING) {
        updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.PROVISIONING, {
          message: '正在自动写入飞书应用配置与 OpenClaw 凭证...',
          nextAction: 'wait'
        });

        const provisionSeed = getFeishuAutoProvisionSeed();
        if (!provisionSeed.ready) {
          updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.FAILED, {
            message: '自动配置链路尚未完全接通，当前无法生成真实飞书凭证。',
            nextAction: 'manual_or_integrate',
            blockerTitle: '待补齐项',
            blockers: provisionSeed.blockers
          });
          return res.status(501).json({
            success: false,
            error: session.message,
            session: serializeQuickConfigSession(session, false)
          });
        }

        const channel = applyFeishuProvisionResult(channelKey, provisionSeed);
        updateQuickConfigSessionState(session, QUICK_CONFIG_STATUS.CONFIGURED_PENDING_PAIRING, {
          message: '飞书应用配置已写入，当前状态为已配置，待配对。',
          nextAction: 'pairing',
          blockerTitle: '下一步',
          blockers: [
            {
              code: 'pairing_manual_step',
              title: '继续完成配对',
              detail: '去飞书里给机器人发送消息，拿到 pairing code 后执行 openclaw pairing approve feishu CODE。'
            }
          ],
          result: {
            channel
          }
        });
        return res.json({ success: true, session: serializeQuickConfigSession(session, false), channel });
      }

      if (session.status === QUICK_CONFIG_STATUS.CONFIGURED_PENDING_PAIRING) {
        return res.json({ success: true, session: serializeQuickConfigSession(session, false) });
      }

      return res.status(400).json({
        success: false,
        error: '当前会话状态无法继续推进，请重新开始快捷配置。',
        session: serializeQuickConfigSession(session, false)
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 安装 OpenClaw（SSE 流式返回进度）
  app.post('/api/install', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Charset', 'utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send({ type: 'start', message: '开始安装...' });

    const result = await installOpenClaw((progress) => {
      send({ type: 'progress', ...progress });
    });

    invalidateStatusCaches({ clearSticky: !result?.state?.installed, clearGatewayRecovery: true });
    send({ type: 'done', success: result.success, partial: !!result.partial, state: result.state || null });
    res.end();
  });

  // 更新 OpenClaw（SSE）
  app.post('/api/update', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Charset', 'utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send({ type: 'start', message: '开始更新...' });

    const result = await updateOpenClaw((progress) => {
      send({ type: 'progress', ...progress });
    });

    syncStatusCachesAfterOpenClawUpdate(result);
    send({
      type: 'done',
      success: result.success,
      skipped: result?.skipped || '',
      latestVersion: result?.latestVersion || '',
      state: result?.state || null
    });
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
      invalidateStatusCaches({ clearSticky: true, clearGatewayRecovery: true });
      send({ type: 'done', success: result.success, steps: result.steps });
    } catch (err) {
      invalidateStatusCaches({ clearSticky: true, clearGatewayRecovery: true });
      send({ type: 'done', success: false, error: err.message });
    }

    if (!res.writableEnded) {
      res.end();
    }
  });

  // 获取已安装的 Skills 列表
  app.get('/api/skills/installed', (req, res) => {
    try {
      const skillsDir = path.join(os.homedir(), '.openclaw', 'workspace', 'skills');
      if (!fs.existsSync(skillsDir)) {
        return res.json({ success: true, skills: [] });
      }

      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      const skills = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(skillsDir, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        let name = entry.name;
        let description = '';

        // 尝试从 SKILL.md 解析名称和描述
        if (fs.existsSync(skillMdPath)) {
          try {
            const content = fs.readFileSync(skillMdPath, 'utf8');

            // 尝试解析 YAML frontmatter 格式
            const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (fmMatch) {
              const fm = fmMatch[1];
              const nameMatch = fm.match(/^name:\s*(.+)$/m);
              const descMatch = fm.match(/^description:\s*(.+)$/m);
              if (nameMatch) name = nameMatch[1].trim();
              if (descMatch) description = descMatch[1].trim().slice(0, 200);
            }

            // 如果 frontmatter 没有名称，尝试提取 # 标题
            if (name === entry.name) {
              const titleMatch = content.match(/^#\s+(.+)$/m);
              if (titleMatch) name = titleMatch[1].trim();
            }

            // 如果还是没有描述，提取第一个非标题段落
            if (!description) {
              const lines = content.split('\n');
              let descLines = [];
              let foundTitle = false;
              for (const line of lines) {
                if ((line.startsWith('# ') || line.startsWith('---')) && !foundTitle) {
                  foundTitle = true;
                  continue;
                }
                if (foundTitle && line.trim() && !line.startsWith('#') && !line.startsWith('---')) {
                  descLines.push(line.trim());
                  if (descLines.length >= 2) break;
                }
              }
              description = descLines.join(' ').slice(0, 200);
            }
          } catch {}
        }

        skills.push({
          slug: entry.name,
          name,
          description,
          path: skillDir
        });
      }

      res.json({ success: true, skills });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 卸载 Skill
  app.post('/api/skills/uninstall', (req, res) => {
    try {
      const { slug } = req.body;
      if (!slug) {
        return res.status(400).json({ success: false, error: '缺少 skill slug' });
      }
      // 安全检查：防止路径遍历
      if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
        return res.status(400).json({ success: false, error: '无效的 skill 名称' });
      }

      const skillDir = path.join(os.homedir(), '.openclaw', 'workspace', 'skills', slug);
      if (!fs.existsSync(skillDir)) {
        return res.json({ success: false, error: 'Skill 不存在' });
      }

      fs.rmSync(skillDir, { recursive: true, force: true });
      res.json({ success: true, message: `${slug} 已卸载` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 检查 ClawHub 是否可用
  app.get('/api/skills/status', (req, res) => {
    const timer = createRequestTimer('/api/skills/status', req);
    try {
      const finishProbe = timer.step('probeClawHubAvailability');
      const probe = getCachedClawHubProbe();
      finishProbe({ available: !!probe.available, command: probe.command || null });
      timer.log('ok', { available: !!probe.available });
      res.json({
        available: !!probe.available,
        command: probe.command,
        diagnostics: probe.diagnostics,
        whereOutput: probe.whereOutput || '',
        bootstrap: serializeClawHubBootstrap()
      });
    } catch (err) {
      timer.log('error', { error: err.message });
      throw err;
    }
  });

  // 安装 ClawHub CLI
  app.post('/api/skills/setup', (req, res) => {
    const result = installClawHubCLI();
    if (result.success) {
      clawhubBootstrap.status = 'ready';
      clawhubBootstrap.detail = result.installed ? 'ClawHub CLI 已安装完成' : 'ClawHub CLI 已可用';
      clawhubBootstrap.error = '';
      clawhubBootstrap.diagnostics = result.diagnostics || '';
      clawhubBootstrap.installed = !!result.installed;
      clawhubBootstrap.finishedAt = Date.now();
    } else {
      clawhubBootstrap.status = 'error';
      clawhubBootstrap.detail = 'ClawHub CLI 安装失败';
      clawhubBootstrap.error = result.error || '未知错误';
      clawhubBootstrap.diagnostics = result.diagnostics || '';
      clawhubBootstrap.finishedAt = Date.now();
    }
    res.json(result);
  });

  // 搜索 Skills（带 10 秒缓存）
  const skillCache = new Map();
  app.get('/api/skills/search', (req, res) => {
    const timer = createRequestTimer('/api/skills/search', req);
    const query = req.query.q;
    if (!query) {
      timer.log('bad_request');
      return res.status(400).json({ success: false, error: '缺少搜索关键词' });
    }
    // 检查缓存
    const cached = skillCache.get(query);
    if (cached && Date.now() - cached.time < 10000) {
      timer.log('ok', { query, cacheHit: true, resultCount: Array.isArray(cached.data?.skills) ? cached.data.skills.length : null });
      return res.json(cached.data);
    }
    const finishSearch = timer.step('searchClawHubSkills', { query });
    const result = searchClawHubSkills(query);
    finishSearch({ success: !!result.success, hasError: !!result.error, resultCount: Array.isArray(result.skills) ? result.skills.length : null });
    // 检测限流错误，返回友好提示
    if (!result.success && result.error && result.error.includes('Rate limit')) {
      timer.log('rate_limited', { query });
      return res.json({ success: false, error: '搜索太频繁，请稍后再试（每分钟限30次）' });
    }
    // 只缓存成功的结果
    if (result.success) {
      skillCache.set(query, { data: result, time: Date.now() });
    }
    timer.log('ok', { query, cacheHit: false, success: !!result.success });
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
    const timer = createRequestTimer('/api/tools/status', req);
    try {
      if (cachedToolsStatusPayload && (Date.now() - cachedToolsStatusAt) < TOOLS_STATUS_CACHE_TTL_MS) {
        timer.log('ok', { cacheHit: true, openclawInstalled: !!cachedToolsStatusPayload.openclaw?.installed });
        return res.json(cachedToolsStatusPayload);
      }

      const result = {};

      const finishNode = timer.step('getNodeInstallationInfo');
      const nodeInfo = getNodeInstallationInfo({ allowProcessFallback: false });
      finishNode({ installed: !!nodeInfo.installed, path: nodeInfo.path || null });

      const finishRuntime = timer.step('getRuntimeNodeInfo');
      const runtimeNode = getRuntimeNodeInfo();
      finishRuntime({ installed: !!runtimeNode.installed, path: runtimeNode.path || null });

      const finishRegistry = timer.step('getWindowsNodeRegistryEntries');
      const windowsNodeRegistryEntries = os.platform() === 'win32' ? getWindowsNodeRegistryEntries() : [];
      finishRegistry({ count: windowsNodeRegistryEntries.length });
      const nodeState = os.platform() === 'win32'
        ? getWindowsNodeUninstallState(nodeInfo, runtimeNode, windowsNodeRegistryEntries)
        : {
            installed: !!nodeInfo.installed,
            blocked: !nodeInfo.installed,
            reason: nodeInfo.installed ? null : 'absent',
            status: nodeInfo.installed ? 'removable' : 'absent',
            detail: nodeInfo.installed ? '' : '未检测到可卸载的 Node.js。',
            diagnostics: {}
          };
      result.node = {
        installed: !!nodeInfo.installed,
        version: nodeInfo.version || null,
        path: nodeInfo.path || null,
        source: nodeInfo.source || null,
        via: nodeInfo.via || null,
        uninstallBlocked: nodeState.blocked,
        uninstallBlockReason: nodeState.reason,
        uninstallStatus: nodeState.status,
        uninstallHint: nodeState.detail,
        runtimeInUse: nodeState.reason === 'runtime_in_use',
        runtimeIsolated: nodeState.reason === 'runtime_only',
        runtimeNotIsolated: nodeState.reason === 'runtime_not_isolated',
        systemManaged: nodeState.reason === 'system_managed',
        diagnostics: nodeState.diagnostics
      };
      result.runtimeNode = runtimeNode.installed
        ? { installed: true, version: runtimeNode.version, path: runtimeNode.path, source: runtimeNode.source }
        : { installed: false };

      const finishClawHub = timer.step('probeClawHubAvailability');
      const clawhubProbe = getCachedClawHubProbe();
      finishClawHub({ available: !!clawhubProbe.available, command: clawhubProbe.command || null });
      result.clawhub = {
        installed: !!clawhubProbe.available,
        path: clawhubProbe.command && clawhubProbe.command !== 'clawhub' ? clawhubProbe.command : null,
        diagnostics: clawhubProbe.diagnostics,
        whereOutput: clawhubProbe.whereOutput || '',
        bootstrap: serializeClawHubBootstrap()
      };

      const inspectCacheHit = hasFreshOpenClawStateCache();
      const finishOpenClaw = timer.step('inspectOpenClawState');
      const openclawState = getCachedOpenClawState();
      finishOpenClaw({
        installed: !!openclawState.installed,
        configReady: !!openclawState.configReady,
        gatewayRunning: !!openclawState.gatewayRunning,
        cacheHit: inspectCacheHit
      });

      const finishLifecycle = timer.step('buildOpenClawLifecycle');
      const lifecycle = buildObservedOpenClawLifecycle(openclawState);
      finishLifecycle({ stage: lifecycle.stage || 'unknown', sticky: !!lifecycle.sticky });
      result.openclaw = {
        installed: lifecycle.installed,
        version: lifecycle.version,
        path: lifecycle.path,
        summary: lifecycle.summary,
        lifecycle,
        configExists: lifecycle.configExists,
        configReady: lifecycle.configReady,
        gatewayReady: lifecycle.gatewayReady,
        gatewayRunning: lifecycle.gatewayRunning
      };
      cachedToolsStatusPayload = result;
      cachedToolsStatusAt = Date.now();
      timer.log('ok', {
        openclawInstalled: !!result.openclaw.installed,
        openclawStage: lifecycle.stage || 'unknown',
        clawhubInstalled: !!result.clawhub.installed,
        cacheHit: false
      });
      res.json(result);
    } catch (err) {
      timer.log('error', { error: err.message });
      throw err;
    }
  });

  // 卸载 Node.js — 先用 which 判断安装方式，再按方式卸载
  app.post('/api/tools/uninstall-node', (req, res) => {
    const nvmDir = process.env.NVM_DIR || `${os.homedir()}/.nvm`;
    const logs = [];

    // Windows: 走 Windows 卸载逻辑
    if (os.platform() === 'win32') {
      const nodeInfo = getNodeInstallationInfo({ allowProcessFallback: false });
      const runtimeNode = getRuntimeNodeInfo();
      const registryEntries = getWindowsNodeRegistryEntries();
      const nodeState = getWindowsNodeUninstallState(nodeInfo, runtimeNode, registryEntries);

      if (!nodeInfo.installed && registryEntries.length === 0) {
        return res.json({ success: false, error: nodeState.detail || '未找到 node，可能已经卸载了' });
      }

      if (nodeState.reason === 'runtime_in_use') {
        return res.json({
          success: false,
          error: [
            '检测到当前 ClawBox 正在使用 Windows 系统 Node.js 运行。',
            '为避免卸载动作直接中断当前服务，本轮已阻止在请求链路内执行自动卸载。',
            '',
            `当前运行时: ${runtimeNode.path || '未知路径'} ${runtimeNode.version || ''}`.trim(),
            '请先切换到独立 runtime node / 打包运行时后，再卸载系统 Node.js；或在系统“已安装的应用”里手动卸载。'
          ].join('\n')
        });
      }

      if (nodeState.reason === 'runtime_not_isolated') {
        return res.json({
          success: false,
          error: [
            '当前 ClawBox 运行时尚未与系统 Node.js 彻底隔离。',
            '为了避免再出现“看起来能卸载，其实会把自己脚下地板抽掉”的假承诺，本轮已禁用自动卸载。',
            '',
            `当前运行时: ${runtimeNode.path || '未知路径'} ${runtimeNode.version || ''}`.trim(),
            `检测到系统 Node.js: ${nodeInfo.path || '未知路径'} ${nodeInfo.version || ''}`.trim(),
            '请先切到已确认独立的 runtime node / 打包运行时，或改为系统“已安装的应用”里手动卸载。'
          ].join('\n')
        });
      }

      if (nodeState.reason === 'system_managed') {
        return res.json({
          success: false,
          error: [
            '当前检测到的是 Windows 系统级 Node.js 安装。',
            '为避免官方卸载器在当前请求链路内打断 ClawBox，本轮已禁用直接自动卸载。',
            '',
            `检测路径: ${nodeInfo.path || '未知路径'}`,
            registryEntries[0]?.displayName ? `安装项: ${registryEntries[0].displayName}` : '',
            '请从系统“已安装的应用”或管理员 PowerShell 中手动卸载；待 runtime node 完整隔离后再恢复自动卸载。'
          ].filter(Boolean).join('\n')
        });
      }

      logs.push(`检测到 node 路径: ${nodeInfo.path || '未解析到可执行文件'}`);
      if (nodeInfo.version) logs.push(`检测到 node 版本: ${nodeInfo.version}`);
      if (registryEntries[0]?.displayName) {
        logs.push(`检测到注册表安装项: ${registryEntries[0].displayName}${registryEntries[0].displayVersion ? ` ${registryEntries[0].displayVersion}` : ''}`);
      }

      const attempts = [
        { label: 'winget(OpenJS.NodeJS.LTS)', command: 'winget uninstall --id OpenJS.NodeJS.LTS --silent --accept-source-agreements', shell: 'cmd.exe' },
        { label: 'winget(OpenJS.NodeJS)', command: 'winget uninstall --id OpenJS.NodeJS --silent --accept-source-agreements', shell: 'cmd.exe' },
        { label: 'Chocolatey(nodejs-lts)', command: 'choco uninstall nodejs-lts -y', shell: 'cmd.exe' },
        { label: 'Chocolatey(nodejs)', command: 'choco uninstall nodejs -y', shell: 'cmd.exe' },
        { label: 'Scoop(nodejs-lts)', command: 'scoop uninstall nodejs-lts', shell: 'cmd.exe' },
        { label: 'Scoop(nodejs)', command: 'scoop uninstall nodejs', shell: 'cmd.exe' }
      ];

      const registryEntry = registryEntries.find(entry => entry.quietUninstallString || entry.uninstallString);
      if (registryEntry?.quietUninstallString) {
        attempts.push({
          label: '注册表 QuietUninstallString',
          command: registryEntry.quietUninstallString,
          shell: 'cmd.exe'
        });
      }
      if (registryEntry?.uninstallString) {
        const uninstallString = registryEntry.uninstallString.trim();
        const productCodeMatch = uninstallString.match(/\{[0-9A-F-]+\}/i) || (registryEntry.productCode && registryEntry.productCode.match(/^\{[0-9A-F-]+\}$/i));
        if (/msiexec/i.test(uninstallString) && productCodeMatch) {
          attempts.push({
            label: '官方 MSI 静默卸载',
            command: `msiexec.exe /x ${productCodeMatch[0]} /qn /norestart`,
            shell: 'cmd.exe'
          });
          attempts.push({
            label: '官方 MSI 被动卸载',
            command: `msiexec.exe /x ${productCodeMatch[0]} /passive /norestart`,
            shell: 'cmd.exe'
          });
        }
      }

      for (const attempt of attempts) {
        const result = tryExecCommand(attempt.command, { timeout: 120000, shell: attempt.shell });
        if (!result.success) {
          logs.push(`${attempt.label} 失败: ${result.output || '无输出'}`);
          continue;
        }

        logs.push(`${attempt.label} 执行完成`);
        const remainingNode = getNodeInstallationInfo({ allowProcessFallback: false });
        const remainingRegistry = getWindowsNodeRegistryEntries();
        if (!remainingNode.installed && remainingRegistry.length === 0) {
          return res.json({ success: true, message: `Node.js 卸载完成\n${logs.join('\n')}` });
        }
      }

      return res.json({
        success: false,
        error: buildWindowsNodeManualHint(nodeInfo, registryEntries, logs)
      });
    }

    // 1. 用 which 找到真实路径（Linux/macOS）
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

    // 获取真实路径（解析软链接，macOS 没有 readlink -f）
    let realPath = whichPath;
    try {
      if (os.platform() === 'darwin') {
        realPath = fs.realpathSync(whichPath);
      } else {
        realPath = execSync(`readlink -f "${whichPath}" 2>/dev/null || echo "${whichPath}"`, {
          encoding: 'utf8', timeout: 5000
        }).trim();
      }
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

    const isWindows = os.platform() === 'win32';

    // 1. 用 where/which/command -v 找到所有 clawhub 路径
    let whichPaths = [];
    try {
      const cmd = isWindows
        ? 'where clawhub 2>nul || echo ""'
        : 'which clawhub 2>/dev/null; command -v clawhub 2>/dev/null; echo ""';
      const result = execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
      if (result) {
        whichPaths = [...new Set(result.split('\n').filter(Boolean))];
      }
    } catch {}

    // 2. 额外搜索常见位置（以防 where/which 漏掉）
    const extraSearchDirs = isWindows
      ? [
          path.join(os.homedir(), 'scoop', 'shims'),
          process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '',
          process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'pnpm') : ''
        ].filter(Boolean)
      : [
          `${os.homedir()}/.local/share/pnpm`,
          `${os.homedir()}/.local/bin`,
          `${os.homedir()}/.nvm`,
          '/usr/local/bin',
          '/usr/bin'
        ];

    // 也搜 pnpm 全局存储（非 Windows）
    if (!isWindows) {
      const pnpmGlobal = `${os.homedir()}/.local/share/pnpm/global`;
      if (fs.existsSync(pnpmGlobal)) {
        extraSearchDirs.push(pnpmGlobal);
      }
    }

    for (const dir of extraSearchDirs) {
      if (!dir || !fs.existsSync(dir)) continue;
      try {
        const found = isWindows
          ? spawnSync('cmd.exe', [
              '/d',
              '/s',
              '/c',
              `dir /s /b ${quoteWindowsCmdArg(path.join(dir, 'clawhub.cmd'))} ${quoteWindowsCmdArg(path.join(dir, 'clawhub.exe'))} ${quoteWindowsCmdArg(path.join(dir, 'clawhub'))} 2>nul`
            ], {
              encoding: 'utf8',
              timeout: 5000,
              env: getExtendedShellEnv()
            }).stdout.trim()
          : execSync(`find "${dir}" -maxdepth 5 \\( -name "clawhub" -o -name "clawhub.js" \\) -type f 2>/dev/null`, { encoding: 'utf8', timeout: 5000 }).trim();
        if (found) {
          found.split('\n').filter(Boolean).forEach(p => whichPaths.push(p.trim()));
        }
      } catch {}
    }

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

    // 3. 删除所有找到的文件
    for (const p of whichPaths) {
      try {
        if (fs.existsSync(p)) {
          if (isWindows) {
            fs.unlinkSync(p);
          } else {
            execSync(`sudo rm -f "${p}"`, { timeout: 5000 });
          }
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

    // 5. 验证：where/which 应该找不到了
    let stillExists = false;
    try {
      const verifyCmd = isWindows
        ? 'where clawhub 2>nul || echo ""'
        : 'which clawhub 2>/dev/null || command -v clawhub 2>/dev/null || echo ""';
      const afterWhich = execSync(verifyCmd, {
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

    if (os.platform() === 'win32') {
      // Windows: 用 PowerShell 后台删除
      const scriptPath = path.join(os.tmpdir(), `clawbox-self-uninstall-${Date.now()}.ps1`);
      const scriptContent = [
        'param([string]$TargetDir, [string]$SelfPath)',
        'Start-Sleep -Seconds 2',
        'Remove-Item -LiteralPath $TargetDir -Recurse -Force -ErrorAction SilentlyContinue',
        'Remove-Item -LiteralPath $SelfPath -Force -ErrorAction SilentlyContinue'
      ].join('\r\n');

      try {
        fs.writeFileSync(scriptPath, scriptContent, 'utf8');
        const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath, clawboxDir, scriptPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          env: getExtendedShellEnv()
        });
        proc.unref();
        res.json({ success: true, message: 'ClawBox 正在卸载...' });
        setTimeout(() => process.exit(0), 500);
      } catch (err) {
        try { fs.unlinkSync(scriptPath); } catch {}
        res.json({ success: false, error: `生成卸载脚本失败: ${err.message}` });
      }
    } else {
      // Linux/macOS: 用 bash 脚本
      const scriptPath = '/tmp/clawbox_self_uninstall.sh';
      const script = `#!/bin/bash
sleep 2
rm -rf "${clawboxDir}"
rm -f "${scriptPath}"
`;
      try {
        fs.writeFileSync(scriptPath, script, { mode: 0o755 });
        exec(`nohup bash ${scriptPath} &>/dev/null &`);
        res.json({ success: true, message: 'ClawBox 正在卸载...' });
        setTimeout(() => process.exit(0), 500);
      } catch (err) {
        res.json({ success: false, error: `生成卸载脚本失败: ${err.message}` });
      }
    }
  });

  // Windows 安装前清场 / 修复环境
  app.post('/api/tools/repair-environment', (req, res) => {
    try {
      const report = buildWindowsRepairEnvironmentReport();
      const hasBlockingDeleteFailures = (report.failedDeletes || []).some((item) => item.category !== 'missing');
      const hasFailures = hasBlockingDeleteFailures || report.processKillFailures.length > 0;
      invalidateStatusCaches({ clearSticky: true });
      res.json({
        success: report.supported ? !hasFailures : false,
        report
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: `修复安装环境失败：${err.message}`
      });
    }
  });

  // 获取 OpenClaw Dashboard URL
  app.get('/api/tools/openclaw-dashboard', (req, res) => {
    const timer = createRequestTimer('/api/tools/openclaw-dashboard', req);
    try {
      let payload = null;
      let configAuth = null;
      const statusOutputs = [];
      let resolution = {
        dashboardUrl: null,
        gatewayRunning: false,
        gatewayPort: null,
        gatewayToken: '',
        needsDeepProbe: true
      };

      const finishConfigRead = timer.step('readOpenClawDashboardAuthFromConfig');
      configAuth = readOpenClawDashboardAuthFromConfig();
      finishConfigRead({
        port: configAuth.port || null,
        hasToken: !!configAuth.token,
        mode: configAuth.mode || null,
        configPath: configAuth.path || null
      });

      const finishResolve = timer.step('resolveOpenClawPath');
      const cachedState = hasFreshOpenClawStateCache() ? cachedOpenClawState : null;
      const openclawPath = cachedState?.openclawPath || resolveOpenClawPath();
      finishResolve({ path: openclawPath || null, cacheHit: !!cachedState?.openclawPath });

      if (!openclawPath) {
        timer.log('not_found', { found: false, reason: 'openclaw_missing' });
        res.json({ success: false, error: '未找到 OpenClaw 可执行文件，OpenClaw 可能未安装', port: configAuth.port || null, token: configAuth.token || null });
        return;
      }

      const finishJsonStatus = timer.step('gateway status --json');
      const jsonResult = runResolvedCliCommand(openclawPath, ['gateway', 'status', '--json'], 4000);
      finishJsonStatus({ ok: !!jsonResult.ok, status: jsonResult.status });
      const jsonOutput = (jsonResult.stdout || jsonResult.stderr || '').trim();
      if (jsonOutput) {
        statusOutputs.push(jsonOutput);
        try {
          payload = JSON.parse(jsonOutput);
        } catch {
          payload = null;
        }
      }
      resolution = resolveOpenClawDashboardTarget({
        payload,
        statusOutputs,
        configAuth,
        gatewayRunning: resolution.gatewayRunning
      });
      if (resolution.dashboardUrl) {
        cacheObservedOpenClawDashboardSuccess(openclawPath, configAuth, resolution, payload, statusOutputs, cachedState?.version || null);
        timer.log('ok_json', { found: true, port: resolution.gatewayPort || null, gatewayRunning: resolution.gatewayRunning, deepProbe: false });
        res.json({ success: true, url: resolution.dashboardUrl, port: resolution.gatewayPort, token: resolution.gatewayToken || null });
        return;
      }

      if (resolution.needsDeepProbe) {
        const finishDeepStatus = timer.step('gateway status --deep');
        const textResult = runResolvedCliCommand(openclawPath, ['gateway', 'status', '--deep'], 4000);
        finishDeepStatus({ ok: !!textResult.ok, status: textResult.status });
        const textOutput = textResult.output;
        if (textOutput) statusOutputs.push(textOutput);
        resolution = resolveOpenClawDashboardTarget({
          payload,
          statusOutputs,
          configAuth,
          gatewayRunning: resolution.gatewayRunning || /\brunning\b/i.test(textOutput)
        });
      }

      if (resolution.dashboardUrl) {
        cacheObservedOpenClawDashboardSuccess(openclawPath, configAuth, resolution, payload, statusOutputs, cachedState?.version || null);
        timer.log('ok', { found: true, port: resolution.gatewayPort || null, gatewayRunning: resolution.gatewayRunning, deepProbe: resolution.needsDeepProbe });
        res.json({ success: true, url: resolution.dashboardUrl, port: resolution.gatewayPort, token: resolution.gatewayToken || null });
        return;
      }

      const startupState = {
        installed: true,
        configExists: !!configAuth.exists,
        configReady: !!configAuth.exists,
        gatewayReady: !!(payload || resolution.gatewayPort || resolution.gatewayRunning),
        gatewayRunning: !!resolution.gatewayRunning,
        gatewayStatus: {
          data: payload,
          stdout: statusOutputs.join('\n'),
          stderr: '',
          error: ''
        }
      };
      const startupFlags = detectGatewayStartupFlags(startupState, detectGatewayHealthFlags(startupState));
      const portHint = resolution.gatewayPort ? `；当前检测到端口 ${resolution.gatewayPort}` : '';
      const tokenHint = resolution.gatewayRunning && resolution.gatewayPort ? '，但暂未获取到 Dashboard token / URL' : '';
      timer.log('not_found', { found: false, port: resolution.gatewayPort || null, gatewayRunning: resolution.gatewayRunning });
      res.json({
        success: false,
        error: startupFlags.startup
          ? `Gateway 正在启动中，RPC 健康检查尚未就绪，请在 ${Math.round(GATEWAY_STARTUP_GRACE_MS / 1000)} 秒内稍后重试${portHint}`
          : (resolution.gatewayRunning ? `Gateway 已运行${tokenHint}${portHint}，请先执行 openclaw gateway status --deep` : '未找到 Dashboard 地址，Gateway 可能未运行'),
        port: resolution.gatewayPort,
        token: resolution.gatewayToken || null
      });
    } catch (err) {
      timer.log('error', { error: err.message });
      res.json({ success: false, error: '无法获取 Dashboard 地址' });
    }
  });

  // 重启网关
  app.post('/api/gateway/restart', async (req, res) => {
    try {
      const openclawPath = resolveOpenClawPath();
      if (os.platform() === 'win32') {
        noteGatewayRecoveryObservation();
        const restartResult = runResolvedCliCommand(openclawPath || 'openclaw', ['gateway', 'restart'], 90000);
        const restartOutput = restartResult.output;
        const observed = await observeWindowsGatewayRecovery(GATEWAY_RECOVERY_TIMEOUT_MS, GATEWAY_RECOVERY_INTERVAL_MS);

        if (observed.success) {
          rememberObservedOpenClawState(observed.state);
          return res.json({
            success: true,
            output: restartOutput,
            ready: true,
            degraded: !!observed.degraded || !restartResult.ok,
            note: !restartResult.ok
              ? '官方 restart 返回了超时/健康检查错误，但 Gateway 实际已恢复可用。'
              : (observed.degraded ? '官方 runtime 状态未完全同步，但 Gateway 已可用。' : null)
          });
        }

        return res.json({
          success: false,
          error: restartOutput || restartResult.error?.message || '网关重启失败',
          output: restartOutput
        });
      }

      const restartResult = runResolvedCliCommand(openclawPath || 'openclaw', ['gateway', 'restart'], 30000);
      const output = restartResult.output;

      if (!restartResult.ok) {
        throw new Error(output || restartResult.error?.message || '网关重启失败');
      }

      noteGatewayRecoveryObservation();
      const health = await waitForGatewayHealthy(GATEWAY_RECOVERY_TIMEOUT_MS);
      if (!health.success) {
        return res.json({ success: false, error: `网关重启命令已执行，但服务未在 ${Math.round(GATEWAY_RECOVERY_TIMEOUT_MS / 1000)} 秒内恢复`, output });
      }

      rememberObservedOpenClawState(health.state);
      res.json({ success: true, output, ready: true });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  // 启动服务器
  return new Promise((resolve) => {
    const host = process.env.HOST || '127.0.0.1';
    const server = app.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      console.log(`\n  📦 ClawBox 已启动: ${url}`);
      console.log(`  在浏览器中打开即可开始配置\n`);

      // 自动打开浏览器（跨平台）
      if (shouldAutoOpenBrowser(devMode)) {
        openBrowserUrl(url);
      }

      ensureClawHubBootstrap();
      scheduleOpenClawStateWarmup().catch(() => {});

      resolve(server);
    });
  });
}

// 直接运行时启动服务器
function resetStatusCachesForTest() {
  invalidateStatusCaches({ clearSticky: true, clearGatewayRecovery: true });
  quickOpenClawLifecycleSnapshotOverride = null;
}

function setCachedOpenClawStateForTest(state, ageMs = 0) {
  cachedOpenClawState = state;
  cachedOpenClawStateAt = Date.now() - Math.max(0, Number(ageMs) || 0);
  cachedLiteLifecycle = null;
  cachedLiteLifecycleAt = 0;
}

function setLastHealthyOpenClawLifecycleForTest(status, ageMs = 0) {
  if (!status) {
    lastHealthyOpenClawLifecycle = null;
    return;
  }
  lastHealthyOpenClawLifecycle = {
    time: Date.now() - Math.max(0, Number(ageMs) || 0),
    status: {
      ...status,
      sticky: false
    }
  };
}

function setQuickOpenClawLifecycleSnapshotForTest(status) {
  quickOpenClawLifecycleSnapshotOverride = status ? { ...status } : null;
  cachedLiteLifecycle = null;
  cachedLiteLifecycleAt = 0;
}

function resolveChannelEnableToggleContext(channelKey, enabled) {
  const key = String(channelKey || '').trim();
  const channelMeta = getChannelCatalog().find((item) => item.key === key);
  if (!channelMeta) {
    return { ok: false, statusCode: 404, error: '消息通道不存在' };
  }

  // `getChannelConfig()` 会给 UI 返回默认模板，这里只接受真正保存过的配置。
  const current = getPersistedChannelConfig(key);
  if (!current) {
    return { ok: false, statusCode: 404, error: '消息通道未配置或已删除' };
  }

  if (enabled && !current.configured) {
    return { ok: false, statusCode: 400, error: '请先完成通道配置，再启用该通道' };
  }

  return { ok: true, key, current };
}

if (require.main === module) {
  const devMode = process.argv.includes('--dev');
  startServer(3456, devMode);
}

module.exports = {
  startServer,
  __test: {
    GATEWAY_RECOVERY_TIMEOUT_MS,
    GATEWAY_STARTUP_GRACE_MS,
    parseGatewayPortFromText,
    findGatewayPortInJson,
    findGatewayTokenInJson,
    quoteWindowsCmdArg,
    isPreferredOpenClawPanelUrl,
    buildOpenClawDashboardUrlFromParts,
    readOpenClawDashboardAuthFromConfig,
    normalizeOpenClawDashboardUrl,
    parseOpenclawDashboardUrlFromJson,
    parseOpenclawDashboardUrlFromText,
    parseOpenClawTokenFromText,
    detectGatewayRunningFromPayload,
    parseGatewayRuntimeTimestamp,
    detectGatewayStartupFlags,
    buildObservedOpenClawLifecycle,
    buildOpenClawLifecycle,
    buildObservedDashboardOpenClawLifecycle,
    buildObservedDashboardOpenClawState,
    resolveOpenClawDashboardTarget,
    buildQuickOpenClawLifecycleSnapshot,
    cacheObservedOpenClawDashboardSuccess,
    cacheOpenClawStateSnapshot,
    getFastLiteOpenClawLifecycle,
    getRecentHealthyOpenClawLifecycle,
    rememberObservedOpenClawState,
    syncStatusCachesAfterOpenClawUpdate,
    resolveChannelEnableToggleContext,
    noteGatewayRecoveryObservation,
    clearGatewayRecoveryObservation,
    resetStatusCachesForTest,
    setCachedOpenClawStateForTest,
    setLastHealthyOpenClawLifecycleForTest,
    setQuickOpenClawLifecycleSnapshotForTest
  }
};
