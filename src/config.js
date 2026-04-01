const fs = require('fs');
const path = require('path');
const os = require('os');

// OpenClaw 配置文件路径
const CONFIG_DIR = path.join(os.homedir(), '.openclaw');
const CONFIG_FILE = path.join(CONFIG_DIR, 'openclaw.json');

const DEFAULT_PROVIDER_CONFIG = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    api: 'openai-completions',
    models: {
      'deepseek-chat': { reasoning: false, contextWindow: 64000, maxTokens: 8192 },
      'deepseek-reasoner': { reasoning: true, contextWindow: 64000, maxTokens: 8192 }
    }
  },
  mimo: {
    baseUrl: 'https://api.xiaomimimo.com/v1',
    api: 'openai-completions',
    models: {
      'mimo-v2-pro': { reasoning: true, contextWindow: 1048576, maxTokens: 32000 },
      'mimo-v2-omni': { reasoning: true, contextWindow: 1048576, maxTokens: 32000 },
      'mimo-v2-flash': { reasoning: false, contextWindow: 524288, maxTokens: 16000 }
    }
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    api: 'openai-completions',
    models: {
      'gpt-5.4': { reasoning: true, contextWindow: 1048576, maxTokens: 128000 },
      'gpt-5.1': { reasoning: true, contextWindow: 400000, maxTokens: 128000 },
      'gpt-5': { reasoning: true, contextWindow: 400000, maxTokens: 128000 },
      'gpt-5-mini': { reasoning: true, contextWindow: 400000, maxTokens: 128000 },
      'gpt-5-nano': { reasoning: true, contextWindow: 400000, maxTokens: 128000 },
      'gpt-4.1': { reasoning: false, contextWindow: 1048576, maxTokens: 32768 },
      'gpt-4o': { reasoning: false, contextWindow: 128000, maxTokens: 16384 },
      'gpt-4o-mini': { reasoning: false, contextWindow: 128000, maxTokens: 16384 },
      'o1': { reasoning: true, contextWindow: 200000, maxTokens: 100000 },
      'o3': { reasoning: true, contextWindow: 200000, maxTokens: 100000 },
      'o3-mini': { reasoning: true, contextWindow: 200000, maxTokens: 100000 },
      'o4-mini': { reasoning: true, contextWindow: 200000, maxTokens: 100000 }
    }
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    api: 'openai-completions',
    models: {
      'gemini-2.0-flash-lite': { reasoning: false, contextWindow: 1048576, maxTokens: 8192 },
      'gemini-2.0-flash': { reasoning: false, contextWindow: 1048576, maxTokens: 8192 },
      'gemini-2.5-flash-lite': { reasoning: false, contextWindow: 1048576, maxTokens: 8192 },
      'gemini-2.5-flash': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      'gemini-flash-lite-latest': { reasoning: false, contextWindow: 1048576, maxTokens: 8192 },
      'gemini-flash-latest': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      'gemini-pro-latest': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      'gemini-2.5-pro': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      'gemini-2.5-flash-image': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      'gemini-3-pro-image-preview': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      'gemini-3.1-flash-lite-preview': { reasoning: false, contextWindow: 1048576, maxTokens: 8192 },
      'gemini-3.1-flash-image-preview': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      'gemini-3.1-pro-preview': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      'gemini-3-flash-preview': { reasoning: true, contextWindow: 1048576, maxTokens: 65536 }
    }
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/',
    api: 'openai-completions',
    models: {
      'claude-opus-4-6': { reasoning: true, contextWindow: 1000000, maxTokens: 128000 },
      'claude-sonnet-4-6': { reasoning: true, contextWindow: 1000000, maxTokens: 64000 },
      'claude-haiku-4-5': { reasoning: true, contextWindow: 200000, maxTokens: 64000 },
      'claude-sonnet-4-5': { reasoning: true, contextWindow: 1000000, maxTokens: 64000 },
      'claude-opus-4-5': { reasoning: true, contextWindow: 200000, maxTokens: 64000 },
      'claude-opus-4-1': { reasoning: true, contextWindow: 200000, maxTokens: 32000 },
      'claude-sonnet-4': { reasoning: true, contextWindow: 1000000, maxTokens: 64000 },
      'claude-opus-4': { reasoning: true, contextWindow: 200000, maxTokens: 32000 }
    }
  },
  tencent_hunyuan: {
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    api: 'openai-completions',
    models: {
      'hunyuan-turbos': { reasoning: false, contextWindow: 256000, maxTokens: 8192 },
      'hunyuan-t1': { reasoning: true, contextWindow: 256000, maxTokens: 8192 },
      'hunyuan-turbos-latest': { reasoning: false, contextWindow: 256000, maxTokens: 8192 },
      'hunyuan-lite': { reasoning: false, contextWindow: 256000, maxTokens: 8192 }
    }
  },
  qianwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    api: 'openai-completions',
    models: {
      'qwen-max-latest': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'qwen-plus-latest': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'qwen-turbo-latest': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'qwen3.5-plus': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'qwen3-coder-plus': { reasoning: false, contextWindow: 128000, maxTokens: 8192 }
    }
  },
  minimax: {
    baseUrl: 'https://api.minimax.chat/v1',
    api: 'openai-completions',
    models: {
      'MiniMax-M2.7': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'MiniMax-M2.5': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'MiniMax-M2.1': { reasoning: false, contextWindow: 128000, maxTokens: 8192 }
    }
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    api: 'openai-completions',
    models: {
      'kimi-k2-thinking': { reasoning: true, contextWindow: 128000, maxTokens: 8192 },
      'kimi-k2.5': { reasoning: true, contextWindow: 128000, maxTokens: 8192 },
      'moonshot-v1-128k': { reasoning: false, contextWindow: 128000, maxTokens: 8192 }
    }
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    api: 'openai-completions',
    models: {
      'glm-5-turbo': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'glm-5': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'glm-4.7': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'glm-4.6': { reasoning: false, contextWindow: 128000, maxTokens: 8192 }
    }
  },
  doubao: {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    api: 'openai-completions',
    models: {
      'doubao-seed-2.0-pro': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'doubao-seed-1.8': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'doubao-seed-1.6-pro': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'doubao-seed-1.6': { reasoning: false, contextWindow: 128000, maxTokens: 8192 }
    }
  },
  ernie: {
    baseUrl: 'https://qianfan.baidubce.com/v2',
    api: 'openai-completions',
    models: {
      'ernie-5.0': { reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      'ernie-x1.1': { reasoning: true, contextWindow: 128000, maxTokens: 8192 },
      'ernie-4.5-turbo': { reasoning: false, contextWindow: 128000, maxTokens: 8192 }
    }
  }
};

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 读取配置文件
 */
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('读取配置失败:', err.message);
  }
  return {};
}

