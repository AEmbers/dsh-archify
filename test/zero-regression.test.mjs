import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { listRelativeFiles, stageCleanArchify } from '../scripts/staging.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function git(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parsePinnedHashes(noticesPath) {
  const source = fs.readFileSync(noticesPath, 'utf8');
  const block = source.match(/### 逐字保留的文件 SHA-256[\s\S]*?```\s*([\s\S]*?)```/);
  assert.ok(block, 'THIRD_PARTY_NOTICES.md must carry a pinned SHA-256 manifest block');
  const pins = {};
  for (const line of block[1].split('\n')) {
    const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (!match) continue;
    pins[match[2].trim()] = match[1];
  }
  assert.ok(Object.keys(pins).length > 0, 'pinned manifest must not be empty');
  return pins;
}

test('every pinned verbatim file in THIRD_PARTY_NOTICES.md matches the tracked tree byte-for-byte', () => {
  const noticesPath = path.join(repoRoot, 'THIRD_PARTY_NOTICES.md');
  const pins = parsePinnedHashes(noticesPath);
  const drift = [];
  for (const [relative, expected] of Object.entries(pins)) {
    const filePath = path.join(repoRoot, relative);
    if (!fs.existsSync(filePath)) {
      drift.push(`${relative}: missing`);
      continue;
    }
    const actual = sha256(filePath);
    if (actual !== expected) drift.push(`${relative}: expected ${expected}, got ${actual}`);
  }
  assert.deepEqual(drift, [], 'pinned files drifted from THIRD_PARTY_NOTICES.md');
});

test('the pinned upstream release tag and commit are declared in THIRD_PARTY_NOTICES.md', () => {
  const notices = fs.readFileSync(path.join(repoRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.match(notices, /archify-dsh-v0\.1\.0/);
  assert.match(notices, /fc6e8aca/);
  assert.match(notices, /integrity/i);
  assert.match(notices, /shasum/i);
});

test('the committed skills/ payload is byte-identical to a fresh clean staging', () => {
  const skillFiles = git(['ls-files', '*SKILL.md']).split('\n').filter(Boolean);
  assert.deepEqual(skillFiles, ['archify/SKILL.md', 'skills/archify/SKILL.md']);
  // The fork commits the sanitized distribution copy (`skills/archify`) so that
  // `dsh plugin add github:...` never needs a lifecycle script — pnpm 11 blocks
  // git dependency build scripts unless the consumer allowlists them, which is
  // exactly the install friction this fork removes. A committed copy can go
  // stale, so re-stage from `archify/` and compare byte-for-byte.
  const committedRoot = path.join(repoRoot, 'skills', 'archify');
  const committed = git(['ls-files', 'skills']).split('\n').filter(Boolean)
    .map((entry) => entry.slice('skills/archify/'.length));
  assert.ok(committed.length > 50, `committed payload looks truncated: ${committed.length} files`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-stage-'));
  try {
    const fresh = path.join(scratch, 'archify');
    stageCleanArchify({ repoRoot, dest: fresh });
    assert.deepEqual(listRelativeFiles(fresh), committed.slice().sort());
    const drift = [];
    for (const relative of committed) {
      if (sha256(path.join(fresh, ...relative.split('/'))) !== sha256(path.join(committedRoot, ...relative.split('/')))) {
        drift.push(relative);
      }
    }
    assert.deepEqual(drift, [], 'committed skills/ drifted from archify/ — run npm run stage');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('Archify core does not import, detect, or branch on DeepSeek Harness', () => {
  const grep = spawnSync('git', [
    'grep',
    '-n',
    '-E',
    'deepseek-harness|@deepseek-ai/dsh|DSH_HOME|DSH_AGENTS_HOME|archify-dsh',
    '--',
    'archify',
    'scripts/package-smoke.mjs',
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(grep.status, 1, grep.stderr || grep.stdout);
  assert.equal(grep.stdout.trim(), '');
});
