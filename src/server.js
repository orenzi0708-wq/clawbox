const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const { installOpenClaw, updateOpenClaw, uninstallOpenClaw, isOpenClawInstalled, getOpenClawVersion, isGatewayRunning, getOS, checkNodeVersion, isRoot, searchClawHubSkills, installClawHubSkill, isClawHubAvailable, installClawHubCLI, resolveClawHubBinary } = require('./installer');
const { getModelConfig, updateModelConfig, switchModel, switchModelById, deleteModel, getFeishuConfig, updateFeishuConfig, getConfigSummary, getInstalledModels, getChannelCatalog, getChannelConfig, getChannelsState, normalizeManualChannelPayload, upsertChannelConfig, removeChannelConfig } = require('./config');

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

      if (provider === 'anthropic') {
        reqUrl = 'https://api.anthropic.com/v1/messages';
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
        const cleanBaseUrl = (baseUrl || '').replace(/\/+$/, '');
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
    try {
      const { provider, model, apiKey, baseUrl } = req.body;
      if (!provider || !model || !apiKey) {
        return res.status(400).json({ success: false, error: '缺少必要参数' });
      }
      const result = await verifyApiKey(provider, model, apiKey, baseUrl);
      res.json({ success: result.valid, error: result.error || null });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 添加模型
  app.post('/api/models/add', async (req, res) => {
    try {
      const { provider, model, apiKey, baseUrl } = req.body;
      if (!provider || !model || !apiKey) {
        return res.status(400).json({ success: false, error: '缺少必要参数' });
      }
      // 先验证 API Key
      const verify = await verifyApiKey(provider, model, apiKey, baseUrl);
      if (!verify.valid) {
        return res.status(400).json({ success: false, error: 'API Key 验证失败: ' + (verify.error || '未知错误') });
      }
      const result = updateModelConfig({ provider, model, apiKey, baseUrl });
      res.json({ success: true, config: result });
    } catch (err) {
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
      const current = getChannelConfig(key);
      if (!current) {
        return res.status(404).json({ success: false, error: '消息通道不存在' });
      }

      const enabled = !!req.body?.enabled;
      if (enabled && !current.configured) {
        return res.status(400).json({ success: false, error: '请先完成通道配置，再启用该通道' });
      }

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
      result.node = { installed: true, version: process.version, path: process.execPath };
    } else {
      result.node = { installed: false };
    }

    const { command: clawhubPath } = resolveClawHubBinary();
    result.clawhub = {
      installed: clawhubPath !== 'clawhub',
      path: clawhubPath !== 'clawhub' ? clawhubPath : null
    };

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
