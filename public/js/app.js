// ClawBox 前端逻辑

// ========== 初始化 ==========

let currentModelConfig = null;
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
    description: '腾讯混元提供多尺寸中文大模型，支持对话、推理等场景。',
    apiLink: 'https://console.cloud.tencent.com/hunyuan/start',
    models: [
      { id: 'hunyuan-turbos-latest', name: 'Hunyuan Turbos Latest' },
      { id: 'hunyuan-t1-latest', name: 'Hunyuan T1 Latest' },
      { id: 'hunyuan-turbo-latest', name: 'Hunyuan Turbo Latest' },
      { id: 'hunyuan-lite-latest', name: 'Hunyuan Lite Latest' }
    ]
  },
  qianwen: {
    label: '阿里千问 Qwen',
    shortLabel: '千问',
    description: '阿里千问提供高性能中文对话与代码模型，适合通用与开发场景。',
    apiLink: 'https://dashscope.console.aliyun.com/',
    models: [
      { id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus' },
      { id: 'qwen-max-latest', name: 'Qwen Max Latest' },
      { id: 'qwen-plus-latest', name: 'Qwen Plus Latest' },
      { id: 'qwen-turbo-latest', name: 'Qwen Turbo Latest' },
      { id: 'qwen3-coder-plus', name: 'Qwen 3 Coder Plus' }
    ]
  },
  minimax: {
    label: 'MiniMax',
    shortLabel: 'MiniMax',
    description: 'MiniMax 提供高性价比的对话与多模态模型，适合大规模应用。',
    apiLink: 'https://api.minimax.chat/',
    models: [
      { id: 'minimax-m2-7', name: 'MiniMax M2.7' },
      { id: 'minimax-m2-5', name: 'MiniMax M2.5' },
      { id: 'minimax-m2-1', name: 'MiniMax M2.1' }
    ]
  },
  moonshot: {
    label: 'Moonshot Kimi',
    shortLabel: 'Kimi',
    description: 'Moonshot Kimi 提供长上下文推理模型，适合深度分析与复杂任务。',
    apiLink: 'https://platform.moonshot.cn/',
    models: [
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking' },
      { id: 'kimi-k2-5', name: 'Kimi K2.5' },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K' }
    ]
  },
  zhipu: {
    label: '智谱 GLM',
    shortLabel: '智谱',
    description: '智谱 GLM 提供高性能中文通用模型，适合对话、推理与知识问答。',
    apiLink: 'https://open.bigmodel.cn/',
    models: [
      { id: 'glm-5-turbo', name: 'GLM-5-Turbo' },
      { id: 'glm-5', name: 'GLM-5' },
      { id: 'glm-4-7', name: 'GLM-4.7' },
      { id: 'glm-4-6', name: 'GLM-4.6' }
    ]
  },
  doubao: {
    label: '火山引擎 豆包',
    shortLabel: '豆包',
    description: '火山引擎豆包提供多尺寸对话模型，适合高并发与企业级应用。',
    apiLink: 'https://console.volcengine.com/ark/region:ark+cn-beijing/overview',
    models: [
      { id: 'doubao-seed-2-0-pro', name: '豆包 Seed 2.0 Pro' },
      { id: 'doubao-seed-1-8', name: '豆包 Seed 1.8' },
      { id: 'doubao-seed-1-6', name: '豆包 Seed 1.6' },
      { id: 'doubao-seed-1-6-flash', name: '豆包 Seed 1.6 Flash' }
    ]
  },
  ernie: {
    label: '百度文心 ERNIE',
    shortLabel: '文心',
    description: '百度文心提供中文理解与生成模型，适合对话、创作与知识场景。',
    apiLink: 'https://console.baidu.com/qianfan/modelcenter/model',
    models: [
      { id: 'ernie-5-0', name: 'ERNIE 5.0' },
      { id: 'ernie-x1-1', name: 'ERNIE X1.1' },
      { id: 'ernie-4-5-turbo', name: 'ERNIE 4.5 Turbo' }
    ]
  }
};

