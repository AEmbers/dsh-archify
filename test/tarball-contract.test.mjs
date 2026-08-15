import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { excludeFromCleanStaging, listRelativeFiles } from '../scripts/staging.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const packScript = path.join(repoRoot, 'scripts', 'pack.mjs');

const FORBIDDEN = [
  '/test/',
  'package-lock.json',
  '/node_modules/',
  '.hive',
  '.workbuddy',
  'probe-skills',
  'generate-validators.mjs',
  'distribution-acceptance',
];

function packTarball() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-archify-tarball-'));
  const out = path.join(scratch, 'dsh-archify-0.1.0.tgz');
  const result = spawnSync(process.execPath, [packScript, '--out', out, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return { scratch, out, result };
}

test('pack command emits a real npm tarball with the expected identity and file list', () => {
  const { scratch, out, result } = packTarball();
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.name, 'dsh-archify');
    assert.equal(receipt.version, '0.1.0');
    assert.equal(fs.existsSync(out), true);
    const files = receipt.files.map((file) => file.path.replace(/^package\//, ''));
    for (const required of [
      'package.json',
      'cordis.patch.yml',
      'lib/index.js',
      'README.md',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'skills/archify/SKILL.md',
      'skills/archify/bin/archify.mjs',
    ]) {
      assert.ok(files.includes(required), `tarball missing ${required}`);
    }
    const skillEntries = files.filter((file) => file === 'skills/archify/SKILL.md' || file.endsWith('/SKILL.md'));
    assert.deepEqual(skillEntries, ['skills/archify/SKILL.md']);
    for (const file of files) {
      for (const forbidden of FORBIDDEN) {
        assert.equal(file.includes(forbidden), false, `tarball contains forbidden ${file}`);
      }
    }
    assert.equal(files.some((file) => file.startsWith('test/')), false);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('packed Skill payload matches the clean-staging contract of the tracked skill tree', () => {
  const { scratch, out, result } = packTarball();
  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const packedRoot = path.join(scratch, 'packed');
    fs.mkdirSync(packedRoot);
    const tar = spawnSync('tar', ['-xzf', path.basename(out), '-C', packedRoot], {
      cwd: path.dirname(out),
      encoding: 'utf8',
    });
    assert.equal(tar.status, 0, tar.stderr);
    const packedSkill = path.join(packedRoot, 'package', 'skills', 'archify');
    const repoSkill = path.join(repoRoot, 'archify');
    const packedList = listRelativeFiles(packedSkill);
    const expectedList = listRelativeFiles(repoSkill)
      .filter((relative) => !excludeFromCleanStaging(relative));
    assert.deepEqual(packedList, expectedList, 'packed file list must equal the clean-staged skill tree');
    for (const relative of packedList) {
      if (relative === 'package.json') continue; // staging strips scripts/devDependencies
      const left = fs.readFileSync(path.join(packedSkill, ...relative.split('/')));
      const right = fs.readFileSync(path.join(repoSkill, ...relative.split('/')));
      assert.ok(left.equals(right), `${relative} differs from the tracked skill tree`);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
