#!/usr/bin/env node
// Stage a clean copy of the Archify skill into ./skills for npm distribution.
//
// This is the port's `prepare` entry point: a `dsh plugin add github:...`
// install runs `prepare`, and the cordis patch resolves the Skill root from
// `<installed package>/skills`, so the staged copy must exist before the
// package is packed or consumed. The upstream project ships a prebuilt npm
// tarball instead of staging from git, which is why its integration package
// has no lifecycle scripts; a git-installable port cannot avoid one (B1).
//
// Staging rules mirror `scripts/pack.mjs` (upstream `integrations/
// deepseek-harness/scripts/pack.mjs`): node_modules never ships; test/ is
// repo-only; local agent coordination folders cannot leak; the npm scripts and
// build-only dependencies are stripped from the shipped package.json; runtime
// schema validation comes from the committed standalone validators, so the
// installed skill never requires npm install.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const archifySource = path.join(repoRoot, 'archify');
const stageRoot = path.join(repoRoot, 'skills', 'archify');

function excludeFromCleanSkill(sourceRoot, src) {
  const relative = path.relative(sourceRoot, src);
  if (!relative || relative === '.') return false;
  const parts = relative.split(path.sep);
  if (parts.includes('node_modules')) return true;
  if (parts.includes('test')) return true;
  if (parts.includes('.DS_Store')) return true;
  if (parts.includes('.hive')) return true;
  if (parts.includes('.workbuddy')) return true;
  if (parts.some((part) => part.startsWith('.validator-check-'))) return true;
  if (parts.join('/') === 'scripts/generate-validators.mjs') return true;
  return false;
}

function trackedArchifyFiles() {
  const tracked = spawnSync('git', ['ls-files', '-z', '--', 'archify'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (tracked.status !== 0) {
    throw new Error(`unable to enumerate tracked Archify files: ${tracked.stderr || tracked.error?.message}`);
  }
  return tracked.stdout.split('\0').filter(Boolean);
}

function stageCleanArchify(dest) {
  const validators = path.join(archifySource, 'renderers/shared/generated-validators.mjs');
  if (!fs.existsSync(validators)) {
    throw new Error('generated validators are missing — run npm run generate:validators in archify/');
  }
  for (const repoRelative of trackedArchifyFiles()) {
    const src = path.join(repoRoot, ...repoRelative.split('/'));
    if (excludeFromCleanSkill(archifySource, src)) continue;
    const destination = path.join(dest, path.relative(archifySource, src));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(src, destination);
  }
  const packagePath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  delete pkg.scripts;
  delete pkg.devDependencies;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  fs.rmSync(path.join(dest, 'package-lock.json'), { force: true });
}

fs.rmSync(path.join(repoRoot, 'skills'), { recursive: true, force: true });
stageCleanArchify(stageRoot);
// stderr, not stdout: npm pack --json and other consumers parse stdout as JSON,
// and prepare output on stdout would corrupt machine-readable receipts.
process.stderr.write(`staged skills/archify (${trackedArchifyFiles().length} tracked files, clean)\n`);
