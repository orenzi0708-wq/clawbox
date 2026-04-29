const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

assert(
  appSource.includes('function shouldShowOpenClawPostInstallActions(lifecycle)'),
  'front-end should expose a dedicated helper for post-install action visibility',
);
assert(
  appSource.includes("['init_incomplete', 'gateway_incomplete', 'gateway_starting']"),
  'post-install action visibility should stay blocked for incomplete install lifecycle stages',
);

const applyStatusMatch = appSource.match(/if \(data\.openclawInstalled\) \{([\s\S]*?)\n  \} else \{/);
assert(applyStatusMatch, 'applyStatusPayload should keep a dedicated installed branch');

const installedBranch = applyStatusMatch[1];
assert(
  installedBranch.includes('const showPostInstallActions = shouldShowOpenClawPostInstallActions(lifecycle);'),
  'installed status handling should derive post-install button visibility from lifecycle stage',
);
assert(
  !installedBranch.includes('resetInstallButtonState();'),
  'installed-but-incomplete states should not reset the in-flight install button label',
);
assert(
  installedBranch.includes("document.getElementById('btnInstall').style.display = showPostInstallActions ? 'none' : 'inline-block';"),
  'install button should remain visible until post-install actions are allowed',
);
assert(
  installedBranch.includes("document.getElementById('btnUpdate').style.display = showPostInstallActions ? 'inline-block' : 'none';"),
  'update button should stay hidden until post-install actions are allowed',
);
assert(
  installedBranch.includes("document.getElementById('btnUninstall').style.display = showPostInstallActions ? 'inline-block' : 'none';"),
  'uninstall button should stay hidden until post-install actions are allowed',
);

console.log('PASS post-install buttons stay hidden until OpenClaw initialization fully completes');
