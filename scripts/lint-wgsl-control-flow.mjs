// ============================================================================
// File: scripts/lint-wgsl-control-flow.mjs
// Purpose: Static analysis of WGSL shaders to enforce Uniform Control Flow
//          and detect hardcoded texture resolution constants.
// ============================================================================

import fs from 'fs';
import path from 'path';

const SHADERS_DIR = path.resolve('src/webgpu/shaders');

if (!fs.existsSync(SHADERS_DIR)) {
  console.error(`Shaders directory not found: ${SHADERS_DIR}`);
  process.exit(1);
}

const shaderFiles = fs.readdirSync(SHADERS_DIR).filter(f => f.endsWith('.wgsl'));
let errors = 0;
let warnings = 0;

console.log(`\n============================================================`);
console.log(`WGSL UNIFORM CONTROL FLOW & HARDCODED LITERALS LINTER`);
console.log(`Auditing ${shaderFiles.length} WGSL shader modules in ${SHADERS_DIR}`);
console.log(`============================================================\n`);

for (const file of shaderFiles) {
  const filePath = path.join(SHADERS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Strip block comments
  let cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat(m.split('\n').length - 1));
  const cleanLines = cleanContent.split('\n');

  // We track block types using a stack of { type: 'fn' | 'branch' | 'other', line: number }
  const blockStack = [];
  let pendingBranch = false;

  for (let i = 0; i < cleanLines.length; i++) {
    const rawLine = cleanLines[i];
    const lineNum = i + 1;
    // Strip line comments
    const lineWithoutComment = rawLine.replace(/\/\/.*$/, '');
    const trimmed = lineWithoutComment.trim();

    if (!trimmed) continue;

    // Check if line contains a branch keyword (if, else, for, while, switch)
    if (/\b(if|else\s+if|else|for|while|switch)\b/.test(trimmed)) {
      pendingBranch = true;
    }

    // Process characters to track block nesting
    for (let c = 0; c < lineWithoutComment.length; c++) {
      const char = lineWithoutComment[c];
      if (char === '{') {
        if (pendingBranch) {
          blockStack.push({ type: 'branch', line: lineNum });
          pendingBranch = false;
        } else {
          blockStack.push({ type: 'other', line: lineNum });
        }
      } else if (char === '}') {
        if (blockStack.length > 0) {
          blockStack.pop();
        }
      }
    }

    // Check if we are inside a branch block
    const isInsideBranch = blockStack.some(b => b.type === 'branch');

    if (isInsideBranch) {
      const forbiddenCalls = ['fwidth(', 'dpdx(', 'dpdy(', 'textureSample('];
      for (const call of forbiddenCalls) {
        if (trimmed.includes(call)) {
          // Allow explicit LOD/Compare/Bias samples in dynamic branches
          if (call === 'textureSample(' && (
            trimmed.includes('textureSampleLevel(') || 
            trimmed.includes('textureSampleCompare(') || 
            trimmed.includes('textureSampleBias(')
          )) {
            continue;
          }
          console.error(`[ERROR] ${file}:${lineNum} - Non-uniform derivative evaluation: '${call}' inside dynamic branch block.`);
          console.error(`        Line: ${trimmed}`);
          errors++;
        }
      }
    }

    // Detect hardcoded texture literals (8192, 4096)
    if (/8192|4096/.test(trimmed) && !/byteLength|is8k|scale/i.test(trimmed)) {
      console.warn(`[WARN]  ${file}:${lineNum} - Hardcoded texture dimension literal detected.`);
      console.warn(`        Line: ${trimmed}`);
      warnings++;
    }
  }
}

console.log(`\n------------------------------------------------------------`);
console.log(`Audit Results: ${errors} errors, ${warnings} warnings across ${shaderFiles.length} shaders.`);
if (errors > 0) {
  console.error(`FAILED: WGSL uniform control flow violations detected.`);
  process.exit(1);
} else {
  console.log(`PASSED: All shaders satisfy uniform control flow invariants.`);
  process.exit(0);
}
