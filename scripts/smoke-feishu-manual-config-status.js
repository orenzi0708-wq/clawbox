const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const configModulePath = path.join(__dirname, '..', 'src', 'config.js');
const originalEnv = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE
};

function loadConfigModule(tempHome) {
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  delete require.cache[require.resolve(configModulePath)];
  return require(configModulePath);
}

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawbox-feishu-status-'));

try {
  let config = loadConfigModule(tempHome);

  const manualSaved = config.upsertChannelConfig('feishu', {
    credentials: {
      appId: 'cli_manual_test',
      appSecret: 'manual_secret'
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

  assert.strictEqual(manualSaved.status, 'configured_pending_pairing', 'manual Feishu config should stay pending until pairing completes');
  assert.strictEqual(manualSaved.pairingStatus, 'pending', 'manual Feishu config should persist pending pairing state');
  assert.strictEqual(manualSaved.connected, false, 'manual Feishu config should not be treated as connected');

  const persistedAfterManualSave = JSON.parse(fs.readFileSync(config.CONFIG_FILE, 'utf8'));
  assert.strictEqual(persistedAfterManualSave.channels.feishu.enabled, true, 'persisted OpenClaw config should keep the Feishu enabled flag');
  assert.strictEqual(persistedAfterManualSave.channels.feishu.appId, 'cli_manual_test', 'persisted OpenClaw config should keep the Feishu App ID');
  assert.strictEqual(persistedAfterManualSave.channels.feishu.appSecret, 'manual_secret', 'persisted OpenClaw config should keep the Feishu App Secret');
  assert.strictEqual(persistedAfterManualSave.channels.feishu.streaming, true, 'persisted OpenClaw config should keep supported runtime options');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(persistedAfterManualSave.channels.feishu, 'status'), false, 'persisted OpenClaw config should not keep ClawBox-only status metadata');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(persistedAfterManualSave.channels.feishu, 'pairingStatus'), false, 'persisted OpenClaw config should not keep ClawBox-only pairing metadata');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(persistedAfterManualSave.channels.feishu, 'validation'), false, 'persisted OpenClaw config should not keep ClawBox-only validation metadata');

  const persistedUiStateAfterManualSave = JSON.parse(fs.readFileSync(config.CLAWBOX_CHANNEL_STATE_FILE, 'utf8'));
  assert.strictEqual(persistedUiStateAfterManualSave.channels.feishu.status, 'configured_pending_pairing', 'ClawBox UI state should keep the explicit pending status');
  assert.strictEqual(persistedUiStateAfterManualSave.channels.feishu.pairingStatus, 'pending', 'ClawBox UI state should keep explicit pending pairing metadata');
  assert.strictEqual(persistedUiStateAfterManualSave.channels.feishu.connected, false, 'ClawBox UI state should not mark manual save as connected');

  config = loadConfigModule(tempHome);
  const reloadedManualConfig = config.getChannelConfig('feishu');
  assert.strictEqual(reloadedManualConfig.status, 'configured_pending_pairing', 'reloaded Feishu config should remain pending after manual save');
  assert.strictEqual(reloadedManualConfig.pairingStatus, 'pending', 'reloaded Feishu config should keep pending pairing state');
  assert.strictEqual(reloadedManualConfig.connected, false, 'reloaded Feishu config should not flip to connected');

  fs.writeFileSync(config.CONFIG_FILE, JSON.stringify({
    channels: {
      feishu: {
        enabled: true,
        appId: 'cli_legacy_only_credentials',
        appSecret: 'legacy_secret',
        streaming: true
      }
    }
  }, null, 2), 'utf8');

  config = loadConfigModule(tempHome);
  const legacyOnlyCredentials = config.getChannelConfig('feishu');
  assert.strictEqual(legacyOnlyCredentials.status, 'configured_pending_pairing', 'legacy Feishu credentials without explicit metadata should default to pending instead of connected');
  assert.strictEqual(legacyOnlyCredentials.pairingStatus, 'pending', 'legacy Feishu credentials without metadata should default to pending pairing');
  assert.strictEqual(legacyOnlyCredentials.connected, false, 'legacy Feishu credentials without metadata should not be treated as connected');

  const repairedLegacyConfig = config.upsertChannelConfig('feishu', {
    credentials: {
      appId: 'cli_legacy_only_credentials',
      appSecret: 'legacy_secret'
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
  assert.strictEqual(repairedLegacyConfig.status, 'configured_pending_pairing', 'saving a legacy Feishu config should keep it pending until pairing completes');
  assert.strictEqual(repairedLegacyConfig.pairingStatus, 'pending', 'saving a legacy Feishu config should persist pending pairing metadata');

  fs.writeFileSync(config.CONFIG_FILE, JSON.stringify({
    channels: {
      feishu: {
        enabled: true,
        status: 'connected',
        pairingStatus: 'paired',
        appId: 'cli_explicit_paired',
        appSecret: 'paired_secret',
        streaming: true,
        pairing: {
          status: 'paired',
          code: 'PAIR-CODE'
        }
      }
    }
  }, null, 2), 'utf8');

  config = loadConfigModule(tempHome);
  const explicitPairedConfig = config.getChannelConfig('feishu');
  assert.strictEqual(explicitPairedConfig.status, 'connected', 'explicit paired Feishu config should remain connected');
  assert.strictEqual(explicitPairedConfig.pairingStatus, 'paired', 'explicit paired Feishu config should keep paired status');
  assert.strictEqual(explicitPairedConfig.connected, true, 'explicit paired Feishu config should remain connected');

  const migratedMainConfig = JSON.parse(fs.readFileSync(config.CONFIG_FILE, 'utf8'));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(migratedMainConfig.channels.feishu, 'status'), false, 'migrated OpenClaw config should strip legacy ClawBox-only status fields');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(migratedMainConfig.channels.feishu, 'pairingStatus'), false, 'migrated OpenClaw config should strip legacy ClawBox-only pairing fields');

  const migratedUiState = JSON.parse(fs.readFileSync(config.CLAWBOX_CHANNEL_STATE_FILE, 'utf8'));
  assert.strictEqual(migratedUiState.channels.feishu.status, 'connected', 'migrated ClawBox UI state should preserve explicit paired status');
  assert.strictEqual(migratedUiState.channels.feishu.pairingStatus, 'paired', 'migrated ClawBox UI state should preserve explicit paired pairing status');

  console.log('PASS Feishu manual config keeps OpenClaw config schema-safe while preserving ClawBox pairing state in sidecar metadata');
} finally {
  process.env.HOME = originalEnv.HOME;
  process.env.USERPROFILE = originalEnv.USERPROFILE;
  try {
    delete require.cache[require.resolve(configModulePath)];
  } catch {}
  fs.rmSync(tempHome, { recursive: true, force: true });
}
