/** Syntax-checks every .js file under src/ and scripts/ using node --check. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['src', 'scripts'];
let files = [];
for (const t of targets) {
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(root, t));
}

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    console.error(`❌ ${path.relative(root, f)}\n${err.stderr?.toString() || err.message}`);
  }
}
console.log(`${failed === 0 ? '✅' : '❌'} checked ${files.length} files, ${failed} failed`);
process.exit(failed ? 1 : 0);