let expandedModelProviders = new Set();
const CHANNEL_UI_CATALOG = {
  feishu: {
    key: 'feishu',
    name: '飞书',
    description: '飞书消息通道'
  }
};
let availableChannels = [];
let connectedChannels = [];
let currentChannelKey = 'feishu';
let currentChannelConfigMode = 'quick';
let activeQuickConfigSessionId = '';
let quickConfigPollTimer = null;
const CHANNEL_STATUS_TEXT = {
  unconfigured: '未配置',
  configuring: '配置中',
  configured_pending_pairing: '已配置，待配对',
  connected: '已接入',
  failed: '配置失败'
};

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

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadStatus();
  initModelForm();
  loadModels();
  loadChannelsView();
  loadInstalledSkills();

  // 点击 Skills 标签时检查 clawhub
  document.querySelector('[data-tab="skills"]')?.addEventListener('click', () => {
    if (!clawhubReady) checkClawHub();
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

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    document.getElementById('osInfo').textContent = data.os;
    document.getElementById('nodeInfo').textContent = data.nodeOk
      ? `✓ ${data.nodeVersion}`
      : `✗ ${data.nodeVersion}`;
    document.getElementById('nodeInfo').className = `value ${data.nodeOk ? 'ok' : 'err'}`;

    if (data.openclawInstalled) {
      document.getElementById('openclawInfo').textContent = `✓ ${data.openclawVersion || '已安装'}`;
      document.getElementById('openclawInfo').className = 'value ok';
      document.getElementById('btnInstall').style.display = 'none';
      document.getElementById('btnUpdate').style.display = 'inline-block';
      document.getElementById('btnUninstall').style.display = 'inline-block';
    } else {
      document.getElementById('openclawInfo').textContent = '✗ 未安装';
      document.getElementById('openclawInfo').className = 'value err';
      document.getElementById('btnInstall').style.display = 'inline-block';
      document.getElementById('btnUpdate').style.display = 'none';
      document.getElementById('btnUninstall').style.display = 'none';
    }

    document.getElementById('gatewayInfo').textContent = data.gatewayRunning ? '● 运行中' : '○ 未运行';
    document.getElementById('gatewayInfo').className = `value ${data.gatewayRunning ? 'ok' : 'warn'}`;

    // Root 提示
    if (data.isRoot) {
      document.getElementById('rootHint').style.display = 'flex';
      document.getElementById('sudoHint').style.display = 'none';
    } else {
      document.getElementById('rootHint').style.display = 'none';
      document.getElementById('sudoHint').style.display = 'flex';
    }
  } catch {
    document.getElementById('osInfo').textContent = '检测失败';
  }
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

  // 步骤1：验证 API Key
  msg.textContent = '⏳ 验证中...';
  msg.className = 'save-msg info';

  try {
    const verifyRes = await fetch('/api/models/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey })
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.success) {
      msg.textContent = `✗ 验证失败: ${verifyData.error || 'API Key 无效'}`;
      msg.className = 'save-msg error';
      setTimeout(() => { msg.textContent = ''; }, 5000);
      return;
    }

    // 步骤2：验证通过，添加模型
    msg.textContent = '⏳ 验证通过，正在添加...';
    msg.className = 'save-msg info';

    const res = await fetch('/api/models/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey })
    });
    const data = await res.json();

    if (data.success) {
      msg.textContent = '✓ 已添加并设为默认';
      msg.className = 'save-msg success';
      document.getElementById('apiKey').value = '';
      expandedModelProviders.add(provider);
      loadModels();
    } else {
      msg.textContent = `✗ ${data.error || '添加失败'}`;
      msg.className = 'save-msg error';
    }
    setTimeout(() => { msg.textContent = ''; }, 3000);
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
            <span class="switch-status ${isActive ? 'active' : ''}">${isActive ? '🟢应用中' : '🔴未应用'}</span>
          </div>
          <div class="switch-card-right">
            <button class="switch-delete-btn" onclick="event.stopPropagation(); deleteModel('${escHtml(provider)}')" title="删除此 Provider">🗑</button>
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
    // 成功后刷新页面
    window.location.reload();
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
      currentChannelKey = availableChannels[0]?.key || 'feishu';
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
  return availableChannels.find((item) => item.key === currentChannelKey) || CHANNEL_UI_CATALOG[currentChannelKey] || CHANNEL_UI_CATALOG.feishu;
}

