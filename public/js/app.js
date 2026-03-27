// ClawBox 前端逻辑

// ========== 初始化 ==========

let currentModelConfig = null;
const TIER_MODEL_MAP = {
  omni: 'mimo/mimo-v2-omni',
  pro: 'mimo/mimo-v2-pro',
  flash: 'mimo/mimo-v2-flash'
};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadStatus();
  loadModelConfig();
  loadFeishuConfig();

  // 点击 Skills 标签时检查 clawhub
  document.querySelector('[data-tab="skills"]')?.addEventListener('click', () => {
    if (!clawhubReady) checkClawHub();
  });

  // 点击工具标签时加载状态
  document.querySelector('[data-tab="tools"]')?.addEventListener('click', () => {
    loadToolStatus();
  });
});

// ========== 标签页切换 ==========

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ========== 状态加载 ==========

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    document.getElementById('osInfo').textContent = data.os;
    document.getElementById('nodeInfo').textContent = data.nodeOk
      ? `✓ ${data.nodeVersion}`
      : `✗ ${data.nodeVersion}`;
    document.getElementById('nodeInfo').className = `value ${data.nodeOk ? 'ok' : 'err'}`;

    if (data.openclawInstalled) {
      document.getElementById('openclawInfo').textContent = `✓ ${data.openclawVersion || '已安装'}`;
      document.getElementById('openclawInfo').className = 'value ok';
      document.getElementById('btnInstall').style.display = 'none';
      document.getElementById('btnUpdate').style.display = 'inline-block';
      document.getElementById('btnUninstall').style.display = 'inline-block';
    } else {
      document.getElementById('openclawInfo').textContent = '✗ 未安装';
      document.getElementById('openclawInfo').className = 'value err';
      document.getElementById('btnInstall').style.display = 'inline-block';
      document.getElementById('btnUpdate').style.display = 'none';
      document.getElementById('btnUninstall').style.display = 'none';
    }

    document.getElementById('gatewayInfo').textContent = data.gatewayRunning ? '● 运行中' : '○ 未运行';
    document.getElementById('gatewayInfo').className = `value ${data.gatewayRunning ? 'ok' : 'warn'}`;

    // Root 提示
    if (data.isRoot) {
      document.getElementById('rootHint').style.display = 'flex';
      document.getElementById('sudoHint').style.display = 'none';
    } else {
      document.getElementById('rootHint').style.display = 'none';
      document.getElementById('sudoHint').style.display = 'flex';
    }
  } catch {
    document.getElementById('osInfo').textContent = '检测失败';
  }
}

// ========== 模型配置 ==========

async function loadModelConfig() {
  try {
    const res = await fetch('/api/config/model');
    currentModelConfig = await res.json();

    // 设置提供商
    document.getElementById('modelProvider').value = currentModelConfig.provider || 'mimo';
    onProviderChange();

    // 设置档位
    if (currentModelConfig.currentTier) {
      selectTier(currentModelConfig.currentTier);
    }

    // 设置模型
    if (currentModelConfig.model) {
      document.getElementById('modelSelect').value = currentModelConfig.model;
    }

    // API Key
    if (currentModelConfig.apiKey) {
      document.getElementById('apiKeyPreview').textContent =
        `当前: ${currentModelConfig.apiKeyPreview}`;
    }

    // Base URL
    if (currentModelConfig.baseUrl) {
      document.getElementById('baseUrl').value = currentModelConfig.baseUrl;
    }
  } catch (err) {
    console.error('加载模型配置失败:', err);
  }
}

function onProviderChange() {
  const provider = document.getElementById('modelProvider').value;
  const mimoTier = document.getElementById('mimoTierGroup');
  const modelSelect = document.getElementById('modelSelectGroup');
  const baseUrl = document.getElementById('baseUrlGroup');

  // MIMO 显示档位选择器
  if (provider === 'mimo') {
    mimoTier.style.display = 'block';
    modelSelect.style.display = 'none';
  } else {
    mimoTier.style.display = 'none';
    modelSelect.style.display = 'block';
    populateModelSelect(provider);
  }

  // 自定义显示 Base URL
  baseUrl.style.display = provider === 'custom' ? 'block' : 'none';
}

function selectTier(tier) {
  document.querySelectorAll('.tier-card').forEach(card => {
    card.classList.toggle('active', card.dataset.tier === tier);
  });
}

