#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const tasksDir = path.join(rootDir, 'tasks');
const validStatuses = new Set(['queued', 'planning', 'implementing', 'awaiting_review', 'fixing', 'blocked', 'passed', 'rolled_back']);

function fail(message, issues) {
  console.error(message);
  if (issues.length) {
    for (const issue of issues) console.error(`- ${issue}`);
  }
  process.exit(1);
}

const taskId = process.argv[2];
if (!taskId) {
  console.error('Usage: node scripts/task-review-guard.js TASK-0001');
  process.exit(1);
}

const taskDir = path.join(tasksDir, taskId);
const readmePath = path.join(taskDir, 'README.md');
const checkpointPath = path.join(taskDir, 'checkpoint.json');
const validationPath = path.join(taskDir, 'validation.json');
const rollbackPath = path.join(taskDir, 'rollback.md');

const issues = [];
for (const requiredPath of [readmePath, checkpointPath, validationPath, rollbackPath]) {
  if (!fs.existsSync(requiredPath)) issues.push(`Missing required file: ${path.relative(rootDir, requiredPath)}`);
}
if (issues.length) fail('Task review guard failed.', issues);

const readme = fs.readFileSync(readmePath, 'utf8');
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
const validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
const rollback = fs.readFileSync(rollbackPath, 'utf8');

if (!/## done_when/i.test(readme)) issues.push('README.md missing ## done_when section');
if (/## done_when\s*- \[ \] 待补充/i.test(readme) || /## done_when\s*- 待补充/i.test(readme)) issues.push('README.md done_when still placeholder');

if (!validStatuses.has(String(checkpoint.status || ''))) issues.push(`checkpoint.status invalid: ${checkpoint.status || '(empty)'}`);
if (!Array.isArray(checkpoint.done_when) || checkpoint.done_when.length === 0) issues.push('checkpoint.done_when missing or empty');
if (checkpoint.status === 'blocked') {
  if (!checkpoint.blocked?.blocked_reason) issues.push('checkpoint.blocked.blocked_reason required when status=blocked');
  if (!checkpoint.blocked?.unblock_action) issues.push('checkpoint.blocked.unblock_action required when status=blocked');
  if (!checkpoint.blocked?.owner) issues.push('checkpoint.blocked.owner required when status=blocked');
  if (!checkpoint.blocked?.reentry_condition) issues.push('checkpoint.blocked.reentry_condition required when status=blocked');
}

if (!validation.feature_validation?.status) issues.push('validation.feature_validation.status missing');
if (!validation.packaging_validation?.status) issues.push('validation.packaging_validation.status missing');
if (!validation.evidence?.checked_at) issues.push('validation.evidence.checked_at missing');
if (!validation.evidence?.environment) issues.push('validation.evidence.environment missing');
if (!Array.isArray(validation.evidence?.commands_run)) issues.push('validation.evidence.commands_run missing');
if (!Array.isArray(validation.evidence?.review_basis)) issues.push('validation.evidence.review_basis missing');
if (validation.feature_validation?.status === 'passed' && !validation.reviewer_result?.status) issues.push('reviewer_result.status missing while feature_validation.status=passed');

if (!/## Rollback Anchor/i.test(rollback)) issues.push('rollback.md missing Rollback Anchor section');
if (/baseline_commit:\s*$/m.test(rollback)) issues.push('rollback.md baseline_commit empty');
if (/rollback_target:\s*$/m.test(rollback)) issues.push('rollback.md rollback_target empty');

if (issues.length) fail('Task review guard failed.', issues);
console.log(`Task review guard passed: ${taskId}`);