function getConnectedChannel(channelKey) {
  return connectedChannels.find((item) => item.key === channelKey);
}

function getChannelStatusText(channel) {
  return CHANNEL_STATUS_TEXT[channel?.status] || '未配置';
}

function getChannelStatusClass(channel) {
  if (!channel) return '';
  if (channel.status === 'connected') return 'active';
  if (channel.status === 'configured_pending_pairing') return 'warn';
  if (channel.status === 'failed') return 'error';
  return '';
}

function renderChannelSelector() {
  const selector = document.getElementById('channelSelector');
  const countMeta = document.getElementById('channelCountMeta');
  if (!selector || !countMeta) return;

  countMeta.textContent = `${availableChannels.length} 个可用通道`;
  selector.innerHTML = availableChannels.map((item) => {
    const channel = getConnectedChannel(item.key);
    return `
      <button class="channel-option ${item.key === currentChannelKey ? 'active' : ''}" type="button" onclick="selectChannel('${escHtml(item.key)}')">
        <span class="channel-option-name">${escHtml(item.name)}</span>
        <span class="channel-option-meta">${escHtml(getChannelStatusText(channel))}</span>
      </button>
    `;
  }).join('');
}

function selectChannel(channelKey) {
  currentChannelKey = channelKey;
  renderChannelSelector();
  fillChannelConfigPanel();
}

function fillChannelConfigPanel() {
  const meta = getCurrentChannelMeta();
  const connected = getConnectedChannel(currentChannelKey);
  const title = document.getElementById('channelConfigTitle');
  const badge = document.getElementById('channelSupportBadge');
  const appIdInput = document.getElementById('channelAppId');
  const appSecretInput = document.getElementById('channelAppSecret');
  const secretHint = document.getElementById('channelSecretHint');
  const streamingInput = document.getElementById('channelStreaming');
  const quickHint = document.getElementById('channelQuickHint');
  const quickBlockers = document.getElementById('channelQuickBlockers');
  const pairingCommand = document.getElementById('channelPairingCommand');

  if (title) title.textContent = `${meta.name}通道配置`;
  if (badge) {
    badge.textContent = connected ? getChannelStatusText(connected) : '未配置';
    badge.className = `status-pill ${getChannelStatusClass(connected)}`.trim();
  }
  if (quickHint) {
    quickHint.textContent = meta.quickConfigEnabled
      ? `当前默认通道为${meta.name}。快捷配置的目标是自动完成应用配置并写入凭证，完成后进入“已配置，待配对”。`
      : `当前默认通道为${meta.name}。该通道当前只支持手动配置。`;
  }
  if (quickBlockers) {
    quickBlockers.innerHTML = meta.quickConfigEnabled
      ? [
          '自动化阶段：',
          '1. 扫码发起授权。',
          '2. 确认授权后自动推进配置。',
          '3. 凭证写入完成后进入已配置，待配对。',
          '4. pairing approve 本轮仍需手动执行。'
        ].map((item) => `<div>${escHtml(item)}</div>`).join('')
      : [
          '当前卡点：',
          '1. 该通道未启用快捷配置。',
          '2. 请改用手动配置。'
        ].map((item) => `<div>${escHtml(item)}</div>`).join('');
  }
  if (pairingCommand) {
    pairingCommand.textContent = connected?.pairing?.command || `openclaw pairing approve ${currentChannelKey} CODE`;
  }

  if (appIdInput) appIdInput.value = connected?.settings?.appId || '';
  if (appSecretInput) {
    appSecretInput.value = '';
    appSecretInput.placeholder = connected?.settings?.hasAppSecret ? '已设置，重新输入可更新' : '输入 App Secret';
  }
  if (secretHint) {
    secretHint.textContent = connected?.settings?.hasAppSecret
      ? `当前已保存：${connected.summary?.appSecretMasked || '已脱敏'}`
      : '未设置 App Secret';
  }
  if (streamingInput) streamingInput.checked = connected?.settings?.streaming ?? true;

  switchChannelConfigMode(currentChannelConfigMode);
}