/**
 * 写入配置文件
 */
function writeConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  return true;
}

function getModelConfig() {
  const config = readConfig();
  const providers = config.models?.providers || {};
  const primary = config.agents?.defaults?.model?.primary || '';
  const agentModels = config.agents?.defaults?.models || {};
  const [activeProvider, ...modelParts] = primary.split('/');
  const activeModelId = modelParts.join('/');

  const items = Object.entries(providers).map(([provider, providerConfig]) => {
    const providerModels = Array.isArray(providerConfig.models) ? providerConfig.models : [];
    const normalizedModels = providerModels.map((item) => ({
      id: item.id,
      name: item.name || item.id,
      reasoning: !!item.reasoning,
      contextWindow: item.contextWindow || null,
      maxTokens: item.maxTokens || null,
      isActive: provider === activeProvider && item.id === activeModelId
    }));

    return {
      provider,
      baseUrl: providerConfig.baseUrl || getDefaultBaseUrl(provider),
      apiKey: providerConfig.apiKey || '',
      apiKeyPreview: maskApiKey(providerConfig.apiKey || ''),
      api: providerConfig.api || DEFAULT_PROVIDER_CONFIG[provider]?.api || 'openai-completions',
      isActive: provider === activeProvider,
      currentModelId: provider === activeProvider ? activeModelId : '',
      models: normalizedModels,
      agentModelConfig: Object.fromEntries(
        Object.entries(agentModels)
          .filter(([key]) => key.startsWith(`${provider}/`))
      )
    };
  });

  return {
    primary,
    activeProvider: activeProvider || '',
    activeModelId: activeModelId || '',
    providers: items
  };
}

function updateModelConfig({ provider, model, apiKey, baseUrl }) {
  const prov = String(provider || '').trim();
  if (!prov) {
    throw new Error('provider 不能为空');
  }

  const modelId = normalizeModelId(prov, model);
  if (!modelId) {
    throw new Error('model 不能为空');
  }

  const config = readConfig();
  const defaults = getProviderModelDefaults(prov, modelId);
  const key = String(apiKey || '').trim();
  const url = String(baseUrl || '').trim() || getDefaultBaseUrl(prov);

  config.models = config.models || {};
  config.models.mode = config.models.mode || 'merge';
  config.models.providers = config.models.providers || {};

  const existingProvider = config.models.providers[prov] || {};
  const existingModels = Array.isArray(existingProvider.models) ? existingProvider.models : [];

  // 添加该提供商下所有模型（因为 API Key 是通用的）
  const providerDefaults = DEFAULT_PROVIDER_CONFIG[prov]?.models || {};
  let nextModels = [...existingModels];
  for (const [mid, mdefaults] of Object.entries(providerDefaults)) {
    nextModels = upsertProviderModel(nextModels, prov, mid, mdefaults);
  }
  // 确保用户选择的模型也在里面（处理新增的未知模型）
  nextModels = upsertProviderModel(nextModels, prov, modelId, defaults);

  config.models.providers[prov] = {
    ...existingProvider,
    baseUrl: url,
    apiKey: key || existingProvider.apiKey || '',
    api: existingProvider.api || DEFAULT_PROVIDER_CONFIG[prov]?.api || 'openai-completions',
    models: nextModels
  };

  config.agents = config.agents || {};
  config.agents.defaults = config.agents.defaults || {};
  config.agents.defaults.model = { primary: `${prov}/${modelId}` };
  config.agents.defaults.models = config.agents.defaults.models || {};
  config.agents.defaults.models[`${prov}/${modelId}`] =
    config.agents.defaults.models[`${prov}/${modelId}`] || {};

  writeConfig(config);

  return {
    provider: prov,
    model: modelId,
    baseUrl: url,
    apiKeyPreview: maskApiKey(config.models.providers[prov].apiKey || ''),
    primary: `${prov}/${modelId}`
  };
}

