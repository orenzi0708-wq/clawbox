const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src');
const publicDir = path.join(rootDir, 'public');
const tauriServerDir = path.join(rootDir, 'src-tauri', 'server');

const fileCopies = [
  [path.join('src', 'server.js'), path.join('src', 'server.js')],
  [path.join('src', 'config.js'), path.join('src', 'config.js')],
  [path.join('src', 'installer.js'), path.join('src', 'installer.js')]
];

function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyFile(relativeFrom, relativeTo) {
  const fromPath = path.join(rootDir, relativeFrom);
  const toPath = path.join(tauriServerDir, relativeTo);
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.copyFileSync(fromPath, toPath);
}

function copyDir(fromDir, toDir) {
  const entries = fs.readdirSync(fromDir, { withFileTypes: true });
  fs.mkdirSync(toDir, { recursive: true });

  for (const entry of entries) {
    const fromPath = path.join(fromDir, entry.name);
    const toPath = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath);
      continue;
    }
    fs.mkdirSync(path.dirname(toPath), { recursive: true });
    fs.copyFileSync(fromPath, toPath);
  }
}

function syncServerResources() {
  fs.mkdirSync(tauriServerDir, { recursive: true });

  removePath(path.join(tauriServerDir, 'package.json'));
  for (const [, relativeTo] of fileCopies) {
    removePath(path.join(tauriServerDir, relativeTo));
  }
  removePath(path.join(tauriServerDir, 'public'));

  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  delete packageJson.scripts?.['prepare:tauri-server'];
  fs.writeFileSync(
    path.join(tauriServerDir, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );

  for (const [relativeFrom, relativeTo] of fileCopies) {
    copyFile(relativeFrom, relativeTo);
  }
  copyDir(publicDir, path.join(tauriServerDir, 'public'));
}

function installDependencies() {
  const result = spawnSync('npm', ['install', '--omit=dev', '--ignore-scripts'], {
    cwd: tauriServerDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function validate() {
  const requiredPaths = [
    path.join(tauriServerDir, 'package.json'),
    path.join(tauriServerDir, 'src', 'server.js'),
    path.join(tauriServerDir, 'src', 'config.js'),
    path.join(tauriServerDir, 'src', 'installer.js'),
    path.join(tauriServerDir, 'public', 'index.html'),
    path.join(tauriServerDir, 'public', 'js', 'app.js'),
    path.join(tauriServerDir, 'public', 'css', 'style.css')
  ];

  const missing = requiredPaths.filter((targetPath) => !fs.existsSync(targetPath));
  if (missing.length) {
    console.error('Missing prepared Tauri server resources:');
    for (const targetPath of missing) {
      console.error(`- ${path.relative(rootDir, targetPath)}`);
    }
    process.exit(1);
  }
}

syncServerResources();
if (process.argv.includes('--install')) {
  installDependencies();
}
validate();