function switchChannelConfigMode(mode) {
  currentChannelConfigMode = mode;
  document.getElementById('channelQuickTab')?.classList.toggle('active', mode === 'quick');
  document.getElementById('channelManualTab')?.classList.toggle('active', mode === 'manual');
  document.getElementById('channelQuickPane')?.classList.toggle('active', mode === 'quick');
  document.getElementById('channelManualPane')?.classList.toggle('active', mode === 'manual');
}

function renderConnectedChannels() {
  const container = document.getElementById('connectedChannels');
  if (!container) return;

  if (!connectedChannels.length) {
    container.innerHTML = '<div class="empty-state">当前还没有已配置的消息通道</div>';
    return;
  }

  container.innerHTML = connectedChannels.map((channel) => `
    <div class="channel-connected-item">
      <div class="channel-connected-main">
        <div class="channel-connected-title-row">
          <div class="channel-connected-title">${escHtml(channel.name)}</div>
          <span class="status-pill ${getChannelStatusClass(channel)}">${escHtml(getChannelStatusText(channel))}</span>
        </div>
        <div class="channel-connected-meta">接入方式：${channel.accessMode === 'manual' ? '手动配置' : '快捷配置'}</div>
        <div class="channel-connected-summary">
          <span>App ID：${escHtml(channel.summary?.appId || '-')}</span>
          <span>App Secret：${escHtml(channel.summary?.appSecretMasked || '-')}</span>
        </div>
        ${channel.status === 'configured_pending_pairing' ? `
          <div class="channel-connected-summary">
            <span>下一步：去飞书里给机器人发送消息，获取 pairing code</span>
            <span>命令：${escHtml(channel.pairing?.command || `openclaw pairing approve ${channel.key} CODE`)}</span>
          </div>
        ` : ''}
      </div>
      <div class="channel-connected-actions">
        <button class="btn btn-secondary btn-sm" type="button" onclick="editConnectedChannel('${escHtml(channel.key)}')">编辑配置</button>
        <button class="btn btn-danger btn-sm" type="button" onclick="removeConnectedChannel('${escHtml(channel.key)}', this)">移除接入</button>
      </div>
    </div>
  `).join('');
}

function editConnectedChannel(channelKey) {
  currentChannelKey = channelKey;
  renderChannelSelector();
  fillChannelConfigPanel();
  switchChannelConfigMode('manual');
  document.getElementById('channelAppId')?.focus();
}

async function saveChannelManualConfig() {
  const appId = document.getElementById('channelAppId').value.trim();
  const appSecret = document.getElementById('channelAppSecret').value.trim();
  const streaming = document.getElementById('channelStreaming').checked;
  const msg = document.getElementById('channelSaveMsg');

  if (!appId || !appSecret) {
    msg.textContent = '✗ 请填写 App ID 和 App Secret';
    msg.className = 'save-msg error';
    return;
  }

  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(currentChannelKey)}/manual-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, appSecret, streaming })
    });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || '保存失败');
    }

    msg.textContent = '✓ 已保存，当前状态为已配置，待配对';
    msg.className = 'save-msg success';
    document.getElementById('channelAppSecret').value = '';
    await loadChannelsView();
    switchChannelConfigMode('manual');
  } catch (err) {
    msg.textContent = `✗ ${err.message}`;
    msg.className = 'save-msg error';
  }

  setTimeout(() => {
    msg.textContent = '';
  }, 3000);
}

