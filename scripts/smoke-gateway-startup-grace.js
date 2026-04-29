const assert = require('assert');
const { __test } = require('../src/server');

assert(__test, 'server.__test should be exported');
assert.strictEqual(typeof __test.parseGatewayRuntimeTimestamp, 'function', 'parseGatewayRuntimeTimestamp should be exported');
assert.strictEqual(typeof __test.detectGatewayStartupFlags, 'function', 'detectGatewayStartupFlags should be exported');
assert.strictEqual(typeof __test.buildOpenClawLifecycle, 'function', 'buildOpenClawLifecycle should be exported');
assert.strictEqual(typeof __test.noteGatewayRecoveryObservation, 'function', 'noteGatewayRecoveryObservation should be exported');
assert.strictEqual(typeof __test.clearGatewayRecoveryObservation, 'function', 'clearGatewayRecoveryObservation should be exported');
assert.strictEqual(typeof __test.cacheOpenClawStateSnapshot, 'function', 'cacheOpenClawStateSnapshot should be exported');
assert.strictEqual(typeof __test.getFastLiteOpenClawLifecycle, 'function', 'getFastLiteOpenClawLifecycle should be exported');
assert.strictEqual(typeof __test.resetStatusCachesForTest, 'function', 'resetStatusCachesForTest should be exported');
assert.strictEqual(typeof __test.rememberObservedOpenClawState, 'function', 'rememberObservedOpenClawState should be exported');

function formatChineseMeridiemTimestamp(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const meridiem = hours >= 12 ? '下午' : '上午';
  const hour12 = hours % 12 || 12;
  return `${year}/${month}/${day} ${meridiem} ${String(hour12).padStart(2, '0')}:${minutes}:${seconds}`;
}

function buildGatewayState(lastRunTime, extra = {}) {
  return {
    installed: true,
    version: 'OpenClaw 2026.4.14 (323493f)',
    openclawPath: 'C:\\Users\\tester\\AppData\\Roaming\\npm\\openclaw.cmd',
    configExists: true,
    configReady: true,
    gatewayReady: true,
    gatewayRunning: false,
    gatewayStatus: {
      data: {
        service: {
          loaded: true,
          runtime: {
            status: 'unknown',
            state: 'Running',
            lastRunTime
          }
        },
        gateway: {
          port: 18789
        },
        port: {
          port: 18789,
          status: 'busy'
        },
        rpc: {
          ok: false
        },
        health: {
          healthy: false
        }
      },
      stdout: 'RPC probe: failed',
      stderr: '',
      error: '',
      ...extra.gatewayStatus
    },
    ...extra
  };
}

const recentTimestamp = formatChineseMeridiemTimestamp(new Date(Date.now() - 12_000));
const staleTimestamp = formatChineseMeridiemTimestamp(new Date(Date.now() - 180_000));

try {
  __test.clearGatewayRecoveryObservation();

  const parsedRecent = __test.parseGatewayRuntimeTimestamp(recentTimestamp);
  assert(Number.isFinite(parsedRecent), 'Chinese gateway runtime timestamps should be parsed');

  const recentState = buildGatewayState(recentTimestamp);
  const recentFlags = __test.detectGatewayStartupFlags(recentState, {
    dashboardUrl: '',
    port: 18789,
    rpcOk: false,
    rpcFailed: true,
    listening: false,
    usable: false,
    unhealthy: true
  });
  assert.strictEqual(recentFlags.startup, true, 'a recent gateway launch should be treated as startup grace');

  const recentLifecycle = __test.buildOpenClawLifecycle(recentState);
  assert.strictEqual(recentLifecycle.stage, 'gateway_starting', 'recent rpc-failed gateway states should surface as startup-in-progress');

  const staleState = buildGatewayState(staleTimestamp);
  const staleLifecycle = __test.buildOpenClawLifecycle(staleState);
  assert.strictEqual(staleLifecycle.stage, 'gateway_unhealthy', 'stale rpc-failed gateway states should still surface as unhealthy');

  __test.noteGatewayRecoveryObservation();
  const manualRecoveryLifecycle = __test.buildOpenClawLifecycle(staleState);
  assert.strictEqual(manualRecoveryLifecycle.stage, 'gateway_starting', 'a fresh ClawBox-triggered restart should grant startup grace even if the service metadata is stale');

  __test.resetStatusCachesForTest();
  __test.noteGatewayRecoveryObservation();
  __test.cacheOpenClawStateSnapshot(staleState);
  const liteLifecycle = __test.getFastLiteOpenClawLifecycle();
  assert.strictEqual(liteLifecycle.stage, 'gateway_starting', 'status-lite should reuse the most recent inspected startup state after a restart instead of falling back to gateway_incomplete');

  const usableDegradedState = {
    ...staleState,
    gatewayReady: true,
    gatewayRunning: false,
    gatewayStatus: {
      data: {
        service: {
          loaded: true,
          runtime: {
            status: 'unknown',
            state: 'Running',
            lastRunTime: staleTimestamp
          }
        },
        gateway: {
          port: 18789
        },
        port: {
          port: 18789,
          status: 'busy'
        },
        rpc: {
          ok: true
        },
        health: {
          healthy: true
        }
      },
      stdout: 'RPC probe: ok',
      stderr: '',
      error: ''
    }
  };
  __test.resetStatusCachesForTest();
  __test.rememberObservedOpenClawState(usableDegradedState);
  const postRecoveryLiteLifecycle = __test.getFastLiteOpenClawLifecycle();
  assert.strictEqual(postRecoveryLiteLifecycle.stage, 'gateway_degraded', 'successful restart recovery should keep status-lite aligned with the observed usable gateway state');

  __test.clearGatewayRecoveryObservation();
  assert.strictEqual(__test.GATEWAY_RECOVERY_TIMEOUT_MS >= 45000, true, 'gateway recovery timeout should cover the observed 26s startup window with buffer');
  assert.strictEqual(__test.GATEWAY_STARTUP_GRACE_MS >= 45000, true, 'startup grace should match the recovery timeout window');

  console.log('PASS gateway startup grace now distinguishes recent cold starts from stale unhealthy rpc-failed states');
} finally {
  __test.clearGatewayRecoveryObservation();
}
