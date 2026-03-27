const fs = require('fs');
const path = require('path');
const os = require('os');

// OpenClaw 配置文件路径
const CONFIG_DIR = path.join(os.homedir(), '.openclaw');
const CONFIG_FILE = path.join(CONFIG_DIR, 'openclaw.json');

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

/**
 * 获取模型配置
 * 返回 { provider, model, apiKey, availableModels }
 */
function getModelConfig() {
  const config = readConfig();
  const models = config.models || {};
  const providers = models.providers || {};
  const agentModel = config.agents?.defaults?.model?.primary || '';

  // 从 primary model 解析 provider 和 model
  const [prov, ...modelParts] = agentModel.split('/');
  const modelId = modelParts.join('/');
  const currentProvider = prov && providers[prov] ? prov : '';
  const currentModel = modelId || '';
  const currentKey = currentProvider ? (providers[currentProvider]?.apiKey || '') : '';
  const currentUrl = currentProvider ? (providers[currentProvider]?.baseUrl || '') : '';

  // 支持的 mimo 模型
  const mimoModels = [
    { id: 'mimo/mimo-v2-omni', name: 'MIMO Omni', desc: '最强，全模态', tier: 'omni' },
    { id: 'mimo/mimo-v2-pro', name: 'MIMO Pro', desc: '平衡，推荐日常', tier: 'pro' },
    { id: 'mimo/mimo-v2-flash', name: 'MIMO Flash', desc: '最快，轻量任务', tier: 'flash' }
  ];

  // 其他常用模型
  const otherModels = [
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek', desc: '性价比高' },
    { id: 'google/gemini-2.5-flash', name: 'Gemini Flash', desc: 'Google，快速' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini Pro', desc: 'Google，强推理' },
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet', desc: 'Anthropic' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', desc: 'OpenAI' }
  ];

  return {
    provider: currentProvider,
    model: agentModel,
    apiKey: currentKey,
    baseUrl: currentUrl,
    currentTier: getCurrentTier(agentModel, mimoModels),
    mimoModels,
    otherModels
  };
}

/**
 * 判断当前模型属于哪个档位
 */
function getCurrentTier(modelId, mimoModels) {
  const found = mimoModels.find(m => m.id === modelId);
  return found?.tier || '';
}

/**
 * 更新模型配置 — 用 python 直接写入 openclaw.json 的 models.providers 格式
 */
function updateModelConfig({ provider, model, apiKey, baseUrl }) {
  const prov = provider || 'deepseek';
  // 如果 model 已经带了 provider 前缀（如 deepseek/deepseek-chat），去掉前缀
  let modelId = model || 'deepseek-chat';
  if (modelId.startsWith(prov + '/')) {
    modelId = modelId.slice(prov.length + 1);
  }
  const key = apiKey || '';
  const url = baseUrl || 'https://api.deepseek.com/v1';

  // 用 python 直接写入，避免 openclaw config set 对嵌套对象支持不好的问题
  const pythonScript = `
import json, os
f = os.path.expanduser("~/.openclaw/openclaw.json")
with open(f) as fp:
    c = json.load(fp)
c.setdefault("models", {})["mode"] = "merge"
c["models"].setdefault("providers", {})["${prov}"] = {
    "baseUrl": "${url}",
    "apiKey": "${key}",
    "api": "openai-completions",
    "models": [{"id": "${modelId}", "name": "${prov}/${modelId}", "contextWindow": 64000, "maxTokens": 8192}]
}
c.setdefault("agents", {}).setdefault("defaults", {})["model"] = {"primary": "${prov}/${modelId}"}
with open(f, 'w') as fp:
    json.dump(c, fp, indent=2)
print("ok")
`;

  try {
    execSync(`python3 -c '${pythonScript}'`, { encoding: 'utf8', timeout: 10000 });
    return { provider: prov, model: `${prov}/${modelId}`, apiKey: key, baseUrl: url };
  } catch (err) {
    throw new Error(`模型配置写入失败: ${err.message}`);
  }
}

/**
 * 获取飞书配置
 */
function getFeishuConfig() {
  const config = readConfig();
  const channels = config.channels || {};
  const feishu = channels.feishu || {};

  return {
    enabled: !!feishu.appId,
    appId: feishu.appId || '',
    appSecret: feishu.appSecret || '',
    streaming: feishu.streaming ?? true
  };
}

/**
 * 更新飞书配置
 */
function updateFeishuConfig({ appId, appSecret, streaming }) {
  const config = readConfig();
  if (!config.channels) config.channels = {};
  config.channels.feishu = {
    appId: appId || '',
    appSecret: appSecret || '',
    streaming: streaming !== undefined ? streaming : true
  };
  writeConfig(config);
  return config.channels.feishu;
}

/**
 * 获取完整配置（脱敏）
 */
function getConfigSummary() {
  const config = readConfig();
  const modelConfig = getModelConfig();
  const feishuConfig = getFeishuConfig();

  return {
    hasConfig: Object.keys(config).length > 0,
    model: {
      provider: modelConfig.provider,
      model: modelConfig.model,
      hasApiKey: !!modelConfig.apiKey,
      apiKeyPreview: modelConfig.apiKey
        ? modelConfig.apiKey.slice(0, 8) + '...' + modelConfig.apiKey.slice(-4)
        : ''
    },
    feishu: {
      enabled: feishuConfig.enabled,
      hasSecret: !!feishuConfig.appSecret
    },
    channels: Object.keys(config.channels || {})
  };
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  readConfig,
  writeConfig,
  getModelConfig,
  updateModelConfig,
  getFeishuConfig,
  updateFeishuConfig,
  getConfigSummary
};