async function removeConnectedChannel(channelKey, btn) {
  if (!confirm(`确定要移除「${channelKey}」消息通道吗？`)) return;

  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(channelKey)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '移除失败');
    }

    if (currentChannelKey === channelKey) {
      fillChannelConfigPanel();
    }
    await loadChannelsView();
  } catch (err) {
    alert('移除失败: ' + err.message);
    if (btn) btn.disabled = false;
  }
}

async function startQuickChannelConfig() {
  const btn = document.getElementById('channelQuickStartBtn');
  const msg = document.getElementById('channelQuickMsg');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '准备中...';
  }

  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(currentChannelKey)}/quick-config/start`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '快捷配置启动失败');
    }

    activeQuickConfigSessionId = data.session.sessionId;
    openQuickChannelModal(data.session);
    beginQuickConfigPolling();

    msg.textContent = '✓ 已打开快捷配置流程';
    msg.className = 'save-msg success';
  } catch (err) {
    msg.textContent = `✗ ${err.message}`;
    msg.className = 'save-msg error';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '开始快捷配置';
    }
    setTimeout(() => {
      msg.textContent = '';
    }, 4000);
  }
}

function openQuickChannelModal(session) {
  document.getElementById('channelQuickConfigModal').style.display = 'flex';
  updateQuickChannelModal(session, true);
}

function closeQuickChannelModal() {
  document.getElementById('channelQuickConfigModal').style.display = 'none';
  stopQuickConfigPolling();
  activeQuickConfigSessionId = '';
}

function beginQuickConfigPolling() {
  stopQuickConfigPolling();
  quickConfigPollTimer = window.setInterval(() => {
    refreshQuickChannelStatus(false);
  }, 3000);
}

function stopQuickConfigPolling() {
  if (quickConfigPollTimer) {
    window.clearInterval(quickConfigPollTimer);
    quickConfigPollTimer = null;
  }
}

async function refreshQuickChannelStatus(showMessage = true) {
  if (!activeQuickConfigSessionId) return;

  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(currentChannelKey)}/quick-config/${encodeURIComponent(activeQuickConfigSessionId)}`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || '获取状态失败');
    }
    updateQuickChannelModal(data.session, showMessage);
  } catch (err) {
    if (showMessage) {
      alert('刷新状态失败: ' + err.message);
    }
  }
}

function updateQuickChannelModal(session, updateQrImage = false) {
  document.getElementById('quickChannelName').textContent = getCurrentChannelMeta().name;
  document.getElementById('quickChannelStatusText').textContent = session.message || '等待扫码';
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
    failed: '配置失败'
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
      placeholder.textContent = '已拿到真实二维码来源，但当前环境无法加载图片。';
    };
    image.src = qrImageUrl;
    image.style.display = 'block';
    placeholder.style.display = 'none';
    placeholder.textContent = '二维码准备中...';
  } else if (updateQrImage) {
    image.removeAttribute('src');
    image.style.display = 'none';
    placeholder.style.display = 'flex';
    placeholder.textContent = '当前未拿到真实二维码来源，不再展示占位二维码。';
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
      : '<div>当前没有真实二维码来源，界面不会再渲染假二维码。</div>';
  }

  if (blockers) {
    blockers.innerHTML = Array.isArray(session.blockers) && session.blockers.length
      ? [
          `<div>${escHtml(session.blockerTitle || '当前卡点')}</div>`,
          ...session.blockers.map((item) => `<div>${escHtml(item.title)}：${escHtml(item.detail)}</div>`)
        ].join('')
      : '<div>当前没有额外卡点说明。</div>';
  }

  if (session.status === 'configured_pending_pairing') {
    confirmBtn.textContent = '已配置，待配对';
    confirmBtn.disabled = true;
    stopQuickConfigPolling();
    loadChannelsView();
  } else if (!qrContent && !session.qrCode?.imageUrl) {
    confirmBtn.textContent = '等待真实二维码来源';
    confirmBtn.disabled = true;
  } else if (session.status === 'failed') {
    confirmBtn.textContent = '重新开始前先查看缺口';
  } else {
    confirmBtn.textContent = '推进到下一步';
  }
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
  switchChannelConfigMode('quick');
}

