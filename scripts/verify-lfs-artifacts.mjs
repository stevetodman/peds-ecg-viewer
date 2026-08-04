import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'ml/training/checkpoints/manifest.json'), 'utf8'),
);

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolveHash(hash.digest('hex')));
  });
}

function parseLfsPointer(contents) {
  const match = contents.match(
    /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\nsize (\d+)\r?\n?$/,
  );
  return match ? { sha256: match[1], size: Number(match[2]) } : null;
}

for (const artifact of manifest.artifacts) {
  const absolute = resolve(root, artifact.path);
  const size = statSync(absolute).size;
  const contents = readFileSync(absolute);
  const pointer = parseLfsPointer(contents.toString('utf8'));
  if (pointer) {
    if (pointer.size !== artifact.size || pointer.sha256 !== artifact.sha256) {
      throw new Error(`${artifact.path}: LFS pointer metadata does not match manifest.json`);
    }
    console.log(`verified pointer metadata ${artifact.path}`);
    continue;
  }
  if (size !== artifact.size) {
    throw new Error(
      `${artifact.path}: expected ${artifact.size} bytes, found ${size}. ` +
        'The file is neither a matching Git LFS pointer nor a materialized artifact.',
    );
  }
  const digest = await sha256(absolute);
  if (digest !== artifact.sha256) {
    throw new Error(`${artifact.path}: SHA-256 mismatch (${digest})`);
  }
  console.log(`verified ${artifact.path}`);
}

console.log(`Verified ${manifest.artifacts.length} Git LFS artifacts.`);
