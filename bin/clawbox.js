#!/usr/bin/env node

const { startServer } = require('../src/server');
const { checkNodeVersion } = require('../src/installer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const DEV_MODE = args.includes('--dev');
const PORT = args.find(a => a.startsWith('--port='))?.split('=')[1] || 3456;

/**
 * 确保 clawbox 在全局可用（自动 npm link）
 */
function ensureGlobalLink() {
  try {
    // 检查 clawbox 命令是否已全局可用
    const which = process.platform === 'win32' ? 'where' : 'which';
    try {
      execSync(`${which} clawbox`, { encoding: 'utf8', timeout: 5000 });
      return; // 已经可用
    } catch {}

    // 尝试自动 npm link
    const projectDir = path.resolve(__dirname, '..');
    if (fs.existsSync(path.join(projectDir, 'package.json'))) {
      console.log('  ⚙ 首次运行，正在配置全局命令...');
      execSync('npm link', {
        cwd: projectDir,
        stdio: 'ignore',
        timeout: 30000
      });
      console.log('  ✓ 全局命令已配置，之后可直接输入 clawbox 启动\n');
    }
  } catch {
    // npm link 失败不影响运行，用户还是可以通过 node bin/clawbox.js 启动
  }
}

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════════╗');
  console.log('  ║       📦 ClawBox v0.2.0           ║');
  console.log('  ║   一键部署 & 管理 OpenClaw         ║');
  console.log('  ╚═══════════════════════════════════╝');
  console.log('');

  // 检查 Node.js 版本
  const nodeOk = checkNodeVersion();
  if (!nodeOk) {
    console.error('❌ 需要 Node.js >= 18.0.0，请先升级');
    process.exit(1);
  }

  // 自动配置全局链接
  ensureGlobalLink();

  // 启动 Web 服务器
  await startServer(PORT, DEV_MODE);
}

main().catch(err => {
  console.error('启动失败:', err.message);
  process.exit(1);
});