function populateModelSelect(provider) {
  const select = document.getElementById('modelSelect');
  select.innerHTML = '';

  const models = currentModelConfig?.otherModels || [];
  const providerMap = {
    deepseek: 'deepseek',
    google: 'google',
    anthropic: 'anthropic',
    openai: 'openai'
  };

  models
    .filter(m => m.id.startsWith(providerMap[provider] || '___'))
    .forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} - ${m.desc}`;
      select.appendChild(opt);
    });
}

async function saveModelConfig() {
  const provider = document.getElementById('modelProvider').value;
  const tier = document.querySelector('.tier-card.active')?.dataset.tier || 'pro';
  let model = provider === 'mimo'
    ? TIER_MODEL_MAP[tier]
    : document.getElementById('modelSelect').value;
  // 如果 model 带了 provider 前缀，去掉（后端会自动拼接）
  if (model.startsWith(provider + '/')) {
    model = model.slice(provider.length + 1);
  }
  const apiKey = document.getElementById('apiKey').value;
  const baseUrl = document.getElementById('baseUrl').value;

  try {
    const res = await fetch('/api/config/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, apiKey, baseUrl })
    });
    const data = await res.json();

    const msg = document.getElementById('modelSaveMsg');
    if (data.success) {
      msg.textContent = '✓ 已保存';
      msg.className = 'save-msg success';
      document.getElementById('apiKey').value = '';
      loadModelConfig();
    } else {
      msg.textContent = '✗ 保存失败';
      msg.className = 'save-msg error';
    }
    setTimeout(() => { msg.textContent = ''; }, 3000);
  } catch (err) {
    alert('保存失败: ' + err.message);
  }
}

// ========== 飞书配置 ==========

async function loadFeishuConfig() {
  try {
    const res = await fetch('/api/config/feishu');
    const data = await res.json();

    if (data.appId) {
      document.getElementById('feishuAppId').value = data.appId;
      document.getElementById('feishuAppSecret').placeholder = '已设置，重新输入可修改';
    }
    document.getElementById('feishuStreaming').checked = data.streaming;
  } catch (err) {
    console.error('加载飞书配置失败:', err);
  }
}

async function saveFeishuConfig() {
  const appId = document.getElementById('feishuAppId').value;
  const appSecret = document.getElementById('feishuAppSecret').value;
  const streaming = document.getElementById('feishuStreaming').checked;

  try {
    const res = await fetch('/api/config/feishu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, appSecret, streaming })
    });
    const data = await res.json();

    const msg = document.getElementById('feishuSaveMsg');
    if (data.success) {
      msg.textContent = '✓ 已保存';
      msg.className = 'save-msg success';
      document.getElementById('feishuAppSecret').value = '';
    } else {
      msg.textContent = '✗ 保存失败';
      msg.className = 'save-msg error';
    }
    setTimeout(() => { msg.textContent = ''; }, 3000);
  } catch (err) {
    alert('保存失败: ' + err.message);
  }
}

// ========== 安装 ==========

async function startInstall() {
  const btn = document.getElementById('btnInstall');
  const log = document.getElementById('installLog');
  const steps = document.getElementById('installSteps');

  btn.disabled = true;
  btn.textContent = '安装中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/install', { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' && data.steps) {
            renderSteps(steps, data.steps);
          }
          if (data.type === 'done') {
            if (data.success) {
              btn.textContent = '✓ 安装完成';
              btn.style.background = 'var(--success)';
              loadStatus();
            } else {
              btn.textContent = '安装失败，重试';
              btn.disabled = false;
            }
          }
        }
      }
    }
  } catch (err) {
    btn.textContent = '安装失败，重试';
    btn.disabled = false;
    steps.innerHTML += `<div class="install-step"><span class="icon">✗</span><span class="detail">${err.message}</span></div>`;
  }
}

async function startUpdate() {
  const btn = document.getElementById('btnUpdate');
  const log = document.getElementById('installLog');
  const steps = document.getElementById('installSteps');

  btn.disabled = true;
  btn.textContent = '更新中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/update', { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' && data.steps) {
            renderSteps(steps, data.steps);
          }
          if (data.type === 'done') {
            btn.textContent = data.success ? '✓ 更新完成' : '更新失败';
            btn.disabled = false;
            loadStatus();
          }
        }
      }
    }
  } catch (err) {
    btn.textContent = '更新失败';
    btn.disabled = false;
  }
}

// ========== 卸载 ==========

function confirmUninstall() {
  document.getElementById('uninstallModal').style.display = 'flex';
}

function closeUninstallModal() {
  document.getElementById('uninstallModal').style.display = 'none';
}

async function startUninstall() {
  closeUninstallModal();

  const btn = document.getElementById('btnUninstall');
  const log = document.getElementById('installLog');
  const steps = document.getElementById('installSteps');

  btn.disabled = true;
  btn.textContent = '卸载中...';
  log.style.display = 'block';
  steps.innerHTML = '';

  try {
    const res = await fetch('/api/uninstall', { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' && data.steps) {
            renderSteps(steps, data.steps);
          }
          if (data.type === 'done') {
            if (data.success) {
              btn.textContent = '✓ 已卸载';
              btn.style.background = 'var(--error)';
            } else {
              btn.textContent = '卸载失败，重试';
              btn.disabled = false;
            }
            loadStatus();
          }
        }
      }
    }
  } catch (err) {
    btn.textContent = '卸载失败，重试';
    btn.disabled = false;
    steps.innerHTML += `<div class="install-step"><span class="icon">✗</span><span class="detail">${err.message}</span></div>`;
  }
}

function renderSteps(container, steps) {
  const icons = { done: '✓', running: '⏳', error: '✗', waiting: '○' };
  container.innerHTML = steps.map(s => `
    <div class="install-step">
      <span class="icon">${icons[s.status] || '○'}</span>
      <span class="name">${s.name}</span>
      <span class="detail">${s.detail || ''}</span>
    </div>
  `).join('');
}

// ========== 网关 ==========

async function restartGateway() {
  const msg = document.getElementById('restartMsg');
  msg.textContent = '重启中...';
  msg.className = 'save-msg';

  try {
    const res = await fetch('/api/gateway/restart', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      msg.textContent = '✓ 网关已重启';
      msg.className = 'save-msg success';
      setTimeout(() => {
        loadStatus();
      }, 1500);
    } else {
      msg.textContent = `✗ ${data.error}`;
      msg.className = 'save-msg error';
    }
  } catch (err) {
    msg.textContent = '✗ 重启失败';
    msg.className = 'save-msg error';
  }
  setTimeout(() => { msg.textContent = ''; }, 3000);
}

// ========== 工具面板 ==========

async function loadToolStatus() {
  try {
    const res = await fetch('/api/tools/status');
    const data = await res.json();

    // Node.js
    const nodeEl = document.getElementById('toolNodeStatus');
    if (data.node?.installed) {
      nodeEl.textContent = `${data.node.version} (${data.node.path})`;
      nodeEl.className = 'tool-status ok';
    } else {
      nodeEl.textContent = '未安装';
      nodeEl.className = 'tool-status err';
    }

    // ClawHub
    const clawhubEl = document.getElementById('toolClawhubStatus');
    if (data.clawhub?.installed) {
      clawhubEl.textContent = `已安装 (${data.clawhub.path})`;
      clawhubEl.className = 'tool-status ok';
    } else {
      clawhubEl.textContent = '未安装';
      clawhubEl.className = 'tool-status err';
    }

    // OpenClaw
    const openclawEl = document.getElementById('toolOpenclawStatus');
    if (data.openclaw?.installed) {
      openclawEl.textContent = data.openclaw.version || '已安装';
      openclawEl.className = 'tool-status ok';
    } else {
      openclawEl.textContent = '未安装';
      openclawEl.className = 'tool-status err';
    }
  } catch (err) {
    console.error('加载工具状态失败:', err);
  }
}

function showToolLog(msg, type = 'info') {
  const log = document.getElementById('toolLog');
  const content = document.getElementById('toolLogContent');
  log.style.display = 'block';
  content.innerHTML = `<div class="install-step">
    <span class="icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : '⏳'}</span>
    <span class="detail">${msg}</span>
  </div>`;
}

async function uninstallNode() {
  if (!confirm('确定要卸载 Node.js 吗？卸载后 ClawBox 和 OpenClaw 都将无法运行。')) return;
  showToolLog('正在卸载 Node.js...');
  try {
    const res = await fetch('/api/tools/uninstall-node', { method: 'POST' });
    const data = await res.json();
    showToolLog(data.success ? data.message : `卸载失败: ${data.error}`, data.success ? 'success' : 'error');
    // 无论成功失败都刷新状态（有些卸载方式不会报错但需要验证）
    setTimeout(loadToolStatus, 1000);
  } catch (err) {
    showToolLog(`卸载失败: ${err.message}`, 'error');
  }
}

async function uninstallClawhub() {
  if (!confirm('确定要卸载 ClawHub CLI 吗？Skills 市场将不可用。')) return;
  showToolLog('正在卸载 ClawHub CLI...');
  try {
    const res = await fetch('/api/tools/uninstall-clawhub', { method: 'POST' });
    const data = await res.json();
    showToolLog(data.success ? data.message : `卸载失败: ${data.error}`, data.success ? 'success' : 'error');
    if (data.success) clawhubReady = false;
    setTimeout(loadToolStatus, 1000);
  } catch (err) {
    showToolLog(`卸载失败: ${err.message}`, 'error');
  }
}

async function uninstallOpenclawTool() {
  if (!confirm('确定要卸载 OpenClaw 吗？配置文件将保留。')) return;
  showToolLog('正在卸载 OpenClaw...');
  try {
    const res = await fetch('/api/uninstall', { method: 'POST' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' && data.detail) {
            showToolLog(data.detail);
          }
          if (data.type === 'done') {
            showToolLog(data.success ? 'OpenClaw 已卸载' : '卸载失败', data.success ? 'success' : 'error');
            loadToolStatus();
            loadStatus();
          }
        }
      }
    }
  } catch (err) {
    showToolLog(`卸载失败: ${err.message}`, 'error');
  }
}

async function openOpenclawDashboard() {
  try {
    const res = await fetch('/api/tools/openclaw-dashboard');
    const data = await res.json();
    if (data.success) {
      window.open(data.url, '_blank');
    } else {
      alert(data.error || '无法获取 Dashboard 地址');
    }
  } catch (err) {
    alert(`获取失败: ${err.message}`);
  }
}

async function uninstallClawBox() {
  if (!confirm('确定要卸载 ClawBox 吗？程序将立即退出并删除自身。')) return;
  try {
    const res = await fetch('/api/tools/uninstall-clawbox', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('ClawBox 正在卸载，页面即将关闭...');
      window.close();
    } else {
      alert(`卸载失败: ${data.error}`);
    }
  } catch (err) {
    // 连接断开说明进程已退出，卸载成功
    alert('ClawBox 已卸载');
    window.close();
  }
}

// ========== Skills ==========

let clawhubReady = false;
let searchDebounce = null;
let lastSearchTime = 0; // 本地限流：3秒内不允许重复搜索

function onSkillSearchKeyup(event) {
  if (event.key === 'Enter') {
    searchSkills();
    return;
  }
  // 防抖：输入停止 600ms 后再搜索
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => searchSkills(), 600);
}

async function checkClawHub() {
  try {
    const res = await fetch('/api/skills/status');
    const data = await res.json();
    if (data.available) {
      clawhubReady = true;
      return;
    }
    // clawhub 不可用，尝试安装
    const container = document.getElementById('skillResults');
    container.innerHTML = '<div class="empty-state pulse">正在安装 ClawHub CLI...</div>';
    const setupRes = await fetch('/api/skills/setup', { method: 'POST' });
    const setupData = await setupRes.json();
    if (setupData.success) {
      clawhubReady = true;
      container.innerHTML = '<div class="empty-state">ClawHub 已就绪，开始搜索吧！</div>';
    } else {
      container.innerHTML = '<div class="empty-state">ClawHub 安装失败，请手动运行: npm install -g clawhub</div>';
    }
  } catch {
    clawhubReady = false;
  }
}

async function searchSkills(event) {
  if (event && event.key !== 'Enter') return;
  const query = document.getElementById('skillSearch').value.trim();
  if (!query) return;

  // 本地限流：3秒内不允许重复搜索
  const now = Date.now();
  if (now - lastSearchTime < 3000) {
    return;
  }
  lastSearchTime = now;

  const container = document.getElementById('skillResults');

  // 确保 clawhub 可用
  if (!clawhubReady) {
    container.innerHTML = '<div class="empty-state pulse">正在准备 ClawHub...</div>';
    await checkClawHub();
    if (!clawhubReady) return;
  }

  container.innerHTML = '<div class="empty-state pulse">搜索中...</div>';

  try {
    const res = await fetch(`/api/skills/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<div class="empty-state">${data.error || '搜索失败，请稍后再试'}</div>`;
      return;
    }
    if (!data.output) {
      container.innerHTML = `<div class="empty-state">未找到相关 Skills</div>`;
      return;
    }

    // 解析 clawhub search 输出
    // 格式: slug  Description  (score)
    const lines = data.output.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      container.innerHTML = `<div class="empty-state">未找到相关 Skills</div>`;
      return;
    }

    container.innerHTML = lines.map(line => {
      // 按多个空格分割，去掉末尾的 (score)
      const cleaned = line.replace(/\s*\([\d.]+\)\s*$/, '');
      const parts = cleaned.split(/\s{2,}/);
      const slug = parts[0]?.trim() || line;
      const desc = parts.slice(1).join(' ').trim() || '';
      return `
        <div class="skill-card">
          <div class="skill-info">
            <h4>${slug}</h4>
            <p>${desc}</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="installSkill('${slug}', this)">
            安装
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">搜索失败: ${err.message}</div>`;
  }
}

async function installSkill(slug, btn) {
  btn.disabled = true;
  btn.textContent = '安装中...';

  try {
    const res = await fetch('/api/skills/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug })
    });
    const data = await res.json();

    if (data.success) {
      btn.textContent = '✓ 已安装';
      btn.style.color = 'var(--success)';
    } else {
      btn.textContent = data.error ? `失败: ${data.error}` : '失败';
      btn.disabled = false;
    }
  } catch (err) {
    btn.textContent = '失败';
    btn.disabled = false;
  }
}
