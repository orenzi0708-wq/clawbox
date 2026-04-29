// ClawBox 前端逻辑

// ========== 初始化 ==========

let currentModelConfig = null;
let latestToolStatus = null;
let lastSuccessfulDashboardUrl = '';
let lastSuccessfulDashboardAt = 0;
let suspendHeavyPollingUntil = 0;
let fullStatusProbePromise = null;
let fullStatusProbeTimer = null;
const MODEL_PROVIDER_CATALOG = {
  deepseek: {
    label: '深度求索 DeepSeek',
    shortLabel: 'DeepSeek',
    description: 'DeepSeek 提供高性价比中文推理与对话模型，适合通用问答和代码场景。',
    apiLink: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }
    ]
  },
  mimo: {
    label: '小米 MiMo',
    shortLabel: 'MiMo',
    description: 'MiMo 提供长上下文与推理能力，适合复杂任务和高容量上下文场景。',
    apiLink: 'https://platform.xiaomimimo.com/',
    models: [
      { id: 'mimo-v2-pro', name: 'MiMo v2 Pro' },
      { id: 'mimo-v2-omni', name: 'MiMo v2 Omni' },
      { id: 'mimo-v2-flash', name: 'MiMo v2 Flash' }
    ]
  },
  google: {
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    description: 'Gemini 适合多模态和大上下文处理，兼顾速度与推理能力。',
    apiLink: 'https://aistudio.google.com/app/apikey',
    models: [
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite Latest' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
      { id: 'gemini-pro-latest', name: 'Gemini Pro Latest' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' },
      { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview' },
      { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview' },
      { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image Preview' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }
    ]
  },
  anthropic: {
    label: 'Anthropic Claude',
    shortLabel: 'Claude',
    description: 'Claude 系列偏重稳定输出与长文本理解，适合严谨对话与文档分析。',
    apiLink: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
      { id: 'claude-opus-4-1', name: 'Claude Opus 4.1' },
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'claude-opus-4', name: 'Claude Opus 4' }
    ]
  },
  openai: {
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    description: 'OpenAI 提供通用能力完整的模型族，适合综合生成、工具调用与多场景接入。',
    apiLink: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
      { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
      { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro' },
      { id: 'gpt-5.3-chat-latest', name: 'GPT-5.3 Chat Latest' },
      { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
      { id: 'o3', name: 'o3' },
      { id: 'o3-mini', name: 'o3 Mini' },
      { id: 'o4-mini', name: 'o4 Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' }
    ]
  },
  tencent_hunyuan: {
    label: '腾讯混元 Hunyuan',
    shortLabel: '混元',
    description: '这里只列 API 可接入的混元模型；腾讯元 Token Plan / Coding Plan 属于订阅方案信息，不再混进模型名。',
    apiLink: 'https://console.cloud.tencent.com/hunyuan/start',
    models: [
      { id: 'hunyuan-t1', name: 'Hunyuan T1' },
      { id: 'hunyuan-t1-latest', name: 'Hunyuan T1 Latest' },
      { id: 'hunyuan-turbos-latest', name: 'Hunyuan Turbos Latest' },
      { id: 'hunyuan-turbo-latest', name: 'Hunyuan Turbo Latest' },
      { id: 'hunyuan-lite-latest', name: 'Hunyuan Lite Latest' }
    ]
  },
  qianwen: {
    label: '阿里千问 Qwen',
    shortLabel: '千问',
    description: '阿里千问提供高性能中文对话与代码模型，已补进 Qwen3 系列最新主力版本。',
    apiLink: 'https://dashscope.console.aliyun.com/',
    models: [
      { id: 'qwen3-max', name: 'Qwen 3 Max' },
      { id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus' },
      { id: 'qwen3.5-flash', name: 'Qwen 3.5 Flash' },
      { id: 'qwen-max-latest', name: 'Qwen Max Latest' },
      { id: 'qwen-plus-latest', name: 'Qwen Plus Latest' },
      { id: 'qwen-turbo-latest', name: 'Qwen Turbo Latest' },
      { id: 'qwen3-coder-plus', name: 'Qwen 3 Coder Plus' }
    ]
  },
  minimax: {
    label: 'MiniMax',
    shortLabel: 'MiniMax',
    description: 'MiniMax 这里按服务器当前真实格式走 Anthropiс 兼容接入：baseUrl 为 https://api.minimaxi.com/anthropic，api 为 anthropic-messages。',
    apiLink: 'https://platform.minimaxi.com/',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
      { id: 'MiniMax-M2.7-HighSpeed', name: 'MiniMax M2.7 HighSpeed' },
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5' },
      { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 Highspeed' },
      { id: 'MiniMax-M2.5-Lightning', name: 'MiniMax M2.5 Lightning' },
      { id: 'MiniMax-M2.1', name: 'MiniMax M2.1' },
      { id: 'MiniMax-M2.1-lightning', name: 'MiniMax M2.1 Lightning' },
      { id: 'MiniMax-M2', name: 'MiniMax M2' }
    ]
  },
  moonshot: {
    label: 'Moonshot Kimi',
    shortLabel: 'Kimi',
    description: '这里只列 Moonshot API 可接入模型；Kimi Coding Plan 属于订阅方案信息，不再混进模型名。',
    apiLink: 'https://platform.moonshot.cn/',
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5' },
      { id: 'kimi-k2', name: 'Kimi K2' },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K' }
    ]
  },
  zhipu: {
    label: '智谱 GLM',
    shortLabel: '智谱',
    description: '这里只列智谱 API 可接入模型；GLM Coding Plan 属于订阅方案信息，不再混进模型名。已补上最新的 GLM-5.1。',
    apiLink: 'https://open.bigmodel.cn/',
    models: [
      { id: 'glm-5.1', name: 'GLM-5.1' },
      { id: 'glm-5', name: 'GLM-5' },
      { id: 'glm-5-turbo', name: 'GLM-5 Turbo' },
      { id: 'glm-4.7', name: 'GLM-4.7' },
      { id: 'glm-4.6', name: 'GLM-4.6' }
    ]
  },
  doubao: {
    label: '火山引擎 豆包',
    shortLabel: '豆包',
    description: '这里只列火山方舟 API 可接入模型；方舟 Coding Plan 属于订阅方案信息，不再混进模型名。',
    apiLink: 'https://console.volcengine.com/ark/region:ark+cn-beijing/overview',
    models: [
      { id: 'doubao-seed-2.0-pro', name: '豆包 Seed 2.0 Pro' },
      { id: 'doubao-seed-1.8', name: '豆包 Seed 1.8' },
      { id: 'doubao-seed-1.6-pro', name: '豆包 Seed 1.6 Pro' },
      { id: 'doubao-seed-1.6', name: '豆包 Seed 1.6' }
    ]
  },
  ernie: {
    label: '百度文心 ERNIE',
    shortLabel: '文心',
    description: '这里只列百度千帆 API 可接入模型；百度千帆 Coding Plan 属于订阅方案信息，不再混进模型名。',
    apiLink: 'https://console.baidu.com/qianfan/modelcenter/model',
    models: [
      { id: 'ernie-5.0', name: 'ERNIE 5.0' },
      { id: 'ernie-x1.1', name: 'ERNIE X1.1' },
      { id: 'ernie-4.5-turbo', name: 'ERNIE 4.5 Turbo' }
    ]
  }
};

let expandedModelProviders = new Set();
const CHANNEL_UI_CATALOG = {
  wecom: { key: 'wecom', name: '企业微信', description: '企业微信消息通道' },
  dingtalk: { key: 'dingtalk', name: '钉钉', description: '钉钉消息通道' },
  qq: { key: 'qq', name: 'QQ', description: 'QQ 消息通道' },
  yuanbao: { key: 'yuanbao', name: '元宝', description: '元宝消息通道' },
  feishu: { key: 'feishu', name: '飞书', description: '飞书消息通道' },
  telegram: { key: 'telegram', name: 'Telegram', description: 'Telegram 消息通道' },
  discord: { key: 'discord', name: 'Discord', description: 'Discord 消息通道' }
};
let availableChannels = [];
let connectedChannels = [];
let currentChannelKey = 'wecom';
let expandedConnectedChannels = new Set();
let activeQuickConfigSessionId = '';
let quickConfigPollTimer = null;
let clawhubReady = false;
let clawhubBootstrapPollTimer = null;
let skillSearchInFlight = null;
const skillSearchCache = new Map();
const CHANNEL_STATUS_TEXT = {
  unconfigured: '未配置',
  configured: '已配置未启用',
  enabled: '已启用',
  configuring: '配置中',
  configured_pending_pairing: '已配置，待配对',
  connected: '已接入',
  failed: '配置失败'
};


function getOpenClawLifecycleTone(lifecycle) {
  const stage = lifecycle?.stage || '';
  if (stage === 'ready' || stage === 'installed_ready' || stage === 'gateway_degraded') return 'ok';
  if (stage === 'init_incomplete' || stage === 'gateway_incomplete' || stage === 'gateway_unhealthy' || stage === 'gateway_starting') return 'warn';
  return 'err';
}

function formatGatewayLifecycleText(lifecycle, gatewayRunning) {
  if (!lifecycle?.installed) return gatewayRunning ? '● 运行中' : '○ 未运行';
  if (gatewayRunning) return lifecycle?.detail ? `● 运行中；${lifecycle.detail}` : '● 运行中';

  if (lifecycle?.stage === 'gateway_degraded') {
    return lifecycle?.detail ? `◐ 可用但待同步；${lifecycle.detail}` : '◐ 可用但待同步';
  }

  if (lifecycle?.stage === 'gateway_unhealthy') {
    return lifecycle?.detail ? `○ 异常；${lifecycle.detail}` : '○ 异常；Gateway 端口已监听但 RPC 未就绪';
  }

  if (lifecycle?.stage === 'gateway_starting') {
    return lifecycle?.detail ? `● 启动中；${lifecycle.detail}` : '● 启动中；Gateway 正在恢复';
  }

  if (lifecycle?.stage === 'gateway_incomplete') {
    if (lifecycle.gatewayFailure === 'permission') return '○ 未运行；Gateway 服务注册需要管理员权限';
    if (lifecycle.gatewayFailure === 'timeout') return '○ 未运行；Gateway 重启超时，后台服务未完全就绪';
    return lifecycle?.detail ? `○ 未运行；${lifecycle.detail}` : '○ 未运行；Gateway 尚未完成';
  }

  if (lifecycle?.stage === 'init_incomplete') {
    return lifecycle?.detail ? `○ 未运行；${lifecycle.detail}` : '○ 未运行；初始化未完成';
  }

  return lifecycle?.detail ? `○ 未运行；${lifecycle.detail}` : '○ 未运行';
}

function formatOpenClawLifecycleText(lifecycle, fallbackVersion, fallbackPath) {
  if (!lifecycle?.installed) return '✗ 未安装';
  const versionText = lifecycle.version || fallbackVersion || '已安装';
  const pathText = lifecycle.path || fallbackPath;
  const suffix = pathText ? ` (${pathText})` : '';
  const detail = lifecycle.detail ? `；${lifecycle.detail}` : '';
  return `✓ ${versionText}${suffix}${detail}`;
}

function shouldShowOpenClawPostInstallActions(lifecycle) {
  if (!lifecycle?.installed) return false;
  return !['init_incomplete', 'gateway_incomplete', 'gateway_starting'].includes(String(lifecycle.stage || ''));
}

function resetInstallButtonState(force = false) {
  const btn = document.getElementById('btnInstall');
  if (!btn || (!force && installActionInFlight)) return;
  btn.textContent = '一键安装';
  btn.disabled = false;
  btn.style.background = '';
}

function resetUpdateButtonState(force = false) {
  const btn = document.getElementById('btnUpdate');
  if (!btn || (!force && updateActionInFlight)) return;
  btn.textContent = '检查更新';
  btn.disabled = false;
  btn.style.background = '';
}

function resetUninstallButtonState(force = false) {
  const btn = document.getElementById('btnUninstall');
  if (!btn || (!force && uninstallActionInFlight)) return;
  btn.textContent = '卸载';
  btn.disabled = false;
  btn.style.background = '';
}

function buildQrImageUrl(content) {
  if (!content) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(content)}`;
}

function resolveQuickQrImageUrl(qrCode = {}) {
  const directImageUrl = String(qrCode.imageUrl || '').trim();
  if (directImageUrl) return directImageUrl;
  const content = String(qrCode.content || '').trim();
  return buildQrImageUrl(content);
}

function truncateMiddle(text, maxLength = 80) {
  const value = String(text || '');
  if (value.length <= maxLength) return value;
  const head = Math.max(24, Math.floor(maxLength / 2) - 3);
  const tail = Math.max(16, Math.floor(maxLength / 2) - 9);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function upsertInstallHint(id, badgeText, text, extraClass = '') {
  const installInfo = document.getElementById('installInfo');
  if (!installInfo) return;

  let item = document.getElementById(id);
  if (!item) {
    item = document.createElement('div');
    item.id = id;
    item.className = 'info-item';
    item.innerHTML = '<span class="info-badge"></span><span class="info-text"></span>';
    installInfo.appendChild(item);
  }

  item.className = `info-item ${extraClass}`.trim();
  item.style.display = 'flex';
  item.querySelector('.info-badge').textContent = badgeText;
  item.querySelector('.info-text').textContent = text;
}

function consumeSseChunk(state, chunkText) {
  state.buffer = `${state.buffer || ''}${chunkText || ''}`;
  const events = [];

  while (true) {
    const separatorIndex = state.buffer.indexOf('\n\n');
    if (separatorIndex === -1) break;

    const rawEvent = state.buffer.slice(0, separatorIndex);
    state.buffer = state.buffer.slice(separatorIndex + 2);

    const payload = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n')
      .trim();

    if (!payload) continue;

    try {
      events.push(JSON.parse(payload));
    } catch (error) {
      console.warn('SSE JSON parse skipped:', error.message, payload);
    }
  }

  return events;
}

async function readSseJsonStream(response, onEvent) {
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error('浏览器不支持流式读取');

  const decoder = new TextDecoder();
  const streamState = { buffer: '' };

  while (true) {
    const { done, value } = await reader.read();
    const chunkText = decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = consumeSseChunk(streamState, chunkText);
    for (const event of events) {
      await onEvent(event);
    }
    if (done) {
      const tailEvents = consumeSseChunk(streamState, '\n\n');
      for (const event of tailEvents) {
        await onEvent(event);
      }
      break;
    }
  }
}

function setButtonBusy(button, busyText, idleText = '') {
  if (!button) return () => {};
  const previousText = idleText || button.dataset.idleText || button.textContent;
  button.dataset.idleText = previousText;
  const previousDisabled = button.disabled;
  button.disabled = true;
  if (busyText) button.textContent = busyText;

  return () => {
    button.disabled = previousDisabled;
    button.textContent = button.dataset.idleText || previousText;
  };
}

function getNodeUninstallConfirmMessage(toolStatus) {
  const node = toolStatus?.node;
  const runtimeNode = toolStatus?.runtimeNode;
  const status = node?.uninstallStatus || (node?.installed ? 'removable' : (runtimeNode?.installed ? 'runtime_only' : 'absent'));

  if (status === 'runtime_in_use') {
    return '当前 ClawBox 正在使用这个系统 Node.js 运行，不能在当前会话内自动卸载。请改为系统手动卸载，或切换到独立运行时后再试。';
  }

  if (status === 'system_managed') {
    return '当前检测到系统级 Node.js。为避免官方卸载器打断服务，本轮仅建议从系统“已安装的应用”或管理员 PowerShell 手动卸载。';
  }

  if (status === 'runtime_only') {
    return node?.uninstallHint || '当前 ClawBox 使用独立运行时，未检测到可单独管理的系统 Node.js。';
  }

  if (status === 'runtime_not_isolated') {
    return node?.uninstallHint || '当前运行时尚未证明与系统 Node.js 隔离，已禁用自动卸载。';
  }

  if (status === 'absent' || !node?.installed) {
    return '未检测到可卸载的系统 Node.js。';
  }

  if (runtimeNode?.installed) {
    return '确定要卸载系统 Node.js 吗？当前 ClawBox 仍由独立运行时提供服务，但依赖系统 Node.js 的 OpenClaw / npm / clawhub 功能可能受影响。';
  }

  return '确定要卸载 Node.js 吗？卸载后依赖该 Node.js 的 ClawBox 和 OpenClaw 功能都将无法运行。';
}

function getNodeUninstallButtonTitle(toolStatus) {
  const node = toolStatus?.node;
  const runtimeNode = toolStatus?.runtimeNode;
  const status = node?.uninstallStatus || (node?.installed ? 'removable' : (runtimeNode?.installed ? 'runtime_only' : 'absent'));

  if (status === 'removable') return '';
  if (node?.uninstallHint) return node.uninstallHint;
  if (status === 'runtime_only') return '当前 ClawBox 使用独立运行时，未检测到可卸载的系统 Node.js';
  if (status === 'runtime_not_isolated') return '当前运行时尚未证明与系统 Node.js 隔离，已禁用自动卸载';
  if (status === 'runtime_in_use') return '当前 ClawBox 正在使用这个系统 Node.js 运行，当前会话内不可自动卸载';
  if (status === 'system_managed') return '当前检测到系统级 Node.js，本轮仅支持手动卸载';
  return '未检测到可卸载的系统 Node.js';
}

function formatClawHubError(error) {
  const text = String(error || '').trim();
  if (!text) return '未知错误';
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function renderClawHubBootstrapHint(bootstrap) {
  if (!bootstrap) return;

  if (bootstrap.status === 'running') {
    upsertInstallHint('clawhubBootstrapHint', '🧩 ClawHub', bootstrap.detail || '首次启动，正在自动准备 ClawHub CLI...');
    return;
  }

  if (bootstrap.status === 'error') {
    upsertInstallHint('clawhubBootstrapHint', '⚠️ ClawHub', bootstrap.error ? `自动准备失败：${bootstrap.error}` : '自动准备失败，请在工具页检查');
    return;
  }

  if (bootstrap.installed) {
    upsertInstallHint('clawhubBootstrapHint', '✅ ClawHub', bootstrap.autoInstalled ? '首次启动已自动准备好 ClawHub CLI' : 'ClawHub CLI 已就绪');
  }
}

function scheduleClawHubBootstrapPoll(bootstrap) {
  if (clawhubBootstrapPollTimer) {
    clearTimeout(clawhubBootstrapPollTimer);
    clawhubBootstrapPollTimer = null;
  }

  if (bootstrap?.status === 'running') {
    clawhubBootstrapPollTimer = setTimeout(() => {
      refreshInstallLifecycleState();
    }, 3000);
  }
}

function getStepLabel(name) {
  const labels = {
    detect_os: '检测系统',
    check_prereq: '检查前置',
    install_openclaw: '安装 OpenClaw',
    install_openclaw_stage: '安装阶段',
    install_openclaw_stream: '安装输出',
    install_clawhub: '安装 ClawHub CLI',
    init_config: '初始化配置',
    install_gateway: '注册 Gateway',
    verify: '验证结果',
    all_done: '流程完成',
    stop_gateway: '停止 Gateway',
    uninstall: '执行卸载',
    fallback_remove: '清理残留',
    clean_runtime: '清理运行时',
    final_check: '最终复检',
    error: '错误'
  };
  return labels[name] || name;
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadStatus();
  initModelForm();
  loadModels();
  loadChannelsView();
  loadInstalledSkills();
  startInstallLifecyclePolling();
  startToolStatusPolling();

  // 点击 Skills 标签时检查 clawhub
  document.querySelector('[data-tab="skills"]')?.addEventListener('click', () => {
    if (!clawhubReady) refreshClawHubAvailability(true);
  });

  // 点击工具标签时加载状态
  document.querySelector('[data-tab="tools"]')?.addEventListener('click', () => {
    loadToolStatus();
  });

  document.querySelector('[data-tab="channels"]')?.addEventListener('click', () => {
    loadChannelsView();
  });

  // 切换模型单选按钮同步 .checked 样式
  document.getElementById('modelList')?.addEventListener('change', (e) => {
    if (e.target.type === 'radio') {
      const name = e.target.name;
      document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
        radio.closest('.switch-version-radio')?.classList.toggle('checked', radio.checked);
      });
    }
  });
});

// ========== 标签页切换 ==========

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ========== 状态加载 ==========

function applyStatusPayload(data) {
  document.getElementById('osInfo').textContent = data.os;
  document.getElementById('nodeInfo').textContent = data.nodeOk
    ? `✓ ${data.nodeVersion}`
    : `✗ ${data.nodeVersion}`;
  document.getElementById('nodeInfo').className = `value ${data.nodeOk ? 'ok' : 'err'}`;

  const lifecycle = data.openclawLifecycle || null;
  if (data.openclawInstalled) {
    const showPostInstallActions = shouldShowOpenClawPostInstallActions(lifecycle);
    resetUpdateButtonState();
    resetUninstallButtonState();
    document.getElementById('openclawInfo').textContent = formatOpenClawLifecycleText(lifecycle, data.openclawVersion, data.openclawPath);
    document.getElementById('openclawInfo').className = `value ${getOpenClawLifecycleTone(lifecycle)}`;
    document.getElementById('btnInstall').style.display = showPostInstallActions ? 'none' : 'inline-block';
    document.getElementById('btnUpdate').style.display = showPostInstallActions ? 'inline-block' : 'none';
    document.getElementById('btnUninstall').style.display = showPostInstallActions ? 'inline-block' : 'none';
  } else {
    resetInstallButtonState();
    resetUpdateButtonState();
    resetUninstallButtonState();
    document.getElementById('openclawInfo').textContent = '✗ 未安装';
    document.getElementById('openclawInfo').className = 'value err';
    document.getElementById('btnInstall').style.display = 'inline-block';
    document.getElementById('btnUpdate').style.display = 'none';
    document.getElementById('btnUninstall').style.display = 'none';
  }

  document.getElementById('gatewayInfo').textContent = formatGatewayLifecycleText(lifecycle, data.gatewayRunning);
  document.getElementById('gatewayInfo').className = `value ${data.gatewayRunning ? 'ok' : (lifecycle?.installed ? getOpenClawLifecycleTone(lifecycle) : 'warn')}`;

  if (data.isRoot) {
    document.getElementById('rootHint').style.display = 'flex';
    document.getElementById('sudoHint').style.display = 'none';
  } else {
    document.getElementById('rootHint').style.display = 'none';
    document.getElementById('sudoHint').style.display = 'flex';
  }

  renderClawHubBootstrapHint(data.clawhubBootstrap);
  scheduleClawHubBootstrapPoll(data.clawhubBootstrap);
  return data;
}

function shouldScheduleFullStatusProbe(data, options = {}) {
  if (options.fromFullProbe) return false;
  const lifecycle = data?.openclawLifecycle || null;
  if (!data?.openclawInstalled || !lifecycle?.configReady) return false;
  return lifecycle.stage === 'gateway_incomplete' || lifecycle.stage === 'gateway_starting';
}

function scheduleFullStatusProbe(delayMs = 0) {
  if (fullStatusProbePromise || fullStatusProbeTimer) return;
  fullStatusProbeTimer = setTimeout(() => {
    fullStatusProbeTimer = null;
    loadFullStatus().catch(() => {});
  }, Math.max(0, Number(delayMs) || 0));
}

async function loadStatus(options = {}) {
  const endpoint = options.full ? '/api/status' : '/api/status-lite';
  try {
    const res = await fetch(endpoint);
    const data = await res.json();
    applyStatusPayload(data);
    if (shouldScheduleFullStatusProbe(data, options)) {
      scheduleFullStatusProbe(50);
    }
    return data;
  } catch {
    document.getElementById('osInfo').textContent = '检测失败';
    return null;
  }
}

async function loadFullStatus() {
  if (fullStatusProbePromise) return fullStatusProbePromise;
  fullStatusProbePromise = (async () => {
    try {
      return await loadStatus({ full: true, fromFullProbe: true });
    } finally {
      fullStatusProbePromise = null;
    }
  })();
  return fullStatusProbePromise;
}

async function refreshClawHubAvailability(autoSetup = false) {
  const container = document.getElementById('skillResults');

  try {
    const res = await fetch('/api/skills/status');
    const data = await res.json();
    clawhubReady = !!data.available;
    renderClawHubBootstrapHint(data.bootstrap);
    scheduleClawHubBootstrapPoll(data.bootstrap);

    const diagText = [data.command ? `探测命令: ${data.command}` : '', data.whereOutput ? `where clawhub: ${data.whereOutput}` : '', data.diagnostics || '']
      .filter(Boolean)
      .join('\n');

    if (clawhubReady) {
      if (container && (!container.textContent.trim() || /正在安装 ClawHub CLI|正在准备 ClawHub/.test(container.textContent))) {
        container.innerHTML = '<div class="empty-state">ClawHub 已就绪，开始搜索吧！</div>';
      }
      return true;
    }

    if (!autoSetup) {
      if (container && !document.getElementById('skillSearch')?.value.trim()) {
        if (data.bootstrap?.status === 'running') {
          container.innerHTML = '<div class="empty-state pulse">首次启动，正在自动准备 ClawHub CLI...</div>';
        } else if (data.bootstrap?.status === 'error') {
          container.innerHTML = `<div class="empty-state">ClawHub 自动准备失败：${formatClawHubError(data.bootstrap.error)}，请到工具面板查看详情<br><pre style="white-space:pre-wrap;text-align:left;max-height:180px;overflow:auto;">${diagText}</pre></div>`;
        } else {
          container.innerHTML = `<div class="empty-state">ClawHub CLI 未安装，Skills 市场暂不可用<br><pre style="white-space:pre-wrap;text-align:left;max-height:180px;overflow:auto;">${diagText}</pre></div>`;
        }
      }
      return false;
    }

    if (data.bootstrap?.status === 'running') {
      if (container) {
        container.innerHTML = '<div class="empty-state pulse">首次启动，正在自动准备 ClawHub CLI...</div>';
      }
      return false;
    }

    if (container) {
      container.innerHTML = '<div class="empty-state pulse">正在安装 ClawHub CLI...</div>';
    }

    const setupRes = await fetch('/api/skills/setup', { method: 'POST' });
    const setupData = await setupRes.json();
    clawhubReady = !!setupData.success;

    if (container) {
      container.innerHTML = clawhubReady
        ? '<div class="empty-state">ClawHub 已就绪，开始搜索吧！</div>'
        : `<div class="empty-state">ClawHub CLI 安装失败：${formatClawHubError(setupData.error)}，请先在工具面板检查状态<br><pre style="white-space:pre-wrap;text-align:left;max-height:180px;overflow:auto;">${setupData.diagnostics || diagText}</pre></div>`;
    }

    return clawhubReady;
  } catch {
    clawhubReady = false;
    if (!autoSetup && container && !document.getElementById('skillSearch')?.value.trim()) {
      container.innerHTML = '<div class="empty-state">ClawHub 状态检测失败</div>';
    }
    return false;
  }
}

async function refreshInstallLifecycleState() {
  await Promise.allSettled([
    loadStatus(),
    loadToolStatus(),
    loadChannelsView(),
    loadInstalledSkills(),
    refreshClawHubAvailability(false)
  ]);
}

async function syncOpenClawLifecycleAfterDashboardOpen() {
  const lifecyclePromise = loadFullStatus().catch(() => loadStatus().catch(() => {}));
  loadToolStatus().catch(() => {});
  await lifecyclePromise;
  scheduleLifecycleBurstRefresh({ rounds: 3, intervalMs: 1500 });
}

function scheduleLifecycleBurstRefresh(options = {}) {
  const { rounds = 5, intervalMs = 1500 } = options;
  if (lifecycleBurstRefreshTimer) {
    clearInterval(lifecycleBurstRefreshTimer);
    lifecycleBurstRefreshTimer = null;
  }

  let remaining = Math.max(0, Number(rounds) || 0);
  if (!remaining) return;

  lifecycleBurstRefreshTimer = setInterval(async () => {
    remaining -= 1;
    await refreshInstallLifecycleState();
    if (remaining <= 0) {
      clearInterval(lifecycleBurstRefreshTimer);
      lifecycleBurstRefreshTimer = null;
    }
  }, Math.max(500, Number(intervalMs) || 1500));
}

function startInstallLifecyclePolling() {
  if (installLifecyclePollTimer) clearInterval(installLifecyclePollTimer);
  installLifecyclePollTimer = setInterval(() => {
    if (Date.now() < suspendHeavyPollingUntil) return;
    const toolsActive = document.getElementById('panel-tools')?.classList.contains('active');
    const logVisible = document.getElementById('installLog')?.style.display === 'block';
    if (toolsActive || logVisible) {
      loadStatus();
    }
  }, 10000);
}

function startToolStatusPolling() {
  if (toolStatusPollTimer) clearInterval(toolStatusPollTimer);
  toolStatusPollTimer = setInterval(() => {
    if (Date.now() < suspendHeavyPollingUntil) return;
    const toolsActive = document.getElementById('panel-tools')?.classList.contains('active');
    if (toolsActive) {
      loadToolStatus();
    }
  }, 12000);
}

// ========== 模型配置 ==========

function initModelForm() {
  const providerSelect = document.getElementById('modelProvider');
  const providerOptions = Object.entries(MODEL_PROVIDER_CATALOG)
    .map(([provider, meta]) => `<option value="${provider}">${meta.label}</option>`)
    .join('');

  providerSelect.innerHTML = providerOptions;
  providerSelect.value = 'deepseek';
  onProviderChange();
}

async function loadModels() {
  try {
    const res = await fetch('/api/models/installed');
    currentModelConfig = await res.json();
    renderModelCards();
  } catch (err) {
    console.error('加载模型列表失败:', err);
  }
}

function onProviderChange() {
  const provider = document.getElementById('modelProvider').value;
  const providerMeta = MODEL_PROVIDER_CATALOG[provider];
  const select = document.getElementById('modelVersion');
  select.innerHTML = '';

  providerMeta.models.forEach((model) => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    select.appendChild(option);
  });

  document.getElementById('providerDescription').textContent = providerMeta.description;
  const apiLink = document.getElementById('providerApiLink');
  apiLink.href = providerMeta.apiLink;
}

function toggleApiKeyVisibility() {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleBtn = document.getElementById('toggleApiKeyBtn');
  const visible = apiKeyInput.type === 'text';
  apiKeyInput.type = visible ? 'password' : 'text';
  toggleBtn.textContent = visible ? '👁' : '🙈';
}

async function addModel() {
  const provider = document.getElementById('modelProvider').value;
  const model = document.getElementById('modelVersion').value;
  const apiKey = document.getElementById('apiKey').value.trim();
  const msg = document.getElementById('modelSaveMsg');

  if (!apiKey) {
    alert('请输入 API Key');
    return;
  }

  msg.textContent = '⏳ 保存中...';
  msg.className = 'save-msg info';

  try {
    const res = await fetch('/api/models/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey, skipVerify: true })
    });
    const data = await res.json();

    if (data.success) {
      msg.textContent = '✓ 已保存并设为默认，可稍后再验证连接';
      msg.className = 'save-msg success';
      document.getElementById('apiKey').value = '';
      expandedModelProviders.add(provider);
      loadModels();
    } else {
      msg.textContent = `✗ ${data.error || '添加失败'}`;
      msg.className = 'save-msg error';
    }
    setTimeout(() => { msg.textContent = ''; }, 3500);
  } catch (err) {
    msg.textContent = `✗ 请求失败: ${err.message}`;
    msg.className = 'save-msg error';
    setTimeout(() => { msg.textContent = ''; }, 5000);
  }
}

function maskApiKey(key) {
  if (!key || key.length < 8) return '****...****';
  return key.substring(0, 4) + '****...****' + key.substring(key.length - 4);
}

function renderModelCards() {
  const list = document.getElementById('modelList');
  const models = currentModelConfig?.models || [];
  const primaryModel = currentModelConfig?.primary || '';
  document.getElementById('modelCountMeta').textContent = `${models.length} models`;

  if (!models.length) {
    list.innerHTML = '<div class="empty-state">还没有已安装的模型，请先在上方完成接入。</div>';
    return;
  }

  // 按 provider 分组
  const grouped = {};
  for (const m of models) {
    if (!grouped[m.provider]) grouped[m.provider] = [];
    grouped[m.provider].push(m);
  }

  list.innerHTML = Object.entries(grouped).map(([provider, providerModels]) => {
    const isExpanded = expandedModelProviders.has(provider);
    const defaultModel = providerModels.find(m => m.isDefault);
    const providerLabel = MODEL_PROVIDER_CATALOG[provider]?.shortLabel || provider;
    const isActive = defaultModel && (defaultModel.id === primaryModel || defaultModel.modelId === primaryModel);
    const maskedKey = maskApiKey(providerModels[0]?.apiKey || '');

    return `
      <div class="switch-card ${isExpanded ? 'expanded' : ''}">
        <div class="switch-card-header" onclick="toggleModelCard('${escHtml(provider)}')">
          <div class="switch-card-left">
            <span class="switch-triangle ${isExpanded ? 'open' : ''}">▶</span>
            <span class="switch-provider-name">${escHtml(providerLabel)}</span>
            <span class="switch-status ${isActive ? 'active' : ''}">
              <span class="switch-status-dot"></span>
              <span>${isActive ? '已应用' : '未应用'}</span>
            </span>
          </div>
          <div class="switch-card-right">
            <button class="switch-delete-btn" onclick="event.stopPropagation(); deleteModel('${escHtml(provider)}')" title="删除此 Provider">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
        <div class="switch-card-body ${isExpanded ? '' : 'collapsed'}">
          <div class="switch-api-key">
            <span class="switch-detail-label">API Key</span>
            <span class="switch-detail-value mono">${escHtml(maskedKey)}</span>
          </div>
          <div class="switch-version-list">
            ${providerModels.map(m => `
              <label class="switch-version-radio ${m.isDefault ? 'checked' : ''}">
                <input type="radio" name="switch-${escHtml(provider)}" value="${escHtml(m.id)}" ${m.isDefault ? 'checked' : ''}>
                <span class="switch-radio-dot"></span>
                <div class="switch-version-info">
                  <span class="switch-version-name">${escHtml(m.name || m.modelId)}</span>
                  <span class="switch-version-id">${escHtml(m.modelId)}</span>
                </div>
              </label>
            `).join('')}
          </div>
          <button class="btn btn-primary switch-apply-btn" onclick="event.stopPropagation(); applySwitchModel('${escHtml(provider)}')">
            切换并应用
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function getSelectedProviderModel(provider) {
  const selected = document.querySelector(`input[name="provider-${provider}"]:checked`);
  return selected ? selected.value : '';
}

async function switchModel(provider, modelId) {
  if (!modelId) {
    alert('请选择要切换的模型版本');
    return;
  }

  try {
    const res = await fetch('/api/models/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, modelId })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '切换失败');
    }
    loadModels();
  } catch (err) {
    alert('切换失败: ' + err.message);
  }
}

async function applySwitchModel(provider) {
  const selected = document.querySelector(`input[name="switch-${provider}"]:checked`);
  if (!selected) {
    alert('请选择要切换的模型版本');
    return;
  }
  const modelId = selected.value;

  try {
    const res = await fetch('/api/models/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, modelId })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '切换失败');
    }
    // 成功后局部刷新模型列表
    loadModels();
  } catch (err) {
    alert('切换失败: ' + err.message);
  }
}

async function deleteModel(provider) {
  if (!confirm(`确定删除 ${MODEL_PROVIDER_CATALOG[provider]?.shortLabel || provider} 配置吗？`)) {
    return;
  }

  try {
    const res = await fetch(`/api/models/${provider}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '删除失败');
    }
    expandedModelProviders.delete(provider);
    loadModels();
  } catch (err) {
    alert('删除失败: ' + err.message);
  }
}

function toggleModelCard(provider) {
  if (expandedModelProviders.has(provider)) {
    expandedModelProviders.delete(provider);
  } else {
    expandedModelProviders.add(provider);
  }
  renderModelCards();
}

function formatContextWindow(value) {
  if (!value) return '上下文未标注';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M 上下文`;
  if (value >= 1000) return `${Math.round(value / 1000)}K 上下文`;
  return `${value} 上下文`;
}

function updateProviderSelectionStyles(provider) {
  document.querySelectorAll(`label.version-radio input[name="provider-${provider}"]`).forEach((input) => {
    input.closest('.version-radio')?.classList.toggle('checked', input.checked);
  });
}

// ========== 消息通道 ==========

async function loadChannelsView() {
  try {
    const res = await fetch('/api/channels');
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || '加载失败');
    }

    availableChannels = Array.isArray(data.catalog) && data.catalog.length
      ? data.catalog
      : Object.values(CHANNEL_UI_CATALOG);
    connectedChannels = Array.isArray(data.connectedChannels) ? data.connectedChannels : [];

    if (!availableChannels.some((item) => item.key === currentChannelKey)) {
      currentChannelKey = availableChannels[0]?.key || 'wecom';
    }

    renderChannelSelector();
    fillChannelConfigPanel();
    renderConnectedChannels();
  } catch (err) {
    console.error('加载消息通道失败:', err);
    const container = document.getElementById('connectedChannels');
    if (container) {
      container.innerHTML = `<div class="empty-state">加载失败: ${escHtml(err.message)}</div>`;
    }
  }
}

function getCurrentChannelMeta() {
  return availableChannels.find((item) => item.key === currentChannelKey) || CHANNEL_UI_CATALOG[currentChannelKey] || CHANNEL_UI_CATALOG.wecom;
}

function getConnectedChannel(channelKey) {
  return connectedChannels.find((item) => item.key === channelKey);
}

function upsertConnectedChannelLocal(channel) {
  if (!channel?.key) return;
  const index = connectedChannels.findIndex((item) => item.key === channel.key);
  if (channel.configured || channel.connected || channel.enabled || channel.status === 'configured_pending_pairing' || channel.status === 'connected') {
    if (index >= 0) {
      connectedChannels[index] = channel;
    } else {
      connectedChannels.unshift(channel);
    }
  } else if (index >= 0) {
    connectedChannels.splice(index, 1);
  }
}

function removeConnectedChannelLocal(channelKey) {
  connectedChannels = connectedChannels.filter((item) => item.key !== channelKey);
}

function refreshChannelsViewLocal() {
  renderChannelSelector();
  fillChannelConfigPanel();
  renderConnectedChannels();
}

function getChannelStatusText(channel) {
  return CHANNEL_STATUS_TEXT[channel?.status] || '未配置';
}

function getChannelSaveSuccessText(channel) {
  const status = channel?.status || '';
  if (status === 'connected') return '✓ 已保存并应用，通道已接入';
  if (status === 'configured_pending_pairing') return '✓ 已添加并应用，当前状态为已配置，待配对';
  if (status === 'enabled') return '✓ 已添加并应用，通道已启用';
  if (status === 'configured') return '✓ 已保存，当前状态为已配置未启用';
  return '✓ 已保存';
}

function getChannelStatusClass(channel) {
  if (!channel) return '';
  if (channel.status === 'connected') return 'active';
  if (channel.status === 'enabled') return 'active';
  if (channel.status === 'configured_pending_pairing') return 'warn';
  if (channel.status === 'failed') return 'error';
  return '';
}

function renderChannelSelector() {
  const selector = document.getElementById('channelSelect');
  const hint = document.getElementById('channelSelectHint');
  if (!selector || !hint) return;

  selector.innerHTML = availableChannels.map((item) => {
    const channel = getConnectedChannel(item.key);
    const suffix = channel ? ` · ${getChannelStatusText(channel)}` : '';
    return `<option value="${escHtml(item.key)}" ${item.key === currentChannelKey ? 'selected' : ''}>${escHtml(item.name)}${escHtml(suffix)}</option>`;
  }).join('');
  hint.textContent = `当前可手动添加 ${availableChannels.length} 个消息通道`;
}

function selectChannel(channelKey) {
  currentChannelKey = channelKey;
  renderChannelSelector();
  fillChannelConfigPanel();
}

function getChannelCredentialState(channel, fieldKey) {
  return channel?.credentialState?.[fieldKey] || { hasValue: false, maskedValue: '' };
}

function renderChannelDynamicFields(meta, connected) {
  const container = document.getElementById('channelDynamicFields');
  if (!container) return;

  const credentialFields = Array.isArray(meta.schema?.credentials) ? meta.schema.credentials : [];
  const settingFields = Array.isArray(meta.schema?.settings) ? meta.schema.settings : [];

  const credentialsHtml = credentialFields.map((field) => {
    const inputType = field.secret ? 'password' : 'text';

    return `
      <div class="form-group channel-field-group ${field.secret ? 'channel-field-group-secret' : ''}">
        <div class="input-with-toggle ${field.secret ? 'has-toggle' : ''}">
          <input
            type="${inputType}"
            id="channelField-${escHtml(field.key)}"
            data-field-key="${escHtml(field.key)}"
            data-field-type="credential"
            placeholder="${escHtml(field.placeholder || field.label)}${field.required ? '' : '（选填）'}"
            aria-label="${escHtml(field.label)}"
          >
          ${field.secret ? `<button type="button" class="input-toggle" onclick="toggleChannelSecretVisibility('${escHtml(field.key)}', this)" aria-label="显示或隐藏密钥">👁</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const settingsHtml = settingFields.map((field) => {
    if (field.type === 'boolean') {
      return `
        <div class="form-group channel-setting-group channel-setting-group-boolean">
          <label class="checkbox-label">
            <input type="checkbox" id="channelSetting-${escHtml(field.key)}" data-field-key="${escHtml(field.key)}" data-field-type="setting">
            ${escHtml(field.label)}
          </label>
        </div>
      `;
    }

    return `
      <div class="form-group channel-setting-group">
        <input
          type="text"
          id="channelSetting-${escHtml(field.key)}"
          data-field-key="${escHtml(field.key)}"
          data-field-type="setting"
          placeholder="${escHtml(field.placeholder || field.label)}"
          aria-label="${escHtml(field.label)}"
        >
      </div>
    `;
  }).join('');

  container.innerHTML = `${credentialsHtml}${settingsHtml}`;

  credentialFields.forEach((field) => {
    const input = document.getElementById(`channelField-${field.key}`);
    if (!input) return;
    input.value = field.secret ? '' : (connected?.credentials?.[field.key] || '');
  });

  settingFields.forEach((field) => {
    const input = document.getElementById(`channelSetting-${field.key}`);
    if (!input) return;
    if (field.type === 'boolean') {
      input.checked = connected?.settings?.[field.key] ?? field.defaultValue ?? false;
    } else {
      input.value = connected?.settings?.[field.key] ?? field.defaultValue ?? '';
    }
  });
}

function fillChannelConfigPanel() {
  const meta = getCurrentChannelMeta();
  const connected = getConnectedChannel(currentChannelKey);
  const title = document.getElementById('channelConfigTitle');
  const badge = document.getElementById('channelSupportBadge');
  const footerNote = document.getElementById('channelFooterNote');
  const detailLink = document.getElementById('channelDetailLink');
  const pairingGuide = document.getElementById('channelPairingGuide');
  const pairingDesc = document.getElementById('channelPairingDesc');
  const pairingCommand = document.getElementById('channelPairingCommand');

  if (title) title.textContent = `${meta.name}通道配置`;
  if (badge) {
    badge.textContent = connected ? getChannelStatusText(connected) : '未配置';
    badge.className = `status-pill ${getChannelStatusClass(connected)}`.trim();
  }
  if (footerNote) {
    footerNote.textContent = meta.footerNote || '保存后会立即应用到当前通道配置。';
  }
  if (detailLink) {
    detailLink.href = meta.detailUrl || '/channel-docs.html';
    detailLink.textContent = meta.detailUrl ? '查看详情' : '详情即将补充';
    detailLink.classList.toggle('is-disabled', !meta.detailUrl);
    detailLink.setAttribute('aria-disabled', meta.detailUrl ? 'false' : 'true');
  }
  if (pairingGuide) {
    const showPairing = currentChannelKey === 'feishu' && !!connected?.configured;
    pairingGuide.style.display = showPairing ? 'block' : 'none';
  }
  if (pairingDesc) {
    pairingDesc.textContent = connected?.status === 'connected'
      ? '飞书通道已接入。如需重新配对，可继续使用下方命令。'
      : '保存并应用后，请去飞书里给机器人发送消息，获取 pairing code，再执行下方命令。';
  }
  if (pairingCommand) {
    pairingCommand.textContent = connected?.pairing?.command || `openclaw pairing approve ${currentChannelKey} CODE`;
  }

  renderChannelDynamicFields(meta, connected);
}

function toggleChannelSecretVisibility(fieldKey, btn) {
  const input = document.getElementById(`channelField-${fieldKey}`);
  if (!input || !btn) return;
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  btn.textContent = visible ? '🙈' : '👁';
  btn.classList.toggle('is-active', visible);
}

function getChannelSummaryText(channel) {
  const summaryFields = Array.isArray(channel?.summary?.credentials) ? channel.summary.credentials : [];
  if (!summaryFields.length) return '尚未保存凭证';
  return summaryFields.map((item) => `${item.label}：${item.value || '-'}`).join(' · ');
}

function getConnectedChannelExpanded(channelKey) {
  return !expandedConnectedChannels.has(channelKey);
}

function toggleConnectedChannelCard(channelKey) {
  if (expandedConnectedChannels.has(channelKey)) {
    expandedConnectedChannels.delete(channelKey);
  } else {
    expandedConnectedChannels.add(channelKey);
  }
  renderConnectedChannels();
}

function renderConnectedChannels() {
  const container = document.getElementById('connectedChannels');
  if (!container) return;

  if (!connectedChannels.length) {
    container.innerHTML = '<div class="empty-state">当前还没有已配置的消息通道</div>';
    return;
  }

  container.innerHTML = connectedChannels.map((channel) => `
    <div class="channel-connected-item ${getConnectedChannelExpanded(channel.key) ? 'is-expanded' : 'is-collapsed'}">
      <div class="channel-connected-header" onclick="toggleConnectedChannelCard('${escHtml(channel.key)}')">
        <div class="channel-connected-header-left">
          <span class="channel-fold-icon ${getConnectedChannelExpanded(channel.key) ? 'is-open' : ''}">▶</span>
          <span class="channel-connected-title">${escHtml(channel.displayName || channel.name)}</span>
        </div>
        <div class="channel-connected-header-right">
          <span class="channel-connected-status ${getChannelStatusClass(channel)}">
            <span class="channel-connected-status-dot"></span>
            <span>${escHtml(getChannelStatusText(channel))}</span>
          </span>
          <button class="channel-delete-icon" type="button" onclick="event.stopPropagation(); removeConnectedChannel('${escHtml(channel.key)}', this)" aria-label="删除通道" title="删除通道">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
      <div class="channel-connected-body ${getConnectedChannelExpanded(channel.key) ? '' : 'collapsed'}">
        <div class="channel-connected-main">
          <div class="channel-connected-meta">通道类型：${escHtml(channel.name)}</div>
          <div class="channel-connected-summary-list">
            ${(Array.isArray(channel?.summary?.credentials) && channel.summary.credentials.length
              ? channel.summary.credentials
              : [{ label: '状态', value: getChannelSummaryText(channel) }]).map((item) => `
                <div class="channel-summary-row">
                  <span class="channel-summary-key">${escHtml(item.label)}</span>
                  <span class="channel-summary-value">${escHtml(item.value || '-')}</span>
                </div>
              `).join('')}
          </div>
          ${channel.status === 'configured_pending_pairing' ? `
          <div class="channel-connected-note">
            <span>下一步：去飞书里给机器人发送消息，获取 pairing code。</span>
            <code>${escHtml(channel.pairing?.command || `openclaw pairing approve ${channel.key} CODE`)}</code>
          </div>
        ` : ''}
        ${channel.validation?.message ? `
          <div class="channel-connected-note">
            <span>校验信息：${escHtml(channel.validation.message)}</span>
          </div>
        ` : ''}
          <div class="channel-connected-actions">
            <button class="btn btn-secondary btn-sm channel-subtle-btn" type="button" onclick="event.stopPropagation(); editConnectedChannel('${escHtml(channel.key)}')">编辑配置</button>
            <button class="btn btn-secondary btn-sm channel-subtle-btn" type="button" onclick="event.stopPropagation(); toggleConnectedChannel('${escHtml(channel.key)}', ${channel.enabled ? 'false' : 'true'}, this)">${channel.enabled ? '停用' : '启用'}</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function editConnectedChannel(channelKey) {
  currentChannelKey = channelKey;
  renderChannelSelector();
  fillChannelConfigPanel();
  const firstField = document.querySelector('#channelDynamicFields input, #channelDynamicFields textarea, #channelDynamicFields select');
  firstField?.focus();
}

async function saveChannelManualConfig() {
  const msg = document.getElementById('channelSaveMsg');
  const meta = getCurrentChannelMeta();
  const existingChannel = getConnectedChannel(currentChannelKey);
  const credentials = {};
  const settings = {};
  const displayName = existingChannel?.displayName || meta.name;
  const missingFields = [];

  (meta.schema?.credentials || []).forEach((field) => {
    const input = document.getElementById(`channelField-${field.key}`);
    const value = input?.value.trim() || '';
    const state = getChannelCredentialState(getConnectedChannel(currentChannelKey), field.key);
    if (!field.secret || value || !state.hasValue) {
      credentials[field.key] = value;
    }
    if (field.required && !value) {
      if (!state.hasValue) {
        missingFields.push(field.label);
      }
    }
  });

  (meta.schema?.settings || []).forEach((field) => {
    const input = document.getElementById(`channelSetting-${field.key}`);
    if (!input) return;
    settings[field.key] = field.type === 'boolean' ? !!input.checked : input.value;
  });

  if (missingFields.length) {
    msg.textContent = `✗ 请填写${missingFields.join('、')}`;
    msg.className = 'save-msg error';
    return;
  }

  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(currentChannelKey)}/manual-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        credentials,
        settings
      })
    });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || '保存失败');
    }

    msg.textContent = getChannelSaveSuccessText(data.channel);
    msg.className = 'save-msg success';
    upsertConnectedChannelLocal(data.channel);
    refreshChannelsViewLocal();
    (meta.schema?.credentials || []).forEach((field) => {
      if (field.secret) {
        const input = document.getElementById(`channelField-${field.key}`);
        if (input) input.value = '';
      }
    });
  } catch (err) {
    msg.textContent = `✗ ${err.message}`;
    msg.className = 'save-msg error';
  }

  setTimeout(() => {
    msg.textContent = '';
  }, 3000);
}

async function toggleConnectedChannel(channelKey, enabled, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelKey)}/enabled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '状态更新失败');
    }
    upsertConnectedChannelLocal(data.channel);
    refreshChannelsViewLocal();
    if (btn) btn.disabled = false;
  } catch (err) {
    alert('状态更新失败: ' + err.message);
    if (btn) btn.disabled = false;
  }
}

async function removeConnectedChannel(channelKey, btn) {
  const channel = getConnectedChannel(channelKey);
  const name = channel?.displayName || channel?.name || channelKey;
  if (!confirm(`确定要移除「${name}」消息通道吗？`)) return;

  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelKey)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '移除失败');
    }

    removeConnectedChannelLocal(channelKey);
    if (currentChannelKey === channelKey) {
      refreshChannelsViewLocal();
    } else {
      renderConnectedChannels();
      renderChannelSelector();
    }
    if (btn) btn.disabled = false;
  } catch (err) {
    alert('移除失败: ' + err.message);
    if (btn) btn.disabled = false;
  }
}

function openQuickChannelModal(session) {
  document.getElementById('channelQuickConfigModal').style.display = 'flex';
  updateQuickChannelModal(session || {
    status: 'failed',
    message: '快捷配置暂未开放，请使用手动配置。',
    blockers: []
  }, true);
}

function closeQuickChannelModal() {
  document.getElementById('channelQuickConfigModal').style.display = 'none';
  stopQuickConfigPolling();
  activeQuickConfigSessionId = '';
}

function beginQuickConfigPolling() {
  stopQuickConfigPolling();
}

function stopQuickConfigPolling() {
  if (quickConfigPollTimer) {
    window.clearInterval(quickConfigPollTimer);
    quickConfigPollTimer = null;
  }
}

async function refreshQuickChannelStatus(showMessage = true) {
  if (showMessage) {
    updateQuickChannelModal({
      status: 'failed',
      message: '快捷配置暂未开放，请使用手动配置。',
      blockers: [{
        title: '当前版本说明',
        detail: '飞书扫码自动配置主线已暂停，本轮只交付手动添加闭环。'
      }]
    }, false);
  }
}

function updateQuickChannelModal(session, updateQrImage = false) {
  document.getElementById('quickChannelName').textContent = getCurrentChannelMeta().name;
  document.getElementById('quickChannelStatusText').textContent = session.message || '快捷配置暂未开放';
  const badge = document.getElementById('quickChannelStatusBadge');
  const confirmBtn = document.getElementById('quickChannelConfirmBtn');
  const placeholder = document.getElementById('quickChannelQrPlaceholder');
  const image = document.getElementById('quickChannelQrImage');
  const blockers = document.getElementById('quickChannelBlockers');
  const qrMeta = document.getElementById('quickChannelQrMeta');
  const qrContent = session.qrCode?.content || '';
  const qrImageUrl = resolveQuickQrImageUrl(session.qrCode || {});

  const statusLabelMap = {
    idle: '空闲',
    pending_scan: '等待扫码',
    scanned: '已扫码',
    authorized: '已授权',
    provisioning: '配置中',
    configured_pending_pairing: '待配对',
    failed: '暂未开放'
  };

  badge.textContent = statusLabelMap[session.status] || '处理中';
  badge.className = `status-pill ${session.status === 'configured_pending_pairing' ? 'warn' : ''} ${session.status === 'failed' ? 'error' : ''}`.trim();
  if (session.status === 'configured_pending_pairing') {
    badge.classList.add('warn');
  } else if (session.status === 'failed') {
    badge.classList.add('error');
  } else if (session.status === 'connected') {
    badge.classList.add('active');
  }
  confirmBtn.disabled = false;

  if (updateQrImage && qrImageUrl) {
    image.onerror = () => {
      image.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.textContent = '当前版本不展示自动配置二维码。';
    };
    image.src = qrImageUrl;
    image.style.display = 'block';
    placeholder.style.display = 'none';
    placeholder.textContent = '当前版本不展示自动配置二维码。';
  } else if (updateQrImage) {
    image.removeAttribute('src');
    image.style.display = 'none';
    placeholder.style.display = 'flex';
    placeholder.textContent = '当前版本不展示自动配置二维码。';
  }

  if (qrMeta) {
    const qrImageSource = session.qrCode?.imageUrl || '';
    qrMeta.innerHTML = (qrContent || qrImageSource)
      ? [
          `<div>二维码来源：${escHtml(session.qrCode?.source || 'real_payload')}</div>`,
          qrContent ? `<div>真实扫码内容：${escHtml(truncateMiddle(qrContent, 96))}</div>` : '',
          qrImageSource ? `<div>二维码图片地址：${escHtml(truncateMiddle(qrImageSource, 96))}</div>` : '',
          session.qrCode?.callbackUrl ? `<div>回调地址：${escHtml(session.qrCode.callbackUrl)}</div>` : ''
        ].filter(Boolean).join('')
      : '<div>当前版本优先支持手动配置，不再展示自动配置二维码。</div>';
  }

  if (blockers) {
    blockers.innerHTML = Array.isArray(session.blockers) && session.blockers.length
      ? [
          `<div>${escHtml(session.blockerTitle || '当前卡点')}</div>`,
          ...session.blockers.map((item) => `<div>${escHtml(item.title)}：${escHtml(item.detail)}</div>`)
        ].join('')
      : '<div>当前版本请改用手动配置。</div>';
  }

  confirmBtn.textContent = '知道了';
}

async function copyChannelPairingCommand() {
  const text = document.getElementById('channelPairingCommand')?.textContent || '';
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt('复制下面的命令：', text);
  }
}

async function refreshChannelAfterQuickConfigSuccess() {
  await loadChannelsView();
}

async function confirmQuickChannelConfig() {
  closeQuickChannelModal();
}

async function loadFeishuConfig() {
  currentChannelKey = 'feishu';
  await loadChannelsView();
}

async function saveFeishuConfig() {
  currentChannelKey = 'feishu';
  await saveChannelManualConfig();
}

// ========== 安装 ==========

async function startInstall() {
  const btn = document.getElementById('btnInstall');
  const log = document.getElementById('installLog');
  const steps = document.getElementById('installSteps');

  installActionInFlight = true;
  btn.disabled = true;
  btn.textContent = '安装中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/install', { method: 'POST' });
    await readSseJsonStream(res, async (data) => {
      if (data.type === 'progress' && data.steps) {
        renderSteps(steps, data.steps);
      }
      if (data.type === 'done') {
        installActionInFlight = false;
        const status = await loadStatus();
        await refreshInstallLifecycleState();
        if (status?.openclawInstalled) {
          const lifecycle = status.openclawLifecycle || {};
          if (data.success) {
            btn.textContent = '✓ 安装完成';
            btn.style.background = 'var(--success)';
          } else if (data.partial || lifecycle.stage === 'init_incomplete' || lifecycle.stage === 'gateway_incomplete') {
            btn.textContent = lifecycle.stage === 'gateway_incomplete' ? '已安装，Gateway 待补完成' : '已安装，待补完成';
            btn.style.background = 'var(--warning, #f59e0b)';
            scheduleLifecycleBurstRefresh();
          } else {
            btn.textContent = '安装失败，重试';
            btn.disabled = false;
          }
        } else {
          btn.textContent = '安装失败，重试';
          btn.disabled = false;
        }
      }
    });
  } catch (err) {
    installActionInFlight = false;
    btn.textContent = '安装失败，重试';
    btn.disabled = false;
    steps.innerHTML += `<div class="install-step"><span class="icon">✗</span><span class="detail">${err.message}</span></div>`;
  }
}

async function startUpdate() {
  const btn = document.getElementById('btnUpdate');
  const log = document.getElementById('installLog');
  const steps = document.getElementById('installSteps');

  updateActionInFlight = true;
  btn.disabled = true;
  btn.textContent = '更新中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/update', { method: 'POST' });
    await readSseJsonStream(res, async (data) => {
      if (data.type === 'progress' && data.steps) {
        renderSteps(steps, data.steps);
      }
      if (data.type === 'done') {
        updateActionInFlight = false;
        if (data.success && data.skipped === 'already_latest') {
          btn.textContent = data.latestVersion ? `已是最新版本 (${data.latestVersion})` : '已是最新版本';
        } else {
          btn.textContent = data.success ? '✓ 更新完成' : '更新失败';
        }
        btn.disabled = false;
        await refreshInstallLifecycleState();
        scheduleLifecycleBurstRefresh();
      }
    });
  } catch (err) {
    updateActionInFlight = false;
    btn.textContent = '更新失败';
    btn.disabled = false;
  }
}

// ========== 卸载 ==========

function confirmUninstall() {
  document.getElementById('uninstallModal').style.display = 'flex';
}

function closeUninstallModal() {
  document.getElementById('uninstallModal').style.display = 'none';
}

async function startUninstall() {
  closeUninstallModal();

  const btn = document.getElementById('btnUninstall');
  const log = document.getElementById('installLog');
  const steps = document.getElementById('installSteps');

  uninstallActionInFlight = true;
  btn.disabled = true;
  btn.textContent = '卸载中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/uninstall', { method: 'POST' });
    await readSseJsonStream(res, async (data) => {
      if (data.type === 'progress' && data.steps) {
        renderSteps(steps, data.steps);
      }
      if (data.type === 'done') {
        uninstallActionInFlight = false;
        const status = await loadStatus();
        await refreshInstallLifecycleState();
        scheduleLifecycleBurstRefresh();
        if (data.success && status && status.openclawInstalled === false) {
          btn.textContent = '✓ 已卸载';
          btn.style.background = 'var(--error)';
        } else {
          btn.textContent = '卸载失败，重试';
          btn.disabled = false;
        }
      }
    });
  } catch (err) {
    uninstallActionInFlight = false;
    btn.textContent = '卸载失败，重试';
    btn.disabled = false;
    steps.innerHTML += `<div class="install-step"><span class="icon">✗</span><span class="detail">${err.message}</span></div>`;
  }
}

function compactStepDetail(step) {
  const detail = String(step?.detail || '').trim();
  if (!detail) return '';
  const singleLine = detail.replace(/\s+/g, ' ').trim();
  if (step?.name === 'verify' || step?.name === 'install_openclaw_stream') {
    return singleLine.length > 220 ? `${singleLine.slice(0, 219)}…` : singleLine;
  }
  return detail;
}

function renderSteps(container, steps) {
  const icons = { done: '✓', running: '⏳', error: '✗', waiting: '○' };
  container.innerHTML = steps.map(s => `
    <div class="install-step">
      <span class="icon">${icons[s.status] || '○'}</span>
      <span class="name">${getStepLabel(s.name)}</span>
      <span class="detail">${compactStepDetail(s)}</span>
    </div>
  `).join('');
  container.parentElement?.scrollTo({ top: container.parentElement.scrollHeight, behavior: 'smooth' });
}

// ========== 网关 ==========

async function restartGateway() {
  const msg = document.getElementById('restartMsg');
  msg.textContent = '重启中...';
  msg.className = 'save-msg';

  try {
    const res = await fetch('/api/gateway/restart', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      msg.textContent = data.degraded
        ? `✓ 网关已恢复可用${data.note ? `；${data.note}` : ''}`
        : '✓ 网关已重启';
      msg.className = 'save-msg success';
      await refreshInstallLifecycleState();
      scheduleLifecycleBurstRefresh({ rounds: 6, intervalMs: 1500 });
    } else {
      msg.textContent = `✗ ${data.error}`;
      msg.className = 'save-msg error';
    }
  } catch (err) {
    msg.textContent = '✗ 重启失败';
    msg.className = 'save-msg error';
  }
  setTimeout(() => { msg.textContent = ''; }, 5000);
}

async function refreshGatewayStatus() {
  const button = document.getElementById('btnRefreshGatewayStatus');
  const gatewayInfo = document.getElementById('gatewayInfo');
  const restoreButton = setButtonBusy(button, '刷新中...', '刷新');
  const previousText = gatewayInfo?.textContent || '';

  if (gatewayInfo) {
    gatewayInfo.textContent = '检测中...';
    gatewayInfo.className = 'value';
  }

  try {
    await loadStatus();
    await loadToolStatus();
  } catch {
    if (gatewayInfo && previousText) {
      gatewayInfo.textContent = previousText;
    }
  } finally {
    restoreButton();
  }
}

// ========== 工具面板 ==========

async function loadToolStatus() {
  try {
    const res = await fetch('/api/tools/status');
    const data = await res.json();
    latestToolStatus = data;

    // Node.js
    const nodeEl = document.getElementById('toolNodeStatus');
    const nodeBtn = document.getElementById('btnUninstallNode');
    const nodeStatus = data.node?.uninstallStatus || (data.node?.installed ? 'removable' : (data.runtimeNode?.installed ? 'runtime_only' : 'absent'));
    if (data.node?.installed) {
      const versionText = data.node.version || '未知版本';
      const pathText = data.node.path || '未知路径';
      const nodeSummary = `${versionText} (${pathText})`;
      const diagnostics = data.node?.diagnostics || {};
      const extraDiag = (nodeStatus !== 'removable' && (diagnostics.runtimePath || diagnostics.nodeSource || diagnostics.runtimeSource))
        ? `；诊断：nodeSource=${diagnostics.nodeSource || 'unknown'} / runtimeSource=${diagnostics.runtimeSource || 'unknown'}${diagnostics.runtimePath ? ` / runtime=${diagnostics.runtimePath}` : ''}`
        : '';
      if (nodeStatus === 'removable') {
        nodeEl.textContent = nodeSummary;
        nodeEl.className = 'tool-status ok';
      } else {
        nodeEl.textContent = `${nodeSummary}；${data.node.uninstallHint || '当前会话内不可自动卸载'}${extraDiag}`;
        nodeEl.className = 'tool-status warn';
      }
    } else if (nodeStatus === 'runtime_only' && data.runtimeNode?.installed) {
      nodeEl.textContent = data.node?.uninstallHint || `未检测到可单独管理的系统 Node.js；当前 ClawBox 运行时为 ${data.runtimeNode.version} (${data.runtimeNode.path})`;
      nodeEl.className = 'tool-status warn';
    } else if (nodeStatus === 'runtime_not_isolated') {
      nodeEl.textContent = data.node?.uninstallHint || `当前运行时尚未与系统 Node.js 隔离；运行时 ${data.runtimeNode?.version || '未知版本'} (${data.runtimeNode?.path || '未知路径'})`;
      nodeEl.className = 'tool-status warn';
    } else {
      nodeEl.textContent = data.node?.uninstallHint || '未安装';
      nodeEl.className = 'tool-status err';
    }
    if (nodeBtn) {
      nodeBtn.disabled = nodeStatus !== 'removable';
      nodeBtn.title = getNodeUninstallButtonTitle(data);
    }

    // ClawHub
    const clawhubEl = document.getElementById('toolClawhubStatus');
    if (data.clawhub?.installed) {
      clawhubEl.textContent = data.clawhub.path ? `已安装 (${data.clawhub.path})` : '已安装';
      if (data.clawhub?.bootstrap?.detail) clawhubEl.textContent += ` · ${data.clawhub.bootstrap.detail}`;
      clawhubEl.className = 'tool-status ok';
    } else {
      clawhubEl.textContent = '未安装';
      clawhubEl.className = 'tool-status err';
    }

    if (data.clawhub?.bootstrap?.status === 'running') {
      clawhubEl.textContent = data.clawhub.bootstrap.detail || '正在自动准备 ClawHub CLI...';
      clawhubEl.className = 'tool-status warn';
    } else if (data.clawhub?.bootstrap?.status === 'error') {
      clawhubEl.textContent = `自动准备失败：${data.clawhub.bootstrap.error || '未知错误'}`;
      clawhubEl.className = 'tool-status err';
    }

    // OpenClaw
    const openclawEl = document.getElementById('toolOpenclawStatus');
    if (data.openclaw?.installed) {
      const lifecycle = data.openclaw.lifecycle || {};
      const extra = data.openclaw.path ? ` (${data.openclaw.path})` : '';
      const gatewayFailureHint = lifecycle.stage === 'gateway_incomplete'
        ? (lifecycle.gatewayFailure === 'permission'
          ? '；Gateway 服务注册需要管理员权限'
          : lifecycle.gatewayFailure === 'timeout'
            ? '；Gateway 启动超时'
            : '')
        : '';
      openclawEl.textContent = `${data.openclaw.version || '已安装'}${extra}${lifecycle.title ? `；${lifecycle.title}` : ''}${lifecycle.detail ? `；${lifecycle.detail}` : ''}${gatewayFailureHint}${data.openclaw.summary ? `；${data.openclaw.summary}` : ''}`;
      openclawEl.className = `tool-status ${getOpenClawLifecycleTone(lifecycle)}`;
    } else {
      openclawEl.textContent = data.openclaw?.summary || '未安装';
      openclawEl.className = 'tool-status err';
    }
  } catch (err) {
    console.error('加载工具状态失败:', err);
  }
}

function showToolLog(msg, type = 'info') {
  const log = document.getElementById('toolLog');
  const content = document.getElementById('toolLogContent');
  log.style.display = 'block';
  content.innerHTML = `<div class="install-step">
    <span class="icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : '⏳'}</span>
    <span class="detail">${msg}</span>
  </div>`;
}
function showToolLogHtml(html) {
  const log = document.getElementById('toolLog');
  const content = document.getElementById('toolLogContent');
  log.style.display = 'block';
  content.innerHTML = html;
}

function formatRepairList(title, items, field = 'path', formatter = null) {
  if (!items || !items.length) return '';
  return [
    '<div class="tool-report-block">',
    `  <div class="tool-report-title">${escHtml(title)}</div>`,
    '  <ul class="tool-report-list">',
    ...items.map((item) => {
      if (typeof formatter === 'function') return formatter(item);
      const label = item?.[field] || item?.name || '-';
      const extra = item?.error ? ` · ${escHtml(item.error)}` : '';
      return `    <li><code>${escHtml(label)}</code>${extra}</li>`;
    }),
    '  </ul>',
    '</div>'
  ].join('\n');
}

function formatRepairEnvironmentReport(report) {
  const recommendation = report?.recommendation || {};
  const failedDeletes = Array.isArray(report?.failedDeletes) ? report.failedDeletes : [];
  const failedDeleteStats = {
    busy: failedDeletes.filter((item) => item.category === 'busy').length,
    permission: failedDeletes.filter((item) => item.category === 'permission').length,
    missing: failedDeletes.filter((item) => item.category === 'missing').length,
    unknown: failedDeletes.filter((item) => item.category === 'unknown').length
  };
  const skippedProcesses = Array.isArray(report?.skippedProcesses) ? report.skippedProcesses : [];
  const summaryRows = [
    ['扫描到的进程', String(report?.scannedProcesses?.length || 0)],
    ['成功结束的进程', String(report?.killedProcesses?.length || 0)],
    ['已跳过的进程', String(skippedProcesses.length || 0)],
    ['发现的路径', String(report?.foundPaths?.length || 0)],
    ['实际删除的路径', String(report?.deletedPaths?.length || 0)],
    ['触发 rename-then-delete', String(report?.summary?.renameAttempted || 0)],
    ['rename 成功', String(report?.summary?.renameSucceeded || 0)],
    ['rename 后删除成功', String(report?.summary?.renameDeleteSucceeded || 0)],
    ['仅扫描未删除', String(report?.scanOnlyPaths?.length || 0)],
    ['删除失败：被占用 / 带锁', String(failedDeleteStats.busy)],
    ['删除失败：权限不足', String(failedDeleteStats.permission)],
    ['删除失败：路径已不存在', String(failedDeleteStats.missing)],
    ['删除失败：未知', String(failedDeleteStats.unknown)],
    ['结束失败的进程', String(report?.processKillFailures?.length || 0)]
  ];

  return [
    `<div class="tool-report ${recommendation.level || 'info'}">`,
    '  <div class="install-step">',
    `    <span class="icon">${recommendation.retryOpenClawInstall ? '✓' : '⚠'}</span>`,
    `    <span class="detail"><strong>建议：</strong>${escHtml(recommendation.message || '修复完成')}</span>`,
    '  </div>',
    '  <div class="tool-report-summary">',
    ...summaryRows.map(([label, value]) => `    <div class="tool-report-summary-row"><span>${escHtml(label)}</span><strong>${escHtml(value)}</strong></div>`),
    '  </div>',
    formatRepairList('结束的进程', report?.killedProcesses, 'name', (item) => `    <li><code>${escHtml(item?.name || '-')}</code>${item?.pid ? ` (PID ${escHtml(String(item.pid))})` : ''}${item?.reasons?.length ? ` · ${escHtml(item.reasons.join('；'))}` : ''}</li>`),
    formatRepairList('已跳过的进程', skippedProcesses, 'name', (item) => `    <li><code>${escHtml(item?.name || '-')}</code>${item?.pid ? ` (PID ${escHtml(String(item.pid))})` : ''}${item?.skipReason ? ` · 已跳过：${escHtml(item.skipReason)}` : ''}${item?.reasons?.length ? ` · ${escHtml(item.reasons.join('；'))}` : ''}</li>`),
    formatRepairList('结束失败的进程', report?.processKillFailures, 'name', (item) => `    <li><code>${escHtml(item?.name || '-')}</code>${item?.pid ? ` (PID ${escHtml(String(item.pid))})` : ''}${item?.reasons?.length ? ` · ${escHtml(item.reasons.join('；'))}` : ''}${item?.error ? ` · ${escHtml(item.error)}` : ''}</li>`),
    formatRepairList('删除失败分类', failedDeletes, 'path', (item) => `    <li><code>${escHtml(item?.originalPath || item?.path || '-')}</code> · ${escHtml(item?.label || '删除失败')} · ${escHtml(item?.message || item?.error || '')}${item?.renameAttempted ? ` · rename-then-delete: 已触发 / ${item?.renameSucceeded ? 'rename 成功' : 'rename 失败'} / ${item?.finalDeleteSucceeded ? '最终删除成功' : '最终删除失败'}` : ''}${item?.likelyLockerTypes?.length ? ` · 可能占用者: ${escHtml(item.likelyLockerTypes.join(' / '))}` : ''}${item?.suggestedActions?.length ? ` · 建议: ${escHtml(item.suggestedActions.join('；'))}` : ''}</li>`),
    formatRepairList('发现的路径', report?.foundPaths, 'path', (item) => `    <li><code>${escHtml(item?.path || '-')}</code> · ${escHtml(item?.tool || '-')} · ${escHtml(item?.source || '-')}${item?.safeToDelete ? ' · 默认会处理' : ' · 仅扫描未删除'}</li>`),
    formatRepairList('实际删除的路径', report?.deletedPaths, 'path', (item) => `    <li><code>${escHtml(item?.originalPath || item?.path || '-')}</code> · ${escHtml(item?.tool || '-')} · ${escHtml(item?.kind || '-')}${item?.renameAttempted ? ` · rename-then-delete 成功（当前删除目标：${escHtml(item?.path || '-')})` : ''}</li>`),
    formatRepairList('仅扫描未删除的路径', report?.scanOnlyPaths, 'path', (item) => `    <li><code>${escHtml(item?.path || '-')}</code> · ${escHtml(item?.tool || '-')} · ${escHtml(item?.kind || '-')}${item?.preserveReason ? ` · ${escHtml(item.preserveReason)}` : ''}</li>`),
    '  <div class="tool-report-block">',
    '    <div class="tool-report-title">详细日志</div>',
    `    <pre class="tool-report-log">${escHtml((report?.logs || []).join('\n') || '无详细日志')}</pre>`,
    '  </div>',
    '</div>'
  ].filter(Boolean).join('\n');
}

async function repairEnvironment() {
  const btn = document.getElementById('btnRepairEnvironment');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '清场中...';
  }
  showToolLog('正在扫描并清理 Windows 安装残留...');
  try {
    const res = await fetch('/api/tools/repair-environment', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || (!data.success && !data.report)) {
      throw new Error(data.error || '修复安装环境失败');
    }
    showToolLogHtml(formatRepairEnvironmentReport(data.report));
    await refreshInstallLifecycleState();
  } catch (err) {
    showToolLog(`修复失败: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '安装前清场';
    }
  }
}

async function uninstallNode() {
  const confirmMessage = getNodeUninstallConfirmMessage(latestToolStatus);
  if (!latestToolStatus?.node?.installed) {
    showToolLog(confirmMessage, 'error');
    return;
  }
  if (!confirm(confirmMessage)) return;
  showToolLog('正在检查 Node.js 卸载条件...');
  try {
    const res = await fetch('/api/tools/uninstall-node', { method: 'POST' });
    const data = await res.json();
    showToolLog(data.success ? data.message : `卸载失败: ${data.error}`, data.success ? 'success' : 'error');
    // 无论成功失败都刷新状态（有些卸载方式不会报错但需要验证）
    setTimeout(loadToolStatus, 1000);
  } catch (err) {
    showToolLog(`卸载失败: ${err.message}`, 'error');
  }
}

async function uninstallClawhub() {
  if (!confirm('确定要卸载 ClawHub CLI 吗？Skills 市场将不可用。')) return;
  showToolLog('正在卸载 ClawHub CLI...');
  try {
    const res = await fetch('/api/tools/uninstall-clawhub', { method: 'POST' });
    const data = await res.json();
    showToolLog(data.success ? data.message : `卸载失败: ${data.error}`, data.success ? 'success' : 'error');
    if (data.success) clawhubReady = false;
    setTimeout(loadToolStatus, 1000);
  } catch (err) {
    showToolLog(`卸载失败: ${err.message}`, 'error');
  }
}

async function uninstallOpenclawTool() {
  if (!confirm('卸载将删除 OpenClaw 及所有配置文件、工作区数据。建议先备份 ~/.openclaw/ 目录。确定要卸载吗？')) return;
  showToolLog('正在卸载 OpenClaw...');
  try {
    const res = await fetch('/api/uninstall', { method: 'POST' });
    await readSseJsonStream(res, async (data) => {
      if (data.type === 'progress' && data.detail) {
        showToolLog(data.detail);
      }
      if (data.type === 'done') {
        showToolLog(data.success ? 'OpenClaw 已卸载' : '卸载失败', data.success ? 'success' : 'error');
        await refreshInstallLifecycleState();
      }
    });
  } catch (err) {
    showToolLog(`卸载失败: ${err.message}`, 'error');
  }
}

async function openOpenclawDashboard() {
  const button = document.getElementById('btnOpenClawDashboard');
  const restoreButton = setButtonBusy(button, '正在打开...', '打开OpenClaw面板');
  const startedAt = performance.now();
  suspendHeavyPollingUntil = Date.now() + 8000;

  if (false) { // Disabled: every reopen must revalidate the Dashboard URL via the backend.
    showToolLog(`复用最近一次可用的 OpenClaw Dashboard 地址...（cache ${(performance.now() - startedAt).toFixed(0)}ms）`, 'success');
    const beforeOpenAt = performance.now();
    void lastSuccessfulDashboardUrl;
    showToolLog(`window.open 已调用（${(performance.now() - beforeOpenAt).toFixed(0)}ms）`, 'success');
    syncOpenClawLifecycleAfterDashboardOpen().catch(() => {});
    restoreButton();
    return;
  }

  showToolLog('正在获取 OpenClaw Dashboard 地址...');

  try {
    const fetchStartedAt = performance.now();
    const res = await fetch('/api/tools/openclaw-dashboard');
    const responseAt = performance.now();
    const data = await res.json();
    const parsedAt = performance.now();
    showToolLog(`Dashboard 接口返回：network ${(responseAt - fetchStartedAt).toFixed(0)}ms / json ${(parsedAt - responseAt).toFixed(0)}ms`, 'success');

    if (data.success) {
      const portHint = data.port ? `（port ${data.port}）` : '';
      showToolLog(`Dashboard 地址已就绪 ${portHint}`.trim(), 'success');
      lastSuccessfulDashboardUrl = data.url;
      lastSuccessfulDashboardAt = Date.now();
      const beforeOpenAt = performance.now();
      window.open(data.url, '_blank');
      showToolLog(`window.open 已调用（${(performance.now() - beforeOpenAt).toFixed(0)}ms / total ${(performance.now() - startedAt).toFixed(0)}ms）`, 'success');
      syncOpenClawLifecycleAfterDashboardOpen().catch(() => {});
      return;
    }

    const message = data.error || '无法获取 Dashboard 地址';
    showToolLog(message, 'error');
    alert(message);
  } catch (err) {
    const message = `获取失败: ${err.message}`;
    showToolLog(message, 'error');
    alert(message);
  } finally {
    restoreButton();
  }
}

async function uninstallClawBox() {
  if (!confirm('确定要卸载 ClawBox 吗？程序将立即退出并删除自身。')) return;
  try {
    const res = await fetch('/api/tools/uninstall-clawbox', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('ClawBox 正在卸载，页面即将关闭...');
      window.close();
    } else {
      alert(`卸载失败: ${data.error}`);
    }
  } catch (err) {
    // 连接断开说明进程已退出，卸载成功
    alert('ClawBox 已卸载');
    window.close();
  }
}

// ========== Skills ==========

let searchDebounce = null;
let lastSearchTime = 0; // 本地限流：3秒内不允许重复搜索
let installLifecyclePollTimer = null;
let toolStatusPollTimer = null;
let lifecycleBurstRefreshTimer = null;
let installActionInFlight = false;
let updateActionInFlight = false;
let uninstallActionInFlight = false;

function onSkillSearchKeyup(event) {
  if (event.key === 'Enter') {
    searchSkills();
    return;
  }
  // 防抖：输入停止 600ms 后再搜索
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => searchSkills(), 600);
}

async function checkClawHub() {
  return refreshClawHubAvailability(true);
}

async function searchSkills(event) {
  if (event && event.key !== 'Enter') return;
  const query = document.getElementById('skillSearch').value.trim();
  if (!query) return;

  const normalizedQuery = query.toLowerCase();
  const now = Date.now();
  const container = document.getElementById('skillResults');
  const cached = skillSearchCache.get(normalizedQuery);
  if (cached && (now - cached.time) < 15000) {
    container.innerHTML = cached.html;
    return;
  }

  // 本地限流：3秒内不允许重复搜索
  if (now - lastSearchTime < 3000 && skillSearchInFlight !== normalizedQuery) {
    return;
  }
  lastSearchTime = now;

  // 确保 clawhub 可用
  if (!clawhubReady) {
    container.innerHTML = '<div class="empty-state pulse">正在准备 ClawHub...</div>';
    await checkClawHub();
    if (!clawhubReady) return;
  }

  if (skillSearchInFlight === normalizedQuery) {
    return;
  }
  skillSearchInFlight = normalizedQuery;
  container.innerHTML = '<div class="empty-state pulse">搜索中...</div>';

  try {
    const res = await fetch(`/api/skills/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<div class="empty-state">${data.error || '搜索失败，请稍后再试'}</div>`;
      return;
    }
    if (!data.output) {
      container.innerHTML = `<div class="empty-state">未找到相关 Skills</div>`;
      skillSearchCache.set(normalizedQuery, { time: Date.now(), html: container.innerHTML });
      return;
    }

    // 解析 clawhub search 输出
    // 格式: slug  Description  (score)
    const lines = data.output.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      container.innerHTML = `<div class="empty-state">未找到相关 Skills</div>`;
      return;
    }

    container.innerHTML = lines.map(line => {
      // 按多个空格分割，去掉末尾的 (score)
      const cleaned = line.replace(/\s*\([\d.]+\)\s*$/, '');
      const parts = cleaned.split(/\s{2,}/);
      const slug = parts[0]?.trim() || line;
      const desc = parts.slice(1).join(' ').trim() || '';
      return `
        <div class="skill-result-item">
          <div class="skill-result-info">
            <div class="skill-result-name">${slug}</div>
            <div class="skill-result-desc">${desc}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="installSkill('${slug}', this)">
            安装
          </button>
        </div>
      `;
    }).join('');
    skillSearchCache.set(normalizedQuery, { time: Date.now(), html: container.innerHTML });
  } catch (err) {
    container.innerHTML = `<div class="empty-state">搜索失败: ${err.message}</div>`;
  } finally {
    if (skillSearchInFlight === normalizedQuery) {
      skillSearchInFlight = null;
    }
  }
}

async function installSkill(slug, btn) {
  // 弹出腾讯云风格确认弹窗
  openSkillInstallModal(slug, btn);
}

// ========== 已安装模型 ==========

async function loadInstalledModels() {
  loadModels();
}

async function switchInstalledModel(fullId, el) {
  if (el) el.disabled = true;

  try {
    const res = await fetch('/api/models/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: fullId })
    });
    const data = await res.json();

    if (data.success) {
      loadModels();
    } else {
      alert('切换失败: ' + (data.error || '未知错误'));
      if (el) el.disabled = false;
    }
  } catch (err) {
    alert('切换失败: ' + err.message);
    if (el) el.disabled = false;
  }
}

// ========== 已安装 Skills ==========

async function loadInstalledSkills() {
  const container = document.getElementById('installedSkills');
  container.innerHTML = '<div class="empty-state">加载中...</div>';

  try {
    const res = await fetch('/api/skills/installed');
    const data = await res.json();

    if (!data.success || !data.skills || data.skills.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无已安装的 Skills</div>';
      return;
    }

    container.innerHTML = data.skills.map(skill => `
      <div class="skill-card">
        <div class="skill-info">
          <h4>${escHtml(skill.name)}</h4>
          <p>${escHtml(skill.description || skill.slug)}</p>
        </div>
        <button class="btn btn-sm btn-uninstall" onclick="uninstallSkill('${escHtml(skill.slug)}', this)">
          卸载
        </button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
  }
}

async function uninstallSkill(slug, btn) {
  if (!confirm(`确定要卸载 Skill「${slug}」吗？`)) return;

  btn.disabled = true;
  btn.textContent = '卸载中...';

  try {
    const res = await fetch('/api/skills/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug })
    });
    const data = await res.json();

    if (data.success) {
      loadInstalledSkills();
    } else {
      alert('卸载失败: ' + (data.error || '未知错误'));
      btn.disabled = false;
      btn.textContent = '卸载';
    }
  } catch (err) {
    alert('卸载失败: ' + err.message);
    btn.disabled = false;
    btn.textContent = '卸载';
  }
}

// ========== Skill 安装弹窗 ==========

let pendingInstallSlug = '';
let pendingInstallBtn = null;

function openSkillInstallModal(slug, btn) {
  pendingInstallSlug = slug;
  pendingInstallBtn = btn;
  if (btn) btn.disabled = true;
  document.getElementById('modalSkillSlug').textContent = slug;
  document.getElementById('modalSkillDesc').textContent = btn.closest('.skill-result-item')?.querySelector('.skill-result-desc')?.textContent || btn.closest('.skill-card')?.querySelector('.skill-info p')?.textContent || 'ClawHub Skill';
  document.getElementById('skillInstallModal').style.display = 'flex';
  // 重置状态
  document.getElementById('modalInstallProgress').style.display = 'none';
  document.getElementById('modalActions').style.display = 'flex';
  document.getElementById('modalInstallBtn').disabled = false;
  document.getElementById('modalInstallBtn').textContent = '确认安装';
}

function closeSkillInstallModal() {
  document.getElementById('skillInstallModal').style.display = 'none';
  if (pendingInstallBtn && pendingInstallBtn.textContent !== '✓ 已安装') {
    pendingInstallBtn.disabled = false;
  }
  pendingInstallSlug = '';
  pendingInstallBtn = null;
}

async function confirmInstallSkill() {
  const btn = document.getElementById('modalInstallBtn');
  const progressDiv = document.getElementById('modalInstallModal');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  btn.disabled = true;
  btn.textContent = '安装中...';

  // 显示进度条
  document.getElementById('modalInstallProgress').style.display = 'flex';
  progressFill.style.width = '30%';
  progressText.textContent = '正在下载...';

  try {
    const res = await fetch('/api/skills/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: pendingInstallSlug })
    });
    const data = await res.json();

    progressFill.style.width = '100%';

    if (data.success) {
      progressText.textContent = '✓ 安装成功';
      progressFill.style.background = 'var(--success)';
      btn.textContent = '已完成';

      // 更新搜索结果中的按钮
      if (pendingInstallBtn) {
        pendingInstallBtn.textContent = '✓ 已安装';
        pendingInstallBtn.style.color = 'var(--success)';
        pendingInstallBtn.disabled = true;
      }

      // 局部更新搜索结果按钮，并异步刷新已安装列表
      setTimeout(() => {
        closeSkillInstallModal();
        loadInstalledSkills();
      }, 600);
    } else {
      progressText.textContent = `✗ ${data.error || '安装失败'}`;
      progressFill.style.background = 'var(--error)';
      btn.textContent = '重试';
      btn.disabled = false;
    }
  } catch (err) {
    progressFill.style.width = '100%';
    progressFill.style.background = 'var(--error)';
    progressText.textContent = `✗ ${err.message}`;
    btn.textContent = '重试';
    btn.disabled = false;
  }
}

// 工具函数
function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
