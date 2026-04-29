const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { __test } = require('../src/server');

assert(__test, 'server.__test should be exported');
assert.strictEqual(typeof __test.resolveOpenClawDashboardTarget, 'function', 'resolveOpenClawDashboardTarget should be exported');
assert.strictEqual(typeof __test.buildObservedDashboardOpenClawLifecycle, 'function', 'buildObservedDashboardOpenClawLifecycle should be exported');
assert.strictEqual(typeof __test.buildObservedDashboardOpenClawState, 'function', 'buildObservedDashboardOpenClawState should be exported');
assert.strictEqual(typeof __test.cacheObservedOpenClawDashboardSuccess, 'function', 'cacheObservedOpenClawDashboardSuccess should be exported');
assert.strictEqual(typeof __test.rememberObservedOpenClawState, 'function', 'rememberObservedOpenClawState should be exported');
assert.strictEqual(typeof __test.getFastLiteOpenClawLifecycle, 'function', 'getFastLiteOpenClawLifecycle should be exported');
assert.strictEqual(typeof __test.resetStatusCachesForTest, 'function', 'resetStatusCachesForTest should be exported');

const staleGatewayState = {
  installed: true,
  version: 'OpenClaw 2026.4.14 (323493f)',
  openclawPath: 'C:\\Users\\tester\\AppData\\Roaming\\npm\\openclaw.cmd',
  configExists: true,
  configReady: true,
  gatewayReady: false,
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
let lifecycle = __test.getFastLiteOpenClawLifecycle();
assert.notStrictEqual(lifecycle.stage, 'ready', 'the test should start without a synthetic healthy dashboard observation');

const target = __test.resolveOpenClawDashboardTarget({
  payload: {
    gateway: { port: 18789 },
    rpc: { ok: true }
  },
  configAuth: {
    exists: true,
    mode: 'token',
    token: 'test-token',
    port: 18789,
    url: null
  }
});
assert.strictEqual(target.dashboardUrl, 'http://127.0.0.1:18789/?token=test-token', 'dashboard target should be built directly from gateway json + config token');
assert.strictEqual(target.needsDeepProbe, false, 'dashboard target should skip the deep probe when json already provides a usable port and rpc status');

const failedTarget = __test.resolveOpenClawDashboardTarget({
  payload: {
    gateway: { port: 18789 },
    rpc: { ok: false }
  },
  statusOutputs: ['Dashboard: http://127.0.0.1:18789/', 'RPC probe: failed'],
  configAuth: {
    exists: true,
    mode: 'token',
    token: 'test-token',
    port: 18789,
    url: null
  }
});
assert.strictEqual(failedTarget.dashboardUrl, null, 'rpc-failed gateway status should not be promoted to a usable dashboard url from deep text alone');
assert.strictEqual(failedTarget.needsDeepProbe, false, 'rpc-failed status should not keep paying for a deep probe that only returns stale dashboard text');

const observedState = __test.buildObservedDashboardOpenClawState(staleGatewayState, {
  url: target.dashboardUrl,
  port: target.gatewayPort,
  token: target.gatewayToken
});
const observedLifecycle = __test.buildObservedDashboardOpenClawLifecycle(observedState);
assert.strictEqual(observedLifecycle.stage, 'ready', 'dashboard-open observations should synthesize a ready lifecycle without extra heavy probes');

__test.cacheObservedOpenClawDashboardSuccess(
  staleGatewayState.openclawPath,
  { exists: true, mode: 'token', token: 'test-token', port: 18789, url: null },
  target,
  { gateway: { port: 18789 }, rpc: { ok: true } },
  [],
  staleGatewayState.version
);

lifecycle = __test.getFastLiteOpenClawLifecycle();
assert.strictEqual(lifecycle.stage, 'ready', 'status-lite should reuse the most recent reachable Dashboard observation');
assert.strictEqual(lifecycle.gatewayRunning, true, 'status-lite should stay aligned with the confirmed Dashboard-open state');
assert.strictEqual(lifecycle.gatewayReady, true, 'reachable Dashboard observations should promote the gateway to ready');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
assert(appSource.includes('async function syncOpenClawLifecycleAfterDashboardOpen()'), 'dashboard open flow should have a dedicated lifecycle sync helper');
assert(appSource.includes('syncOpenClawLifecycleAfterDashboardOpen().catch(() => {});'), 'dashboard open flow should trigger lifecycle sync after opening the panel');
assert(appSource.includes('const lifecyclePromise = loadFullStatus().catch(() => loadStatus().catch(() => {}));'), 'dashboard open flow should promote the first post-open sync to a full status probe');
assert(appSource.includes('async function loadFullStatus()'), 'the frontend should expose a dedicated full status loader for gateway rechecks');
assert(appSource.includes('scheduleFullStatusProbe(50);'), 'ambiguous lite gateway states should trigger a queued full status probe');
assert(!appSource.includes('const canReuseLastDashboardUrl ='), 'dashboard open flow should no longer short-circuit directly to a cached URL');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
assert(!serverSource.includes("timer.log('ok_cached'"), 'dashboard open route should no longer return success purely from a cached gateway observation');
assert(serverSource.includes('scheduleOpenClawStateWarmup().catch(() => {});'), 'server should prewarm or queue a full OpenClaw inspect when lite status is only a snapshot');

console.log('PASS dashboard-open now revalidates through the backend and queues a full status sync when lite gateway state is ambiguous');
