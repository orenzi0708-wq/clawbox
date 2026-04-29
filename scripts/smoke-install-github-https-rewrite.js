const assert = require('assert');
const { __test } = require('../src/installer');

assert(__test, 'installer.__test should be exported');

const lines = __test.getTemporaryGithubHttpsRewritePowerShellLines();
assert(Array.isArray(lines), 'rewrite helper should return an array');
assert(lines.some((line) => line.includes("GIT_CONFIG_COUNT='3'")), 'should set three temporary git rewrites');
assert(lines.some((line) => line.includes("GIT_CONFIG_VALUE_0='ssh://git@github.com/'")), 'should rewrite ssh://git@github.com/');
assert(lines.some((line) => line.includes("GIT_CONFIG_VALUE_1='git@github.com:'")), 'should rewrite git@github.com:');
assert(lines.some((line) => line.includes("GIT_CONFIG_VALUE_2='git+ssh://git@github.com/'")), 'should rewrite git+ssh://git@github.com/');

const directCommandText = __test.buildWindowsInstallCommandText();
assert(directCommandText.includes("$env:NPM_CONFIG_REGISTRY='https://registry.npmmirror.com'"), 'should keep the temporary npm registry override');
assert(directCommandText.includes("Invoke-WebRequest -UseBasicParsing -Uri 'https://openclaw.ai/install.ps1'"), 'should still download the official installer');
assert(directCommandText.includes("& powershell -NoProfile -ExecutionPolicy Bypass -File $clawboxInstallScript"), 'should still execute the official installer script');
assert(directCommandText.includes("GIT_CONFIG_VALUE_0='ssh://git@github.com/'"), 'direct command text should include the ssh rewrite');
assert(!directCommandText.includes("GIT_CONFIG_VALUE_3='https://github.com/'"), 'direct command should not rewrite github https remotes');

const mirrorBaseUrl = __test.getWindowsGithubGitMirrorBaseUrl();
const mirrorCommandText = __test.buildWindowsInstallCommandText({ githubBaseUrl: mirrorBaseUrl });
assert(mirrorCommandText.includes("GIT_CONFIG_COUNT='4'"), 'mirror command should add a fourth rewrite for https://github.com/');
assert(mirrorCommandText.includes("GIT_CONFIG_VALUE_3='https://github.com/'"), 'mirror command should rewrite github https remotes');
assert(mirrorCommandText.includes(`url.${mirrorBaseUrl}.insteadof`), 'mirror command should point GitHub remotes at the configured mirror');

const portableGitConfig = __test.getWindowsPortableGitBootstrapConfig();
const portableGitLines = __test.buildWindowsPortableGitBootstrapPowerShellLines(portableGitConfig);
assert(Array.isArray(portableGitLines) && portableGitLines.length > 0, 'portable git bootstrap helper should return PowerShell lines');
assert(portableGitLines.some((line) => line.includes('Git.MinGit')), 'portable git bootstrap should include a winget MinGit fallback');
assert(portableGitLines.some((line) => line.includes('npmmirror.com/mirrors/git-for-windows/')), 'portable git bootstrap should include the npmmirror fallback');
assert(portableGitLines.some((line) => line.includes('CLAWBOX_STAGE:GIT_BOOTSTRAP')), 'portable git bootstrap should emit the git bootstrap stage');
assert(directCommandText.includes('Git.MinGit'), 'full install command should embed the portable git winget fallback');
assert(directCommandText.includes('npmmirror.com/mirrors/git-for-windows/'), 'full install command should embed the portable git mirror fallback');

console.log('PASS windows install command builds GitHub git rewrites and portable Git bootstrap fallbacks');