async function confirmQuickChannelConfig() {
  if (!activeQuickConfigSessionId) return;

  const btn = document.getElementById('quickChannelConfirmBtn');
  btn.disabled = true;
  btn.textContent = '处理中...';

  try {
    const res = await fetch(`/api/channels/${encodeURIComponent(currentChannelKey)}/quick-config/${encodeURIComponent(activeQuickConfigSessionId)}/complete`, {
      method: 'POST'
    });
    const data = await res.json();

    if (!data.success) {
      updateQuickChannelModal(data.session || {
        status: 'failed',
        message: data.error || '快捷配置未完成',
        blockers: []
      });
      throw new Error(data.error || '快捷配置未完成');
    }

    updateQuickChannelModal(data.session, false);
    if (data.session?.status === 'configured_pending_pairing') {
      await refreshChannelAfterQuickConfigSuccess();
    }
  } catch (err) {
    document.getElementById('quickChannelStatusText').textContent = err.message;
    if (!btn.disabled) {
      btn.textContent = '推进到下一步';
    }
  } finally {
    if (document.getElementById('quickChannelConfirmBtn')?.disabled === false) {
      document.getElementById('quickChannelConfirmBtn').textContent = '推进到下一步';
    }
  }
}

async function loadFeishuConfig() {
  currentChannelKey = 'feishu';
  await loadChannelsView();
  switchChannelConfigMode('manual');
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

  btn.disabled = true;
  btn.textContent = '安装中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/install', { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' && data.steps) {
            renderSteps(steps, data.steps);
          }
          if (data.type === 'done') {
            if (data.success) {
              btn.textContent = '✓ 安装完成';
              btn.style.background = 'var(--success)';
              loadStatus();
            } else {
              btn.textContent = '安装失败，重试';
              btn.disabled = false;
            }
          }
        }
      }
    }
  } catch (err) {
    btn.textContent = '安装失败，重试';
    btn.disabled = false;
    steps.innerHTML += `<div class="install-step"><span class="icon">✗</span><span class="detail">${err.message}</span></div>`;
  }
}

async function startUpdate() {
  const btn = document.getElementById('btnUpdate');
  const log = document.getElementById('installLog');
  const steps = document.getElementById('installSteps');

  btn.disabled = true;
  btn.textContent = '更新中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/update', { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' && data.steps) {
            renderSteps(steps, data.steps);
          }
          if (data.type === 'done') {
            btn.textContent = data.success ? '✓ 更新完成' : '更新失败';
            btn.disabled = false;
            loadStatus();
          }
        }
      }
    }
  } catch (err) {
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

  btn.disabled = true;
  btn.textContent = '卸载中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/uninstall', { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' && data.steps) {
            renderSteps(steps, data.steps);
          }
          if (data.type === 'done') {
            if (data.success) {
              btn.textContent = '✓ 已卸载';
              btn.style.background = 'var(--error)';
            } else {
              btn.textContent = '卸载失败，重试';
              btn.disabled = false;
            }
            loadStatus();
          }
        }
      }
    }
  } catch (err) {
    btn.textContent = '卸载失败，重试';
    btn.disabled = false;
    steps.innerHTML += `<div class="install-step"><span class="icon">✗</span><span class="detail">${err.message}</span></div>`;
  }
}

function renderSteps(container, steps) {
  const icons = { done: '✓', running: '⏳', error: '✗', waiting: '○' };
  container.innerHTML = steps.map(s => `
    <div class="install-step">
      <span class="icon">${icons[s.status] || '○'}</span>
      <span class="name">${s.name}</span>
      <span class="detail">${s.detail || ''}</span>
    </div>
  `).join('');
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
      msg.textContent = '✓ 网关已重启';
      msg.className = 'save-msg success';
      setTimeout(() => {
        loadStatus();
      }, 1500);
    } else {
      msg.textContent = `✗ ${data.error}`;
      msg.className = 'save-msg error';
    }
  } catch (err) {
    msg.textContent = '✗ 重启失败';
    msg.className = 'save-msg error';
  }
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

