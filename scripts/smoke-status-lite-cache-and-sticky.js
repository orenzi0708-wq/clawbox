const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { __test } = require('../src/server');

assert(__test, 'server.__test should be exported');
assert.strictEqual(typeof __test.buildObservedOpenClawLifecycle, 'function', 'buildObservedOpenClawLifecycle should be exported');
assert.strictEqual(typeof __test.getFastLiteOpenClawLifecycle, 'function', 'getFastLiteOpenClawLifecycle should be exported');
assert.strictEqual(typeof __test.getRecentHealthyOpenClawLifecycle, 'function', 'getRecentHealthyOpenClawLifecycle should be exported');
assert.strictEqual(typeof __test.resetStatusCachesForTest, 'function', 'resetStatusCachesForTest should be exported');
assert.strictEqual(typeof __test.setCachedOpenClawStateForTest, 'function', 'setCachedOpenClawStateForTest should be exported');
assert.strictEqual(typeof __test.setLastHealthyOpenClawLifecycleForTest, 'function', 'setLastHealthyOpenClawLifecycleForTest should be exported');
assert.strictEqual(typeof __test.setQuickOpenClawLifecycleSnapshotForTest, 'function', 'setQuickOpenClawLifecycleSnapshotForTest should be exported');

const healthyState = {
  installed: true,
  version: 'OpenClaw 2026.4.14 (323493f)',
  openclawPath: 'C:\\Users\\tester\\AppData\\Roaming\\npm\\openclaw.cmd',
  configExists: true,
  configReady: true,
  gatewayReady: true,
  gatewayRunning: true,
  gatewayStatus: {
    data: {
      gateway: { port: 18789 },
      rpc: { ok: true }
    },
    stdout: '',
    stderr: '',
    error: ''
  }
};

const unhealthyState = {
  installed: true,
  version: 'OpenClaw 2026.4.14 (323493f)',
  openclawPath: 'C:\\Users\\tester\\AppData\\Roaming\\npm\\openclaw.cmd',
  configExists: true,
  configReady: true,
  gatewayReady: true,
  gatewayRunning: false,
  gatewayStatus: {
    data: {
      gateway: { port: 18789 },
      rpc: { ok: false }
    },
    stdout: '',
    stderr: '',
    error: ''
  }
};

__test.resetStatusCachesForTest();
__test.setCachedOpenClawStateForTest(healthyState);
let lifecycle = __test.getFastLiteOpenClawLifecycle();
assert.strictEqual(lifecycle.stage, 'ready', 'lite lifecycle should reuse the fresh inspected state instead of falling back to a config-only placeholder');
assert.strictEqual(lifecycle.gatewayRunning, true, 'lite lifecycle should preserve the running gateway state from the cached inspect result');

__test.resetStatusCachesForTest();
__test.setLastHealthyOpenClawLifecycleForTest({
  stage: 'ready',
  gatewayRunning: true,
  installed: true,
  configReady: true
});
lifecycle = __test.buildObservedOpenClawLifecycle(unhealthyState);
assert.strictEqual(lifecycle.stage, 'gateway_unhealthy', 'an unhealthy live state should not be overwritten by the previous healthy sticky state');
assert.notStrictEqual(lifecycle.sticky, true, 'live unhealthy states should not be marked as sticky');

__test.resetStatusCachesForTest();
__test.setQuickOpenClawLifecycleSnapshotForTest({
  installed: true,
  version: null,
  path: 'C:\\Users\\tester\\AppData\\Roaming\\npm\\openclaw.cmd',
  configExists: true,
  configReady: true,
  gatewayReady: false,
  gatewayRunning: false,
  gatewayUsable: false,
  gatewayUnhealthy: false,
  gatewayStarting: false,
  gatewayProbeTimeout: false,
  gatewayFailure: null,
  summary: 'snapshot',
  stage: 'gateway_incomplete',
  title: '已安装，等待检测',
  detail: '等待探测'
});
__test.setLastHealthyOpenClawLifecycleForTest({
  installed: true,
  configReady: true,
  gatewayReady: true,
  gatewayRunning: true,
  gatewayUsable: true,
  stage: 'ready',
  title: '已安装并运行',
  detail: 'OpenClaw 与 Gateway 均已就绪。'
}, 4000);
lifecycle = __test.getFastLiteOpenClawLifecycle();
assert.strictEqual(lifecycle.stage, 'ready', 'lite lifecycle should keep the recently healthy status while a fresh inspect is warming up');
assert.strictEqual(lifecycle.gatewayRunning, true, 'lite lifecycle should not oscillate back to gateway_incomplete between polls');
assert.strictEqual(lifecycle.sticky, true, 'recently healthy lite lifecycle should be marked sticky while background validation runs');

__test.resetStatusCachesForTest();
__test.setQuickOpenClawLifecycleSnapshotForTest({
  installed: true,
  version: null,
  path: 'C:\\Users\\tester\\AppData\\Roaming\\npm\\openclaw.cmd',
  configExists: true,
  configReady: true,
  gatewayReady: false,
  gatewayRunning: false,
  gatewayUsable: false,
  gatewayUnhealthy: false,
  gatewayStarting: false,
  gatewayProbeTimeout: false,
  gatewayFailure: null,
  summary: 'snapshot',
  stage: 'gateway_incomplete',
  title: '已安装，等待检测',
  detail: '等待探测'
});
__test.setLastHealthyOpenClawLifecycleForTest({
  installed: true,
  configReady: true,
  gatewayReady: true,
  gatewayRunning: true,
  gatewayUsable: true,
  stage: 'ready',
  title: '已安装并运行',
  detail: 'OpenClaw 与 Gateway 均已就绪。'
}, 15000);
lifecycle = __test.getFastLiteOpenClawLifecycle();
assert.strictEqual(lifecycle.stage, 'gateway_incomplete', 'expired healthy observations should still fall back to the conservative snapshot');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
assert(serverSource.includes('getCachedRootStatus()'), 'status routes should use the cached root status helper');
assert(serverSource.includes('getCachedClawHubProbe()'), 'status routes should use the cached ClawHub probe helper');
assert(serverSource.includes('const recentHealthyLifecycle = getRecentHealthyOpenClawLifecycle();'), 'fast lite lifecycle should reuse the recent healthy lifecycle before falling back to a conservative snapshot');

console.log('PASS status-lite keeps recent healthy Gateway state stable while background revalidation runs');
