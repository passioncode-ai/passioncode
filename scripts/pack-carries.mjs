// Reads `npm pack --dry-run --json` on stdin and fails unless the one package it describes
// carries every path named on the command line. Names only, never a file's content (PC-123:
// the release checks that lib/analytics-key.json is packed without printing the key).
// npm <=11 prints an array and npm 12 an object keyed by package name: readSinglePack takes both.
import { readSinglePack } from './pack-result.mjs';

export function missingFrom(stdout, wanted) {
  const files = new Set(readSinglePack(stdout).files.map((f) => f.path));
  return wanted.filter((p) => !files.has(p));
}

if (process.argv[1]?.endsWith('pack-carries.mjs')) {
  const wanted = process.argv.slice(2);
  if (!wanted.length) { console.error('usage: npm pack --dry-run --json | node scripts/pack-carries.mjs <path>...'); process.exit(2); }
  let s = '';
  process.stdin.setEncoding('utf8').on('data', (d) => { s += d; }).on('end', () => {
    let missing;
    try { missing = missingFrom(s, wanted); } catch (e) { console.error(`could not read npm pack's output: ${e.message}`); process.exit(1); }
    if (missing.length) { console.error(`the packed package does not carry ${missing.join(', ')}`); process.exit(1); }
    console.log(`${wanted.join(', ')} ${wanted.length === 1 ? 'is' : 'are'} in the package`);
  });
}