// ========== 工具面板 ==========

async function loadToolStatus() {
  try {
    const res = await fetch('/api/tools/status');
    const data = await res.json();

    // Node.js
    const nodeEl = document.getElementById('toolNodeStatus');
    if (data.node?.installed) {
      nodeEl.textContent = `${data.node.version} (${data.node.path})`;
      nodeEl.className = 'tool-status ok';
    } else {
      nodeEl.textContent = '未安装';
      nodeEl.className = 'tool-status err';
    }

    // ClawHub
    const clawhubEl = document.getElementById('toolClawhubStatus');
    if (data.clawhub?.installed) {
      clawhubEl.textContent = `已安装 (${data.clawhub.path})`;
      clawhubEl.className = 'tool-status ok';
    } else {
      clawhubEl.textContent = '未安装';
      clawhubEl.className = 'tool-status err';
    }

    // OpenClaw
    const openclawEl = document.getElementById('toolOpenclawStatus');
    if (data.openclaw?.installed) {
      openclawEl.textContent = data.openclaw.version || '已安装';
      openclawEl.className = 'tool-status ok';
    } else {
      openclawEl.textContent = '未安装';
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

async function uninstallNode() {
  if (!confirm('确定要卸载 Node.js 吗？卸载后 ClawBox 和 OpenClaw 都将无法运行。')) return;
  showToolLog('正在卸载 Node.js...');
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
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' && data.detail) {
            showToolLog(data.detail);
          }
          if (data.type === 'done') {
            showToolLog(data.success ? 'OpenClaw 已卸载' : '卸载失败', data.success ? 'success' : 'error');
            loadToolStatus();
            loadStatus();
          }
        }
      }
    }
  } catch (err) {
    showToolLog(`卸载失败: ${err.message}`, 'error');
  }
}

async function openOpenclawDashboard() {
  try {
    const res = await fetch('/api/tools/openclaw-dashboard');
    const data = await res.json();
    if (data.success) {
      window.open(data.url, '_blank');
    } else {
      alert(data.error || '无法获取 Dashboard 地址');
    }
  } catch (err) {
    alert(`获取失败: ${err.message}`);
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

let clawhubReady = false;
let searchDebounce = null;
let lastSearchTime = 0; // 本地限流：3秒内不允许重复搜索

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
  try {
    const res = await fetch('/api/skills/status');
    const data = await res.json();
    if (data.available) {
      clawhubReady = true;
      return;
    }
    // clawhub 不可用，尝试安装
    const container = document.getElementById('skillResults');
    container.innerHTML = '<div class="empty-state pulse">正在安装 ClawHub CLI...</div>';
    const setupRes = await fetch('/api/skills/setup', { method: 'POST' });
    const setupData = await setupRes.json();
    if (setupData.success) {
      clawhubReady = true;
      container.innerHTML = '<div class="empty-state">ClawHub 已就绪，开始搜索吧！</div>';
    } else {
      container.innerHTML = '<div class="empty-state">ClawHub 安装失败，请手动运行: npm install -g clawhub</div>';
    }
  } catch {
    clawhubReady = false;
  }
}

async function searchSkills(event) {
  if (event && event.key !== 'Enter') return;
  const query = document.getElementById('skillSearch').value.trim();
  if (!query) return;

  // 本地限流：3秒内不允许重复搜索
  const now = Date.now();
  if (now - lastSearchTime < 3000) {
    return;
  }
  lastSearchTime = now;

  const container = document.getElementById('skillResults');

  // 确保 clawhub 可用
  if (!clawhubReady) {
    container.innerHTML = '<div class="empty-state pulse">正在准备 ClawHub...</div>';
    await checkClawHub();
    if (!clawhubReady) return;
  }

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
  } catch (err) {
    container.innerHTML = `<div class="empty-state">搜索失败: ${err.message}</div>`;
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
      }

      // 刷新已安装列表
      setTimeout(() => {
        loadInstalledSkills();
        closeSkillInstallModal();
      }, 1200);
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
