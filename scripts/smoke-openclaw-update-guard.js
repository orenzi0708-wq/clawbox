const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { __test } = require('../src/installer');
const { __test: serverTest } = require('../src/server');

assert(__test, 'installer.__test should be exported');
assert(serverTest, 'server.__test should be exported');
assert.strictEqual(typeof __test.buildWindowsOpenClawUpdateCommandText, 'function', 'windows update command builder should be exported');
assert.strictEqual(typeof __test.verifyOpenClawUpdatePreconditions, 'function', 'update precondition guard should be exported');
assert.strictEqual(typeof __test.formatOpenClawUpdateFailureMessage, 'function', 'update failure formatter should be exported');
assert.strictEqual(typeof __test.extractOpenClawReleaseVersion, 'function', 'openclaw version extractor should be exported');

const missingInstall = __test.verifyOpenClawUpdatePreconditions({ installed: false, openclawPath: null });
assert.strictEqual(missingInstall.ok, false, 'update should fail fast when OpenClaw is not installed');
assert(/先完成安装后再检查更新/.test(missingInstall.error), 'update precondition error should clearly instruct the user to install first');

const installedState = __test.verifyOpenClawUpdatePreconditions({
  installed: true,
  openclawPath: 'C:\\Users\\tester\\AppData\\Roaming\\npm\\openclaw.cmd'
});
assert.strictEqual(installedState.ok, true, 'update should proceed when OpenClaw is already installed');

assert.strictEqual(__test.extractOpenClawReleaseVersion('OpenClaw 2026.4.15 (041266a)'), '2026.4.15', 'version extractor should normalize the installed OpenClaw version');
assert.strictEqual(__test.extractOpenClawReleaseVersion('2026.4.15'), '2026.4.15', 'version extractor should preserve plain release versions');

const directCommandText = __test.buildWindowsOpenClawUpdateCommandText();
assert(directCommandText.includes("$env:NPM_CONFIG_REGISTRY='https://registry.npmmirror.com'"), 'windows update should keep the temporary npm registry override');
assert(directCommandText.includes("Write-Output 'CLAWBOX_STAGE:NPM_UPDATE'"), 'windows update should expose a dedicated npm update stage marker');
assert(directCommandText.includes("Invoke-WebRequest -UseBasicParsing -Uri 'https://openclaw.ai/install.ps1'"), 'windows update should reuse the official installer download flow');
assert(directCommandText.includes("& powershell -NoProfile -ExecutionPolicy Bypass -File $clawboxInstallScript"), 'windows update should reuse the official installer execution flow');
assert(directCommandText.includes("GIT_CONFIG_VALUE_0='ssh://git@github.com/'"), 'windows update should reuse the GitHub ssh rewrite');
assert(directCommandText.includes('Git.MinGit'), 'windows update should reuse the portable Git winget fallback');
assert(directCommandText.includes('npmmirror.com/mirrors/git-for-windows/'), 'windows update should reuse the portable Git mirror fallback');

const mirrorBaseUrl = __test.getWindowsGithubGitMirrorBaseUrl();
const mirrorCommandText = __test.buildWindowsOpenClawUpdateCommandText({ githubBaseUrl: mirrorBaseUrl });
assert(mirrorCommandText.includes("GIT_CONFIG_COUNT='4'"), 'mirror fallback should add a fourth GitHub https rewrite');
assert(mirrorCommandText.includes("GIT_CONFIG_VALUE_3='https://github.com/'"), 'mirror fallback should rewrite GitHub https remotes');
assert(mirrorCommandText.includes(`url.${mirrorBaseUrl}.insteadof`), 'mirror fallback should point GitHub remotes at the configured mirror');

const formattedFailure = __test.formatOpenClawUpdateFailureMessage('更新失败，退出码: 1', 'npm error code 128');
assert(formattedFailure.includes('更新失败，退出码: 1'), 'failure formatter should keep the primary error message');
assert(formattedFailure.includes('最近输出：'), 'failure formatter should include recent command output');

const installerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'installer.js'), 'utf8');
const updateFunctionMatches = installerSource.match(/async function updateOpenClaw\(onProgress\)/g) || [];
assert.strictEqual(updateFunctionMatches.length, 1, 'installer.js should keep a single updateOpenClaw implementation');
assert(installerSource.includes('const precheck = verifyOpenClawUpdatePreconditions();'), 'update flow should gate on the install precondition check');
assert(installerSource.includes('const latestVersionResult = getLatestOpenClawPackageVersion();'), 'update flow should probe the remote latest version before forcing a reinstall');
assert(installerSource.includes("skipped: 'already_latest'"), 'update flow should short-circuit when the installed version already matches latest');
assert(installerSource.includes('getWindowsOpenClawUpdateCommands()'), 'update flow should use the dedicated Windows update attempts');
const nodeCommonPathsStart = installerSource.indexOf('function getNodeCommonPaths() {');
const nodeCommonPathsEnd = installerSource.indexOf('function detectNodeSource', nodeCommonPathsStart);
assert(nodeCommonPathsStart >= 0 && nodeCommonPathsEnd > nodeCommonPathsStart, 'getNodeCommonPaths() should still exist');
const nodeCommonPathsSource = installerSource.slice(nodeCommonPathsStart, nodeCommonPathsEnd);
assert(!nodeCommonPathsSource.includes('getLatestOpenClawPackageVersion'), 'getNodeCommonPaths() should not contain update preflight logic');

assert.strictEqual(typeof serverTest.syncStatusCachesAfterOpenClawUpdate, 'function', 'server should export update cache sync helper for regression tests');
serverTest.resetStatusCachesForTest();
serverTest.syncStatusCachesAfterOpenClawUpdate({
  success: true,
  skipped: 'already_latest',
  state: {
    installed: true,
    version: 'OpenClaw 2026.4.15 (041266a)',
    openclawPath: 'C:\\Users\\tester\\AppData\\Roaming\\npm\\openclaw.cmd',
    configExists: true,
    configReady: true,
    gatewayReady: true,
    gatewayRunning: true,
    clawhubAvailable: true
  }
});
const latestLifecycle = serverTest.getFastLiteOpenClawLifecycle();
assert.strictEqual(latestLifecycle.stage, 'ready', 'already-latest updates should keep the ready lifecycle cached');
assert.strictEqual(latestLifecycle.installed, true, 'already-latest updates should keep OpenClaw marked installed');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
assert(appSource.includes("data.skipped === 'already_latest'"), 'frontend should distinguish already-latest updates from real installs');
assert(appSource.includes('已是最新版本'), 'frontend should show a dedicated already-latest message');

console.log('PASS OpenClaw update now short-circuits already-latest checks and keeps UI state stable');
