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
// Staging rules live in ./staging.mjs (shared with distribution acceptance
// and contract tests); they mirror upstream `scripts/pack.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageCleanArchify, trackedArchifyFiles } from './staging.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const stageRoot = path.join(repoRoot, 'skills', 'archify');

fs.rmSync(path.join(repoRoot, 'skills'), { recursive: true, force: true });
stageCleanArchify({ repoRoot, dest: stageRoot });
// stderr, not stdout: npm pack --json and other consumers parse stdout as JSON,
// and prepare output on stdout would corrupt machine-readable receipts.
process.stderr.write(`staged skills/archify (${trackedArchifyFiles(repoRoot).length} tracked files, clean)\n`);
