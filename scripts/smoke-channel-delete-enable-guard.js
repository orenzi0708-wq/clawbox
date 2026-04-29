const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configModulePath = path.join(__dirname, '..', 'src', 'config.js');
const serverModulePath = path.join(__dirname, '..', 'src', 'server.js');
const originalEnv = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE
};

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath)];
  } catch {}
}

function loadModules(tempHome) {
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  clearModule(serverModulePath);
  clearModule(configModulePath);
  const config = require(configModulePath);
  const server = require(serverModulePath);
  return { config, server };
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawbox-channel-toggle-'));

try {
  let { config, server } = loadModules(tempHome);
  assert.strictEqual(typeof config.getPersistedChannelConfig, 'function', 'config should expose persisted channel reads');
  assert.strictEqual(typeof server.__test.resolveChannelEnableToggleContext, 'function', 'server should expose the channel toggle guard');

  const saved = config.upsertChannelConfig('telegram', {
    credentials: {
      botToken: '123456:test-bot-token'
    },
    enabled: true
  });
  assert.strictEqual(saved.configured, true, 'saved Telegram channel should be configured');

  let persisted = config.getPersistedChannelConfig('telegram');
  assert(persisted, 'persisted Telegram config should exist before deletion');
  assert.strictEqual(persisted.configured, true, 'persisted Telegram config should remain configured');

  let toggleContext = server.__test.resolveChannelEnableToggleContext('telegram', false);
  assert.strictEqual(toggleContext.ok, true, 'existing configured channels should still be toggleable');

  config.removeChannelConfig('telegram');

  ({ config, server } = loadModules(tempHome));
  persisted = config.getPersistedChannelConfig('telegram');
  assert.strictEqual(persisted, null, 'deleted channel should no longer have a persisted config entry');

  const template = config.getChannelConfig('telegram');
  assert(template, 'channel template should still be available for manual reconfiguration');
  assert.strictEqual(template.configured, false, 'template channel should remain unconfigured after deletion');

  toggleContext = server.__test.resolveChannelEnableToggleContext('telegram', true);
  assert.strictEqual(toggleContext.ok, false, 'deleted channels should not be re-enabled from the template object');
  assert.strictEqual(toggleContext.statusCode, 404, 'deleted channels should behave as missing for the toggle endpoint');
  assert(/未配置或已删除/.test(toggleContext.error), 'deleted channel toggle error should explain that the config was removed');

  toggleContext = server.__test.resolveChannelEnableToggleContext('telegram', false);
  assert.strictEqual(toggleContext.ok, false, 'deleted channels should not accept disable toggles either');
  assert.strictEqual(toggleContext.statusCode, 404, 'deleted channel disable should also fail as missing');

  const invalid = server.__test.resolveChannelEnableToggleContext('not-a-channel', true);
  assert.strictEqual(invalid.ok, false, 'unknown channels should still be rejected');
  assert.strictEqual(invalid.statusCode, 404, 'unknown channels should keep the not-found status');
  assert(/不存在/.test(invalid.error), 'unknown channel errors should remain explicit');

  config.writeConfig({
    channels: {
      telegram: {}
    }
  });

  ({ config, server } = loadModules(tempHome));
  persisted = config.getPersistedChannelConfig('telegram');
  assert(persisted, 'legacy empty stubs should still deserialize for repair');
  assert.strictEqual(persisted.configured, false, 'legacy empty stubs should remain unconfigured');

  toggleContext = server.__test.resolveChannelEnableToggleContext('telegram', true);
  assert.strictEqual(toggleContext.ok, false, 'legacy unconfigured stubs should not be promotable to enabled');
  assert.strictEqual(toggleContext.statusCode, 400, 'legacy unconfigured stubs should fail with a validation error');
  assert(/请先完成通道配置/.test(toggleContext.error), 'legacy unconfigured stubs should direct the user to finish configuration first');

  console.log('PASS deleted channels no longer resurrect through the enabled endpoint and persisted/template reads stay distinct');
} finally {
  process.env.HOME = originalEnv.HOME;
  process.env.USERPROFILE = originalEnv.USERPROFILE;
  clearModule(serverModulePath);
  clearModule(configModulePath);
  fs.rmSync(tempHome, { recursive: true, force: true });
}
