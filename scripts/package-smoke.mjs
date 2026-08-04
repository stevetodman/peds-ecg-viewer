import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'peds-ecg-package-smoke-'));
const npmEnv = {
  ...process.env,
  NPM_CONFIG_CACHE: undefined,
  npm_config_cache: join(scratch, 'npm-cache'),
};

try {
  const packed = JSON.parse(
    execFileSync(
      'npm',
      ['pack', '.', '--json', '--ignore-scripts', '--pack-destination', scratch],
      { cwd: root, encoding: 'utf8', env: npmEnv },
    ),
  );
  const result = packed[0];
  const included = new Set(result.files.map(({ path }) => path));
  for (const required of [
    'dist/peds-ecg-viewer.js',
    'dist/index.d.ts',
    'dist/renderer/index.js',
    'dist/renderer/index.d.ts',
    'README.md',
    'LICENSE',
  ]) {
    if (!included.has(required)) {
      throw new Error(`Package is missing required file: ${required}`);
    }
  }

  const consumer = join(scratch, 'consumer');
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(scratch, result.filename)],
    { cwd: scratch, stdio: 'inherit', env: npmEnv },
  );
  const entry = join(scratch, 'node_modules', 'peds-ecg-viewer', 'dist', 'peds-ecg-viewer.js');
  const source = readFileSync(entry, 'utf8');
  if (!source.includes('VERSION')) {
    throw new Error('Built package entry does not expose the public API');
  }
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import('peds-ecg-viewer').then((m) => { if (m.VERSION !== '0.1.0') process.exit(1); })",
    ],
    { cwd: scratch, stdio: 'inherit' },
  );
  console.log(`Package smoke test passed (${result.filename}, ${result.size} bytes).`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
