const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const configModulePath = path.join(__dirname, '..', 'src', 'config.js');
const originalEnv = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE
};

function clearModule() {
  try {
    delete require.cache[require.resolve(configModulePath)];
  } catch {}
}

function loadConfigModule(tempHome) {
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  clearModule();
  return require(configModulePath);
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawbox-feishu-doctor-'));

try {
  const configHome = path.join(tempHome, '.openclaw');
  fs.mkdirSync(configHome, { recursive: true });
  fs.writeFileSync(path.join(configHome, 'openclaw.json'), JSON.stringify({
    gateway: {
      auth: {
        mode: 'token',
        token: 'test-token'
      },
      mode: 'local'
    },
    meta: {
      lastTouchedVersion: '2026.4.15',
      lastTouchedAt: new Date().toISOString()
    },
    models: {
      mode: 'merge',
      providers: {}
    },
    agents: {
      defaults: {
        model: {
          primary: ''
        },
        models: {}
      }
    },
    channels: {}
  }, null, 2), 'utf8');

  const config = loadConfigModule(tempHome);
  config.upsertChannelConfig('feishu', {
    credentials: {
      appId: 'cli_runtime_test',
      appSecret: 'runtime_secret'
    },
    settings: {
      streaming: true
    },
    enabled: true,
    validation: {
      status: 'pending',
      message: ''
    },
    lastError: ''
  });

  const persistedMainConfig = JSON.parse(fs.readFileSync(config.CONFIG_FILE, 'utf8'));
  const persistedUiState = JSON.parse(fs.readFileSync(config.CLAWBOX_CHANNEL_STATE_FILE, 'utf8'));

  assert.strictEqual(persistedMainConfig.channels.feishu.appId, 'cli_runtime_test', 'main OpenClaw config should keep the Feishu App ID');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(persistedMainConfig.channels.feishu, 'status'), false, 'main OpenClaw config should not contain ClawBox-only status metadata');
  assert.strictEqual(persistedUiState.channels.feishu.status, 'configured_pending_pairing', 'ClawBox sidecar should preserve pending pairing status');

  const persistedFeishuKeys = Object.keys(persistedMainConfig.channels.feishu).sort();
  assert.deepStrictEqual(
    persistedFeishuKeys,
    ['appId', 'appSecret', 'enabled', 'streaming'],
    'persisted Feishu config should keep only the OpenClaw-compatible fields that ClawBox currently manages'
  );

  console.log('PASS Feishu configs written by ClawBox keep OpenClaw-compatible persisted fields and sidecar UI metadata');
} finally {
  process.env.HOME = originalEnv.HOME;
  process.env.USERPROFILE = originalEnv.USERPROFILE;
  clearModule();
  fs.rmSync(tempHome, { recursive: true, force: true });
}
