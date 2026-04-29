#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const tasksDir = path.join(rootDir, 'tasks');
const validationTemplatePath = path.join(tasksDir, '_templates', 'validation.json.template');
const checkpointTemplatePath = path.join(tasksDir, '_templates', 'checkpoint.json.template');
const rollbackTemplatePath = path.join(tasksDir, '_templates', 'rollback.md.template');
const handoffTemplatePath = path.join(tasksDir, '_templates', 'handoff.md.template');
const readmeTemplatePath = path.join(tasksDir, '_templates', 'task.README.template.md');
const areaProfilesPath = path.join(tasksDir, '_templates', 'bugfix-area-profiles.json');

function usage() {
  console.error('Usage: node scripts/init-validation.js TASK-0001 --type bugfix --area gateway-restart --summary "..." --platform windows,linux');
  process.exit(1);
}

const args = process.argv.slice(2);
const taskId = args[0];
if (!taskId || taskId.startsWith('-')) usage();

const options = {};
for (let i = 1; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
  options[key] = value;
}

for (const requiredPath of [validationTemplatePath, checkpointTemplatePath, rollbackTemplatePath, handoffTemplatePath, readmeTemplatePath, areaProfilesPath]) {
  if (!fs.existsSync(requiredPath)) {
    console.error(`Template not found: ${requiredPath}`);
    process.exit(1);
  }
}

const taskDir = path.join(tasksDir, taskId);
const outputPath = path.join(taskDir, 'validation.json');
const checkpointPath = path.join(taskDir, 'checkpoint.json');
const rollbackPath = path.join(taskDir, 'rollback.md');
const handoffPath = path.join(taskDir, 'handoff.md');
const readmePath = path.join(taskDir, 'README.md');
fs.mkdirSync(taskDir, { recursive: true });

const areaProfiles = JSON.parse(fs.readFileSync(areaProfilesPath, 'utf8'));
const selectedArea = options.area || 'replace-me';
const areaProfile = areaProfiles[selectedArea] || null;

let data = JSON.parse(fs.readFileSync(validationTemplatePath, 'utf8'));
data.task_id = taskId;
if (options.type) data.task_type = options.type;
if (options.area) data.target.area = options.area;
if (options.summary) data.target.summary = options.summary;
if (options.platform) {
  data.target.platform = String(options.platform)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
if (areaProfile?.feature_validation) {
  data.feature_validation = {
    ...(data.feature_validation || {}),
    ...areaProfile.feature_validation,
    checks_run: Array.isArray(data.feature_validation?.checks_run) ? data.feature_validation.checks_run : []
  };
}
const doneWhenTemplates = Array.isArray(areaProfile?.done_when_templates) ? areaProfile.done_when_templates : [];
data.evidence = {
  ...(data.evidence || {}),
  checked_at: new Date().toISOString(),
  review_basis: Array.isArray(data.evidence?.review_basis) ? data.evidence.review_basis : []
};
data.generated_at = new Date().toISOString();

if (fs.existsSync(outputPath)) {
  const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  data = { ...existing, generated_at: new Date().toISOString() };
  if (options.type) data.task_type = options.type;
  data.target = { ...(existing.target || {}), ...(data.target || {}) };
}

fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);

if (!fs.existsSync(checkpointPath)) {
  const checkpoint = JSON.parse(fs.readFileSync(checkpointTemplatePath, 'utf8'));
  checkpoint.task_id = taskId;
  checkpoint.summary = options.summary || checkpoint.summary;
  checkpoint.current_focus = options.summary || checkpoint.current_focus;
  checkpoint.status = 'queued';
  checkpoint.done_when = doneWhenTemplates.length
    ? doneWhenTemplates
    : [
        '目标问题在当前验证关卡内确认解决',
        'validation.json 已更新且状态清晰',
        'reviewer verdict 不为 needs_changes / blocked'
      ];
  checkpoint.related_runbooks = options.runbooks
    ? String(options.runbooks).split(',').map((item) => item.trim()).filter(Boolean)
    : (areaProfile?.related_runbooks || checkpoint.related_runbooks);
  checkpoint.next_steps = areaProfile?.next_steps || checkpoint.next_steps;
  checkpoint.rollback_anchor = checkpoint.rollback_anchor || { baseline_commit: '', rollback_target: '' };
  checkpoint.blocked = checkpoint.blocked || { is_blocked: false, blocked_reason: '', unblock_action: '', owner: '', reentry_condition: '' };
  checkpoint.last_updated_by = options.owner || 'main-agent';
  checkpoint.last_updated_at = new Date().toISOString();
  fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

if (!fs.existsSync(rollbackPath)) {
  const rollback = fs.readFileSync(rollbackTemplatePath, 'utf8').replaceAll('TASK-0000', taskId);
  fs.writeFileSync(rollbackPath, rollback.endsWith('\n') ? rollback : `${rollback}\n`);
}

if (!fs.existsSync(handoffPath)) {
  const handoff = fs.readFileSync(handoffTemplatePath, 'utf8').replaceAll('TASK-0000', taskId);
  fs.writeFileSync(handoffPath, handoff.endsWith('\n') ? handoff : `${handoff}\n`);
}

if (!fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmeTemplatePath, 'utf8').replaceAll('TASK-0000', taskId);
  if (options.summary) {
    readme = readme.replace('- 待补充', `- ${options.summary}`);
  }
  if (doneWhenTemplates.length) {
    readme = readme.replace('## done_when\n- [ ] 待补充', `## done_when\n${doneWhenTemplates.map((item) => `- [ ] ${item}`).join('\n')}`);
  }
  fs.writeFileSync(readmePath, readme.endsWith('\n') ? readme : `${readme}\n`);
}

console.log(outputPath);