function switchModel(provider, modelId) {
  const prov = String(provider || '').trim();
  const normalizedModelId = normalizeModelId(prov, modelId);
  const config = readConfig();
  const providerConfig = config.models?.providers?.[prov];

  if (!prov || !providerConfig) {
    throw new Error('provider 不存在');
  }

  const hasModel = Array.isArray(providerConfig.models)
    && providerConfig.models.some((item) => item.id === normalizedModelId);
  if (!hasModel) {
    throw new Error('model 不存在');
  }

  config.agents = config.agents || {};
  config.agents.defaults = config.agents.defaults || {};
  config.agents.defaults.model = { primary: `${prov}/${normalizedModelId}` };
  config.agents.defaults.models = config.agents.defaults.models || {};
  config.agents.defaults.models[`${prov}/${normalizedModelId}`] =
    config.agents.defaults.models[`${prov}/${normalizedModelId}`] || {};

  writeConfig(config);

  return {
    provider: prov,
    model: normalizedModelId,
    primary: `${prov}/${normalizedModelId}`
  };
}

function deleteModel(provider) {
  const prov = String(provider || '').trim();
  const config = readConfig();
  const providers = config.models?.providers || {};
  const targetProvider = providers[prov];

  if (!prov || !targetProvider) {
    throw new Error('provider 不存在');
  }

  const deletedModels = Array.isArray(targetProvider.models) ? targetProvider.models : [];
  const deletedKeys = deletedModels.map((item) => `${prov}/${item.id}`);

  delete config.models.providers[prov];
  if (Object.keys(config.models.providers).length === 0) {
    delete config.models.providers;
    if (config.models) {
      delete config.models.mode;
    }
  }

  if (config.agents?.defaults?.models) {
    deletedKeys.forEach((key) => {
      delete config.agents.defaults.models[key];
    });
    if (Object.keys(config.agents.defaults.models).length === 0) {
      delete config.agents.defaults.models;
    }
  }

  const primary = config.agents?.defaults?.model?.primary || '';
  if (primary.startsWith(`${prov}/`)) {
    const nextProvider = Object.keys(config.models?.providers || {})[0];
    const nextModelId = nextProvider
      ? config.models.providers[nextProvider]?.models?.[0]?.id
      : '';

    if (nextProvider && nextModelId) {
      config.agents.defaults.model = { primary: `${nextProvider}/${nextModelId}` };
      config.agents.defaults.models = config.agents.defaults.models || {};
      config.agents.defaults.models[`${nextProvider}/${nextModelId}`] =
        config.agents.defaults.models[`${nextProvider}/${nextModelId}`] || {};
    } else if (config.agents?.defaults) {
      delete config.agents.defaults.model;
    }
  }

  writeConfig(config);
  return { provider: prov };
}

function getDefaultBaseUrl(provider) {
  return DEFAULT_PROVIDER_CONFIG[provider]?.baseUrl || '';
}

function getProviderModelDefaults(provider, modelId) {
  return DEFAULT_PROVIDER_CONFIG[provider]?.models?.[modelId] || {
    reasoning: false,
    contextWindow: 64000,
    maxTokens: 8192
  };
}

function normalizeModelId(provider, model) {
  const raw = String(model || '').trim();
  if (!raw) return '';
  return raw.startsWith(`${provider}/`) ? raw.slice(provider.length + 1) : raw;
}

function upsertProviderModel(existingModels, provider, modelId, defaults) {
  const normalized = existingModels.filter((item) => item && item.id);
  const next = normalized.some((item) => item.id === modelId)
    ? normalized.map((item) => item.id === modelId
      ? {
        ...item,
        id: modelId,
        name: item.name || modelId,
        reasoning: item.reasoning ?? defaults.reasoning,
        contextWindow: item.contextWindow || defaults.contextWindow,
        maxTokens: item.maxTokens || defaults.maxTokens
      }
      : item)
    : normalized.concat({
      id: modelId,
      name: modelId,
      reasoning: defaults.reasoning,
      contextWindow: defaults.contextWindow,
      maxTokens: defaults.maxTokens
    });

  return next.map((item) => ({
    id: item.id,
    name: item.name || `${provider}/${item.id}`,
    reasoning: !!item.reasoning,
    contextWindow: item.contextWindow || defaults.contextWindow,
    maxTokens: item.maxTokens || defaults.maxTokens
  }));
}

function maskApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}****`;
  const prefix = apiKey.startsWith('sk-') ? 'sk-' : apiKey.slice(0, 3);
  return `${prefix}****...${apiKey.slice(-4)}`;
}

const CHANNEL_CATALOG = {
  wecom: {
    key: 'wecom',
    name: '企业微信',
    description: '手动填写企业微信机器人凭证并启用。',
    quickConfigEnabled: false,
    detailPath: '/channel-docs.html#wecom',
    defaultSetupMode: 'manual',
    setupModes: ['manual', 'assisted', 'auto'],
    footerNote: '当前版本优先支持手动配置。保存后将立即启用该通道。',
    credentials: [
      { key: 'botId', label: 'Bot ID', placeholder: '输入 botId', required: true },
      { key: 'secret', label: 'Secret', placeholder: '输入 Secret', required: true, secret: true }
    ],
    settings: []
  },
  dingtalk: {
    key: 'dingtalk',
    name: '钉钉',
    description: '手动填写钉钉应用凭证并启用。',
    quickConfigEnabled: false,
    detailPath: '/channel-docs.html#dingtalk',
    defaultSetupMode: 'manual',
    setupModes: ['manual', 'assisted', 'auto'],
    footerNote: '当前版本优先支持手动配置。保存后将立即启用该通道。',
    credentials: [
      { key: 'clientId', label: 'Client ID', placeholder: '输入 Client ID', required: true },
      { key: 'clientSecret', label: 'Client Secret', placeholder: '输入 Client Secret', required: true, secret: true }
    ],
    settings: []
  },
  qq: {
    key: 'qq',
    name: 'QQ',
    description: '手动填写 QQ 通道凭证并启用。',
    quickConfigEnabled: false,
    detailPath: '/channel-docs.html#qq',
    defaultSetupMode: 'manual',
    setupModes: ['manual', 'assisted', 'auto'],
    footerNote: '当前版本优先支持手动配置。保存后将立即启用该通道。',
    credentials: [
      { key: 'appId', label: 'App ID', placeholder: '输入 App ID', required: true },
      { key: 'appSecret', label: 'App Secret', placeholder: '输入 App Secret', required: true, secret: true }
    ],
    settings: []
  },
  yuanbao: {
    key: 'yuanbao',
    name: '元宝',
    description: '手动填写元宝应用凭证并启用。',
    quickConfigEnabled: false,
    detailPath: '/channel-docs.html#yuanbao',
    defaultSetupMode: 'manual',
    setupModes: ['manual', 'assisted', 'auto'],
    footerNote: '当前版本优先支持手动配置。保存后将立即启用该通道。',
    credentials: [
      { key: 'appId', label: 'App ID', placeholder: '输入 App ID', required: true },
      { key: 'appSecret', label: 'App Secret', placeholder: '输入 App Secret', required: true, secret: true }
    ],
    settings: []
  },
  feishu: {
    key: 'feishu',
    name: '飞书',
    description: '手动填写飞书应用凭证并接入 OpenClaw。',
    quickConfigEnabled: false,
    detailPath: '/channel-docs.html#feishu',
    defaultSetupMode: 'manual',
    setupModes: ['manual', 'assisted', 'auto'],
    footerNote: '当前版本不开放扫码自动创建应用。保存后会写入凭证并启用，配对仍需手动完成。',
    credentials: [
      { key: 'appId', label: 'App ID', placeholder: 'cli_xxxxxxxxxxxx', required: true },
      { key: 'appSecret', label: 'App Secret', placeholder: '输入 App Secret', required: true, secret: true }
    ],
    settings: [
      { key: 'streaming', label: '启用 Streaming 模式（实时回复）', type: 'boolean', defaultValue: true }
    ]
  },
  telegram: {
    key: 'telegram',
    name: 'Telegram',
    description: '通过 Bot Token 连接 Telegram Bot。',
    quickConfigEnabled: false,
    detailPath: '/channel-docs.html#telegram',
    defaultSetupMode: 'manual',
    setupModes: ['manual'],
    footerNote: '填写 Telegram Bot Token 后保存即可启用。需要先在 @BotFather 创建 Bot 获取 Token。',
    credentials: [
      { key: 'botToken', label: 'Bot Token', placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', required: true, secret: true }
    ],
    settings: [
      { key: 'allowedUsers', label: '允许的用户 ID（选填，逗号分隔）', placeholder: '例如: 123456789,987654321', type: 'text', defaultValue: '' }
    ]
  },
  discord: {
    key: 'discord',
    name: 'Discord',
    description: '通过 Bot Token 连接 Discord Bot。',
    quickConfigEnabled: false,
    detailPath: '/channel-docs.html#discord',
    defaultSetupMode: 'manual',
    setupModes: ['manual'],
    footerNote: '填写 Discord Bot Token 后保存即可启用。需要在 Discord Developer Portal 创建 Bot。',
    credentials: [
      { key: 'token', label: 'Bot Token', placeholder: '输入 Discord Bot Token', required: true, secret: true }
    ],
    settings: [
      { key: 'guildIds', label: '允许的服务器 ID（选填，逗号分隔）', placeholder: '例如: 1234567890123456789', type: 'text', defaultValue: '' }
    ]
  }
};

const CHANNEL_STATUS_LABELS = {
  unconfigured: '未配置',
  configured: '已配置未启用',
  enabled: '已启用',
  configuring: '配置中',
  configured_pending_pairing: '已配置，待配对',
  connected: '已接入',
  failed: '配置失败'
};

function maskSecret(secret) {
  if (!secret) return '';
  if (secret.length <= 6) return `${secret.slice(0, 1)}***`;
  return `${secret.slice(0, 3)}****${secret.slice(-3)}`;
}

function cloneChannelField(field = {}) {
  return {
    key: field.key,
    label: field.label,
    placeholder: field.placeholder || '',
    required: !!field.required,
    secret: !!field.secret,
    type: field.type || 'text',
    defaultValue: field.defaultValue
  };
}

function getChannelMeta(channelKey) {
  const key = String(channelKey || '').trim();
  return CHANNEL_CATALOG[key] || null;
}

function getChannelCatalog() {
  return Object.values(CHANNEL_CATALOG).map((item) => ({
    key: item.key,
    name: item.name,
    description: item.description,
    quickConfigEnabled: !!item.quickConfigEnabled,
    detailUrl: item.detailPath || '',
    defaultSetupMode: item.defaultSetupMode || 'manual',
    setupModes: Array.isArray(item.setupModes) ? [...item.setupModes] : ['manual'],
    footerNote: item.footerNote || '',
    schema: {
      credentials: (item.credentials || []).map(cloneChannelField),
      settings: (item.settings || []).map(cloneChannelField)
    }
  }));
}

function normalizeChannelStatus(status, fallbackStatus = 'unconfigured') {
  if (CHANNEL_STATUS_LABELS[status]) return status;
  return fallbackStatus;
}

function getCredentialFieldValue(channel = {}, fieldKey) {
  const credentials = channel.credentials || {};
  const settings = channel.settings || {};
  if (credentials[fieldKey] !== undefined) return credentials[fieldKey];
  if (settings[fieldKey] !== undefined) return settings[fieldKey];
  if (channel[fieldKey] !== undefined) return channel[fieldKey];
  return '';
}

function getChannelCredentials(channelKey, channel = {}) {
  const meta = getChannelMeta(channelKey);
  if (!meta) return {};

  return Object.fromEntries((meta.credentials || []).map((field) => {
    const rawValue = getCredentialFieldValue(channel, field.key);
    return [field.key, String(rawValue || '').trim()];
  }));
}

function getChannelSettings(channelKey, channel = {}) {
  const meta = getChannelMeta(channelKey);
  if (!meta) return {};

  return Object.fromEntries((meta.settings || []).map((field) => {
    const settings = channel.settings || {};
    const rawValue = settings[field.key] !== undefined ? settings[field.key] : channel[field.key];
    if (field.type === 'boolean') {
      return [field.key, rawValue !== undefined ? !!rawValue : !!field.defaultValue];
    }
    return [field.key, rawValue !== undefined ? rawValue : (field.defaultValue ?? '')];
  }));
}

function hasRequiredChannelCredentials(channelKey, credentials = {}) {
  const meta = getChannelMeta(channelKey);
  if (!meta) return false;

  return (meta.credentials || []).every((field) => {
    if (!field.required) return true;
    return !!String(credentials[field.key] || '').trim();
  });
}

function getLegacyFeishuPairingStatus(channel = {}, hasCredentials = false) {
  const hasExplicitStatus = !!(channel.status || channel.pairingStatus || channel.pairing?.status);
  if (hasExplicitStatus) return null;
  if (!hasCredentials) return 'unpaired';

  // Legacy OpenClaw Feishu config stores credentials directly on the channel
  // and does not persist ClawBox pairing metadata. Treat it as connected so
  // existing paired channels are not downgraded to pending.
  if (channel.type === 'feishu' || channel.domain === 'feishu' || channel.enabled !== undefined) {
    return 'paired';
  }

  return null;
}

function getChannelRuntimeStatus(channelKey, channel = {}, credentials = {}) {
  const hasCredentials = hasRequiredChannelCredentials(channelKey, credentials);
  const validationStatus = channel.validation?.status || '';

  if (!hasCredentials) {
    return {
      configured: false,
      enabled: false,
      pairingStatus: 'unpaired',
      status: 'unconfigured'
    };
  }

  if (validationStatus === 'failed' || channel.status === 'failed') {
    return {
      configured: true,
      enabled: !!channel.enabled,
      pairingStatus: channel.pairingStatus || channel.pairing?.status || 'unpaired',
      status: 'failed'
    };
  }

  if (channelKey !== 'feishu') {
    const enabled = channel.enabled !== false;
    return {
      configured: true,
      enabled,
      pairingStatus: 'unpaired',
      status: normalizeChannelStatus(channel.status, enabled ? 'enabled' : 'configured')
    };
  }

  const legacyPairingStatus = getLegacyFeishuPairingStatus(channel, hasCredentials);
  const pairingStatus = channel.pairingStatus
    || channel.pairing?.status
    || legacyPairingStatus
    || (channel.connected && !channel.status ? 'paired' : (channel.enabled === false ? 'unpaired' : 'pending'));
  const isPaired = pairingStatus === 'paired';
  const enabled = channel.enabled !== false;

  return {
    configured: true,
    enabled,
    pairingStatus: isPaired ? 'paired' : 'pending',
    status: normalizeChannelStatus(
      channel.status,
      isPaired ? 'connected' : (enabled ? 'configured_pending_pairing' : 'configured')
    )
  };
}

function buildPairingCommand(channelKey, pairingCode = 'CODE') {
  return `openclaw pairing approve ${channelKey} ${pairingCode}`;
}

function normalizeGenericChannel(channelKey, channel = {}) {
  const meta = getChannelMeta(channelKey);
  if (!meta) return null;

  const credentials = getChannelCredentials(channelKey, channel);
  const settings = getChannelSettings(channelKey, channel);
  const runtime = getChannelRuntimeStatus(channelKey, channel, credentials);
  const configured = runtime.configured;
  const enabled = runtime.enabled;
  const connected = runtime.status === 'connected';
  const pairing = channel.pairing || {};
  const automation = channel.automation || {};
  const validation = channel.validation || {};
  const displayName = String(channel.displayName || channel.name || meta.name).trim() || meta.name;

  return {
    key: channelKey,
    type: channelKey,
    name: meta.name,
    displayName,
    enabled,
    connected,
    configured,
    status: runtime.status,
    pairingStatus: runtime.pairingStatus,
    setupMode: channel.setupMode || channel.accessMode || (configured ? meta.defaultSetupMode || 'manual' : ''),
    accessMode: channel.setupMode || channel.accessMode || (configured ? meta.defaultSetupMode || 'manual' : ''),
    connectedAt: connected ? (channel.connectedAt || '') : '',
    configuredAt: configured ? (channel.configuredAt || channel.connectedAt || '') : '',
    enabledAt: enabled ? (channel.enabledAt || channel.configuredAt || '') : '',
    lastError: channel.lastError || '',
    credentials,
    settings,
    validation: {
      status: validation.status || (configured ? 'pending' : 'unvalidated'),
      message: validation.message || '',
      updatedAt: validation.updatedAt || (configured ? (channel.configuredAt || '') : '')
    },
    pairing: {
      status: channelKey === 'feishu' ? runtime.pairingStatus : 'unpaired',
      code: pairing.code || '',
      command: buildPairingCommand(channelKey),
      instructions: channelKey === 'feishu'
        ? [
            '去飞书里给机器人发送一条消息。',
            '获取 pairing code。',
            buildPairingCommand('feishu')
          ]
        : []
    },
    automation: {
      appCreated: !!automation.appCreated,
      botEnabled: !!automation.botEnabled,
      scopesConfigured: !!automation.scopesConfigured,
      eventSubscriptionConfigured: !!automation.eventSubscriptionConfigured,
      publishReady: !!automation.publishReady,
      provider: automation.provider || '',
      lastProvisionedAt: automation.lastProvisionedAt || ''
    },
    support: {
      quickConfigEnabled: !!meta.quickConfigEnabled,
      detailUrl: meta.detailPath || '',
      footerNote: meta.footerNote || '',
      setupModes: Array.isArray(meta.setupModes) ? [...meta.setupModes] : ['manual']
    },
    schema: {
      credentials: (meta.credentials || []).map(cloneChannelField),
      settings: (meta.settings || []).map(cloneChannelField)
    }
  };
}

function normalizeChannel(key, channel = {}) {
  return normalizeGenericChannel(key, channel);
}

function serializeChannel(key, channel = {}, includeSecrets = false) {
  const normalized = normalizeChannel(key, channel);
  if (!normalized) return null;

  const meta = getChannelMeta(key);
  const credentials = normalized.credentials || {};
  const settings = normalized.settings || {};
  const summaryCredentials = (meta?.credentials || []).map((field) => ({
    key: field.key,
    label: field.label,
    value: field.secret
      ? maskSecret(credentials[field.key] || '')
      : String(credentials[field.key] || ''),
    secret: !!field.secret
  }));

  return {
    key: normalized.key || key,
    type: normalized.type || key,
    name: normalized.name || key,
    displayName: normalized.displayName || normalized.name || key,
    enabled: !!normalized.enabled,
    configured: !!normalized.configured,
    connected: !!normalized.connected,
    status: normalized.status || 'unconfigured',
    statusLabel: CHANNEL_STATUS_LABELS[normalized.status] || CHANNEL_STATUS_LABELS.unconfigured,
    pairingStatus: normalized.pairingStatus || 'unpaired',
    setupMode: normalized.setupMode || '',
    accessMode: normalized.accessMode || '',
    connectedAt: normalized.connectedAt || '',
    configuredAt: normalized.configuredAt || '',
    enabledAt: normalized.enabledAt || '',
    lastError: normalized.lastError || '',
    summary: {
      credentials: summaryCredentials,
      pairingCommand: normalized.pairing?.command || buildPairingCommand(key)
    },
    credentials: Object.fromEntries(summaryCredentials.map((field) => [
      field.key,
      includeSecrets || !field.secret ? String(credentials[field.key] || '') : field.value
    ])),
    settings: {
      ...settings
    },
    credentialState: Object.fromEntries((meta?.credentials || []).map((field) => [
      field.key,
      {
        hasValue: !!credentials[field.key],
        maskedValue: field.secret ? maskSecret(credentials[field.key] || '') : String(credentials[field.key] || '')
      }
    ])),
    validation: {
      status: normalized.validation?.status || 'unvalidated',
      message: normalized.validation?.message || '',
      updatedAt: normalized.validation?.updatedAt || ''
    },
    pairing: {
      status: normalized.pairing?.status || 'unpaired',
      code: normalized.pairing?.code || '',
      command: normalized.pairing?.command || buildPairingCommand(key),
      instructions: Array.isArray(normalized.pairing?.instructions) ? normalized.pairing.instructions : []
    },
    automation: {
      appCreated: !!normalized.automation?.appCreated,
      botEnabled: !!normalized.automation?.botEnabled,
      scopesConfigured: !!normalized.automation?.scopesConfigured,
      eventSubscriptionConfigured: !!normalized.automation?.eventSubscriptionConfigured,
      publishReady: !!normalized.automation?.publishReady,
      provider: normalized.automation?.provider || '',
      lastProvisionedAt: normalized.automation?.lastProvisionedAt || ''
    },
    support: {
      quickConfigEnabled: !!normalized.support?.quickConfigEnabled,
      detailUrl: normalized.support?.detailUrl || '',
      footerNote: normalized.support?.footerNote || '',
      setupModes: Array.isArray(normalized.support?.setupModes) ? normalized.support.setupModes : ['manual']
    },
    schema: {
      credentials: Array.isArray(normalized.schema?.credentials) ? normalized.schema.credentials : [],
      settings: Array.isArray(normalized.schema?.settings) ? normalized.schema.settings : []
    }
  };
}

function getChannelConfig(channelKey) {
  const key = String(channelKey || '').trim();
  if (!getChannelMeta(key)) return null;
  const config = readConfig();
  const channels = config.channels || {};
  const normalized = normalizeChannel(key, channels[key] || {});
  return serializeChannel(key, normalized, true);
}

function getChannelsConfig() {
  const config = readConfig();
  const channels = config.channels || {};

  return getChannelCatalog().map((item) => {
    const existing = channels[item.key] || {};
    const normalized = normalizeChannel(item.key, existing);
    return serializeChannel(item.key, normalized, false);
  });
}

function getChannelsState() {
  const catalog = getChannelCatalog().map((item) => ({
    ...item,
    quickConfigEnabled: !!item.quickConfigEnabled
  }));
  const channels = getChannelsConfig();

  return {
    catalog,
    channels,
    connectedChannels: channels.filter((item) => item.configured || item.connected)
  };
}

function normalizeManualChannelPayload(channelKey, payload = {}) {
  const meta = getChannelMeta(channelKey);
  if (!meta) {
    return {
      ok: false,
      errors: [`不支持的消息通道: ${channelKey}`]
    };
  }

  const credentials = Object.fromEntries((meta.credentials || []).map((field) => {
    const hasNestedValue = Object.prototype.hasOwnProperty.call(payload.credentials || {}, field.key);
    const hasFlatValue = Object.prototype.hasOwnProperty.call(payload, field.key);
    const hasExplicitValue = hasNestedValue || hasFlatValue;
    const rawValue = hasNestedValue ? payload.credentials[field.key] : payload[field.key];
    return [field.key, hasExplicitValue ? String(rawValue || '').trim() : undefined];
  }));
  const settings = Object.fromEntries((meta.settings || []).map((field) => {
    const rawValue = payload.settings?.[field.key] !== undefined
      ? payload.settings[field.key]
      : payload[field.key];
    if (field.type === 'boolean') {
      return [field.key, rawValue !== undefined ? !!rawValue : !!field.defaultValue];
    }
    return [field.key, rawValue !== undefined ? rawValue : (field.defaultValue ?? '')];
  }));
  const errors = (meta.credentials || [])
    .filter((field) => credentials[field.key] !== undefined && field.required && !credentials[field.key])
    .map((field) => `请填写${field.label}`);

  return {
    ok: errors.length === 0,
    errors,
    payload: {
      displayName: String(payload.displayName || meta.name).trim() || meta.name,
      credentials,
      settings,
      setupMode: 'manual'
    }
  };
}

function upsertChannelConfig(channelKey, payload = {}) {
  const key = String(channelKey || '').trim();
  const meta = getChannelMeta(key);
  if (!meta) throw new Error(`不支持的消息通道: ${key}`);

  const config = readConfig();
  if (!config.channels) config.channels = {};
  const current = normalizeChannel(key, config.channels[key] || {}) || {};
  const currentCredentials = current.credentials || {};
  const currentSettings = current.settings || {};
  const nextCredentials = Object.fromEntries((meta.credentials || []).map((field) => {
    const explicitValue = payload.credentials?.[field.key] !== undefined
      ? payload.credentials[field.key]
      : payload[field.key];
    if (explicitValue !== undefined) return [field.key, String(explicitValue || '').trim()];
    return [field.key, String(currentCredentials[field.key] || '').trim()];
  }));
  const nextSettings = Object.fromEntries((meta.settings || []).map((field) => {
    const explicitValue = payload.settings?.[field.key] !== undefined
      ? payload.settings[field.key]
      : payload[field.key];
    if (explicitValue !== undefined) {
      return [field.key, field.type === 'boolean' ? !!explicitValue : explicitValue];
    }
    return [field.key, currentSettings[field.key] !== undefined ? currentSettings[field.key] : (field.defaultValue ?? '')];
  }));
  const configured = hasRequiredChannelCredentials(key, nextCredentials);
  const hasExistingConfig = !!current.configured;
  const credentialsChanged = (meta.credentials || []).some((field) => nextCredentials[field.key] !== String(currentCredentials[field.key] || '').trim());
  const nextEnabled = configured
    ? (payload.enabled !== undefined
      ? !!payload.enabled
      : (payload.apply !== undefined ? !!payload.apply : (hasExistingConfig ? !!current.enabled : true)))
    : false;
  const pairingStatus = key === 'feishu'
    ? (payload.pairingStatus || (credentialsChanged
      ? (nextEnabled ? 'pending' : 'unpaired')
      : (nextEnabled ? (current.pairingStatus === 'paired' ? 'paired' : 'pending') : (current.pairingStatus || 'unpaired'))))
    : 'unpaired';
  const status = payload.status || (!configured
    ? 'unconfigured'
    : (key === 'feishu'
      ? (pairingStatus === 'paired' ? 'connected' : (nextEnabled ? 'configured_pending_pairing' : 'configured'))
      : (nextEnabled ? 'enabled' : 'configured')));
  const lastError = payload.lastError !== undefined
    ? String(payload.lastError || '').trim()
    : (status === 'failed' ? (current.lastError || '配置失败') : '');

  config.channels[key] = {
    key,
    type: key,
    name: meta.name,
    displayName: String(payload.displayName || current.displayName || meta.name).trim() || meta.name,
    enabled: nextEnabled,
    connected: pairingStatus === 'paired',
    status,
    pairingStatus,
    setupMode: payload.setupMode || current.setupMode || meta.defaultSetupMode || 'manual',
    accessMode: payload.setupMode || current.setupMode || meta.defaultSetupMode || 'manual',
    configuredAt: configured ? (payload.configuredAt || current.configuredAt || new Date().toISOString()) : '',
    enabledAt: nextEnabled ? (payload.enabledAt || current.enabledAt || new Date().toISOString()) : '',
    connectedAt: pairingStatus === 'paired' ? (payload.connectedAt || current.connectedAt || new Date().toISOString()) : '',
    lastError,
    credentials: nextCredentials,
    settings: {
      ...nextSettings,
      ...(key === 'feishu'
        ? {
            appId: nextCredentials.appId || '',
            appSecret: nextCredentials.appSecret || ''
          }
        : {})
    },
    validation: {
      status: payload.validation?.status || (configured ? 'pending' : 'unvalidated'),
      message: payload.validation?.message || '',
      updatedAt: payload.validation?.updatedAt || (configured ? new Date().toISOString() : '')
    },
    pairing: {
      status: pairingStatus,
      code: payload.pairingCode !== undefined ? String(payload.pairingCode || '').trim() : (current.pairing?.code || '')
    },
    automation: {
      appCreated: payload.automation?.appCreated ?? current.automation?.appCreated ?? false,
      botEnabled: payload.automation?.botEnabled ?? current.automation?.botEnabled ?? false,
      scopesConfigured: payload.automation?.scopesConfigured ?? current.automation?.scopesConfigured ?? false,
      eventSubscriptionConfigured: payload.automation?.eventSubscriptionConfigured ?? current.automation?.eventSubscriptionConfigured ?? false,
      publishReady: payload.automation?.publishReady ?? current.automation?.publishReady ?? false,
      provider: payload.automation?.provider ?? current.automation?.provider ?? '',
      lastProvisionedAt: payload.automation?.lastProvisionedAt ?? current.automation?.lastProvisionedAt ?? ''
    }
  };

  if (key === 'feishu') {
    config.channels[key].appId = nextCredentials.appId || '';
    config.channels[key].appSecret = nextCredentials.appSecret || '';
    config.channels[key].streaming = nextSettings.streaming ?? true;
  }

  writeConfig(config);
  return serializeChannel(key, config.channels[key], false);
}

function removeChannelConfig(channelKey) {
  const key = String(channelKey || '').trim();
  const config = readConfig();
  if (!config.channels) config.channels = {};
  delete config.channels[key];
  writeConfig(config);
  return { success: true, key };
}

/**
 * 获取飞书配置
 */
function getFeishuConfig() {
  const feishu = getChannelConfig('feishu');
  return {
    enabled: !!feishu?.configured,
    appId: feishu?.credentials?.appId || '',
    appSecret: feishu?.credentials?.appSecret || '',
    streaming: feishu?.settings?.streaming ?? true,
    status: feishu?.status || 'unconfigured',
    pairingStatus: feishu?.pairingStatus || 'unpaired'
  };
}

/**
 * 更新飞书配置
 */
function updateFeishuConfig({ appId, appSecret, streaming }) {
  const channel = upsertChannelConfig('feishu', {
    credentials: {
      appId,
      appSecret
    },
    settings: {
      streaming
    },
    setupMode: 'manual',
    enabled: true,
    pairingStatus: 'pending'
  });
  return {
    appId: channel.credentials.appId,
    appSecret: appSecret || '',
    streaming: channel.settings.streaming,
    status: channel.status,
    pairingStatus: channel.pairingStatus
  };
}

/**
 * 获取完整配置（脱敏）
 */
function getConfigSummary() {
  const config = readConfig();
  const modelConfig = getModelConfig();
  const feishuConfig = getFeishuConfig();
  const channels = getChannelsConfig();

  return {
    hasConfig: Object.keys(config).length > 0,
    model: {
      provider: modelConfig.activeProvider,
      model: modelConfig.primary,
      hasApiKey: !!modelConfig.providers.find((item) => item.isActive)?.apiKey,
      apiKeyPreview: modelConfig.providers.find((item) => item.isActive)?.apiKeyPreview || ''
    },
    feishu: {
      enabled: feishuConfig.enabled,
      hasSecret: !!feishuConfig.appSecret,
      status: feishuConfig.status
    },
    channels: channels.filter((item) => item.configured || item.connected).map((item) => item.key)
  };
}

/**
 * 获取所有已安装/配置的模型
 * 解析 models.providers 和 agents.defaults.models
 */
function getInstalledModels() {
  const config = readConfig();
  const providers = config.models?.providers || {};
  const agentModels = config.agents?.defaults?.models || {};
  const primary = config.agents?.defaults?.model?.primary || '';

  // 从 providers 解析所有模型
  const installed = [];
  for (const [provider, providerConfig] of Object.entries(providers)) {
    const models = Array.isArray(providerConfig.models) ? providerConfig.models : [];
    for (const m of models) {
      const fullId = `${provider}/${m.id}`;
      installed.push({
        id: fullId,
        provider,
        modelId: m.id,
        name: m.name || m.id,
        source: 'provider',
        isDefault: fullId === primary
      });
    }
  }

  // 从 agents.defaults.models 补充不在 providers 中的模型（如 openrouter）
  for (const modelKey of Object.keys(agentModels)) {
    if (!installed.some(m => m.id === modelKey)) {
      const parts = modelKey.split('/');
      installed.push({
        id: modelKey,
        provider: parts[0],
        modelId: parts.slice(1).join('/'),
        name: modelKey,
        source: 'agent',
        isDefault: modelKey === primary
      });
    }
  }

  return {
    primary,
    models: installed
  };
}

/**
 * 切换默认模型（通过完整模型ID）
 */
function switchModelById(fullModelId) {
  const id = String(fullModelId || '').trim();
  if (!id) throw new Error('模型ID不能为空');

  const config = readConfig();
  const parts = id.split('/');
  if (parts.length < 2) throw new Error('模型ID格式不正确，应为 provider/modelId');

  // 写入配置
  config.agents = config.agents || {};
  config.agents.defaults = config.agents.defaults || {};
  config.agents.defaults.model = { primary: id };
  config.agents.defaults.models = config.agents.defaults.models || {};
  config.agents.defaults.models[id] = config.agents.defaults.models[id] || {};

  writeConfig(config);
  return { primary: id };
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  readConfig,
  writeConfig,
  getModelConfig,
  updateModelConfig,
  switchModel,
  switchModelById,
  deleteModel,
  getChannelCatalog,
  getChannelConfig,
  getChannelsConfig,
  getChannelsState,
  normalizeManualChannelPayload,
  upsertChannelConfig,
  removeChannelConfig,
  getFeishuConfig,
  updateFeishuConfig,
  getConfigSummary,
  getInstalledModels
};
