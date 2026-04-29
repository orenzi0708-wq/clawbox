const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { __test } = require('../src/installer');

assert(__test, 'installer.__test should be exported');
assert.strictEqual(typeof __test.getOpenClawStateCleanupTargets, 'function', 'cleanup target helper should be exported for tests');

const cleanupTargets = __test.getOpenClawStateCleanupTargets('C:\\Users\\tester', 'C:\\Temp\\clawbox-test');
assert(cleanupTargets.includes(path.join('C:\\Temp\\clawbox-test', 'openclaw')), 'cleanup targets should include the temp openclaw runtime directory');
assert(cleanupTargets.includes(path.join('C:\\Users\\tester', '.openclaw', 'openclaw.json')), 'cleanup targets should still include the primary openclaw config file');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
assert(appSource.includes('function resetInstallButtonState(force = false)'), 'front-end should expose install button reset logic');
assert(appSource.includes('function resetUninstallButtonState(force = false)'), 'front-end should expose uninstall button reset logic');
assert(/else\s*\{\s*resetInstallButtonState\(\);\s*resetUpdateButtonState\(\);\s*resetUninstallButtonState\(\);[\s\S]*?document\.getElementById\('btnInstall'\)\.style\.display = 'inline-block';/m.test(appSource), 'loadStatus should reset install/update/uninstall buttons before showing the install action again');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
assert(serverSource.includes("invalidateStatusCaches({ clearSticky: true });"), 'server should invalidate sticky caches after uninstall-like flows');

console.log('PASS uninstall cleanup targets include temp runtime residue and UI reset safeguards remain in place');
