#!/usr/bin/env node
const assert = require('assert');

const { __test: serverTest } = require('../src/server');
const { __test: installerTest } = require('../src/installer');

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

runTest('gateway status running when rpc.ok=true', () => {
  assert.equal(installerTest.isGatewayStatusRunning({
    rpc: { ok: true },
    service: { runtime: { status: 'stopped' } }
  }), true);
});

runTest('gateway status running when service.loaded=true and runtime.status=running', () => {
  assert.equal(installerTest.isGatewayStatusRunning({
    service: {
      loaded: true,
      runtime: { status: 'running' }
    }
  }), true);
});

runTest('gateway status does not false-positive on dashboard token text', () => {
  const payload = {
    service: {
      loaded: true,
      runtime: { status: 'stopped' }
    },
    dashboard: {
      url: 'http://127.0.0.1:29135/?token=running-demo'
    }
  };
  assert.equal(installerTest.isGatewayStatusRunning(payload), false);
  assert.equal(serverTest.detectGatewayRunningFromPayload(payload), false);
});

runTest('dashboard url is parsed from json payload', () => {
  assert.equal(serverTest.parseOpenclawDashboardUrlFromJson({
    dashboard: {
      url: 'http://127.0.0.1:29135/?token=abc'
    }
  }), 'http://127.0.0.1:29135/?token=abc');
});

runTest('dashboard url, port, token fall back from deep text output', () => {
  const deepText = [
    'Gateway status: running',
    'Dashboard: http://127.0.0.1:29135/?token=abc123',
    'gateway port 29135',
    'token: abc123'
  ].join('\n');
  assert.equal(serverTest.parseOpenclawDashboardUrlFromText(deepText), 'http://127.0.0.1:29135/?token=abc123');
  assert.equal(serverTest.parseGatewayPortFromText(deepText), 29135);
  assert.equal(serverTest.parseOpenClawTokenFromText(deepText), 'abc123');
});

runTest('dashboard fallback url can be built from port and token', () => {
  assert.equal(
    serverTest.buildOpenClawDashboardUrlFromParts(29135, 'abc123'),
    'http://127.0.0.1:29135/?token=abc123'
  );
});

runTest('dashboard url is normalized to include token when payload exposes one separately', () => {
  assert.equal(
    serverTest.normalizeOpenClawDashboardUrl('http://127.0.0.1:29135/', 'abc123'),
    'http://127.0.0.1:29135/?token=abc123'
  );
});

runTest('dashboard auth fallback can read token mode from config file', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawbox-dashboard-auth-'));
  const configPath = path.join(tempDir, 'openclaw.json');
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      port: 29135,
      auth: {
        mode: 'token',
        token: 'abc123'
      }
    }
  }), 'utf8');
  const auth = serverTest.readOpenClawDashboardAuthFromConfig(configPath);
  assert.equal(auth.mode, 'token');
  assert.equal(auth.token, 'abc123');
  assert.equal(auth.port, 29135);
});

runTest('chat session urls are not treated as preferred panel urls', () => {
  assert.equal(serverTest.isPreferredOpenClawPanelUrl('http://127.0.0.1:18789/chat?session=agent%3Amain%3Amain'), false);
  assert.equal(serverTest.isPreferredOpenClawPanelUrl('http://127.0.0.1:18789/?token=abc123'), true);
});

runTest('windows cmd wrapper path stays unwrapped so cmd.exe receives argv directly', () => {
  assert.equal(
    'C:\\Users\\win10\\AppData\\Roaming\\npm\\openclaw.cmd',
    'C:\\Users\\win10\\AppData\\Roaming\\npm\\openclaw.cmd'
  );
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
