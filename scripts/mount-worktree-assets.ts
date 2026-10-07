#!/usr/bin/env node
/**
 * scripts/mount-worktree-assets.ts
 *
 * Automated Worktree Asset Shared Mount Manager (Rule 64).
 * Links large gitignored binary payloads (.bin files) from canonical repository root
 * into linked git worktrees, preventing missing asset 404s and HTML SPA route fallbacks.
 *
 * Scans:
 * - public/*.bin
 * - public/regional/*.bin
 * - public/data/*.bin
 * - public/data/weathernext/*.bin
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CURRENT_ROOT = path.resolve(__dirname, '..');

export interface MountResult {
  isWorktree: boolean;
  canonicalRoot: string;
  scannedCount: number;
  linkedCount: number;
  existingCount: number;
  brokenFixedCount: number;
  errorCount: number;
}

export function detectCanonicalRoot(startDir: string = CURRENT_ROOT): { isWorktree: boolean; canonicalRoot: string } {
  try {
    const gitCommon = execSync('git rev-parse --git-common-dir', {
      cwd: startDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const resolvedCanonical = path.resolve(startDir, gitCommon, '..');
    const isWorktree = path.resolve(resolvedCanonical) !== path.resolve(startDir);
    return { isWorktree, canonicalRoot: resolvedCanonical };
  } catch {
    // If git fails, check if .git is a file
    const dotGit = path.join(startDir, '.git');
    if (fs.existsSync(dotGit) && fs.statSync(dotGit).isFile()) {
      try {
        const content = fs.readFileSync(dotGit, 'utf-8');
        const match = content.match(/gitdir:\s*(.*)/);
        if (match) {
          const gitDir = path.resolve(startDir, match[1].trim());
          const candidate = path.resolve(gitDir, '../../..');
          return { isWorktree: true, canonicalRoot: candidate };
        }
      } catch {}
    }
    return { isWorktree: false, canonicalRoot: startDir };
  }
}

export function mountWorktreeAssets(targetDir: string = CURRENT_ROOT): MountResult {
  const { isWorktree, canonicalRoot } = detectCanonicalRoot(targetDir);

  const result: MountResult = {
    isWorktree,
    canonicalRoot,
    scannedCount: 0,
    linkedCount: 0,
    existingCount: 0,
    brokenFixedCount: 0,
    errorCount: 0,
  };

  if (!isWorktree) {
    return result;
  }

  const assetDirs = [
    'public',
    path.join('public', 'regional'),
    path.join('public', 'data'),
    path.join('public', 'data', 'weathernext'),
  ];

  for (const relDir of assetDirs) {
    const sourceDir = path.join(canonicalRoot, relDir);
    const destDir = path.join(targetDir, relDir);

    if (!fs.existsSync(sourceDir)) continue;
    fs.mkdirSync(destDir, { recursive: true });

    let files: string[] = [];
    try {
      files = fs.readdirSync(sourceDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.bin')) continue;
      result.scannedCount++;

      const sourceFile = path.join(sourceDir, file);
      const destFile = path.join(destDir, file);

      let statOrLstat: fs.Stats | null = null;
      try {
        statOrLstat = fs.lstatSync(destFile);
      } catch {
        statOrLstat = null;
      }

      if (statOrLstat) {
        if (statOrLstat.isSymbolicLink()) {
          // Check if symlink target exists
          try {
            const targetPath = fs.realpathSync(destFile);
            if (fs.existsSync(targetPath)) {
              result.existingCount++;
              continue;
            }
          } catch {}
          // Broken symlink - remove and relink
          try {
            fs.unlinkSync(destFile);
            fs.symlinkSync(sourceFile, destFile);
            result.brokenFixedCount++;
          } catch {
            result.errorCount++;
          }
        } else {
          // Regular file already exists in worktree
          result.existingCount++;
        }
      } else {
        // File doesn't exist in worktree - create symlink
        try {
          fs.symlinkSync(sourceFile, destFile);
          result.linkedCount++;
        } catch {
          result.errorCount++;
        }
      }
    }
  }

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log('[mount-worktree-assets] Scanning repository structure...');
  const res = mountWorktreeAssets();
  if (res.isWorktree) {
    console.log(`[mount-worktree-assets] Linked git worktree detected.`);
    console.log(`[mount-worktree-assets] Canonical root: ${res.canonicalRoot}`);
    console.log(
      `[mount-worktree-assets] Slices scanned: ${res.scannedCount} | Linked: ${res.linkedCount} | Existing: ${res.existingCount} | Broken fixed: ${res.brokenFixedCount}`
    );
  } else {
    console.log(`[mount-worktree-assets] Running in canonical repository root. No external symlinks required.`);
  }
}
