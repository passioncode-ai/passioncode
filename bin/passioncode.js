#!/usr/bin/env node
'use strict';
const L = require('../lib/launcher');

const HELP = `passioncode — every PassionCode.ai skill, for every agent on this machine

  npx @passioncode-ai/passioncode@latest update [--dry-run] [--json]     install or update the whole set
  npx @passioncode-ai/passioncode@latest status [--json]                 what is installed where
  npx @passioncode-ai/passioncode@latest restore                         put back what the last update moved aside
  npx @passioncode-ai/passioncode@latest config set update.auto on|off   background updates at session start
  npx @passioncode-ai/passioncode@latest uninstall                       remove the set (quarantined items stay restorable)

Claude Code gets plugins from the local "passioncode" marketplace; other agents get
the same skills through ~/.agents/skills. Restart your agent after an update.`;

function main(argv) {
  const [cmd = 'help', ...rest] = argv;
  const json = rest.includes('--json');
  const quiet = rest.includes('--quiet');
  const out = (value, text) => process.stdout.write(json ? JSON.stringify(value, null, 2) + '\n' : text + '\n');
  try {
    if (cmd === 'update' || cmd === 'install') {
      const r = L.update({ dryRun: rest.includes('--dry-run') });
      const failed = r.steps.filter((s) => s.outcome === 'failed');
      if (!quiet || failed.length) {
        out(r, [
          ...r.steps.map((s) => `${s.outcome.padEnd(8)} ${s.kind.padEnd(11)} ${s.detail}${s.error ? `\n         ${s.error}` : ''}`),
          '',
          failed.length ? `${failed.length} step(s) failed — the rest were applied. Re-run after fixing, or \`passioncode restore\`.` : rest.includes('--dry-run') ? `Plan for PassionCode.ai ${r.version}: nothing was changed.` : `PassionCode.ai ${r.version}: done. Restart your agent — skills load at session start.`,
          r.moved.length ? `${r.moved.length} item(s) moved aside, restorable with \`passioncode restore\`.` : '',
        ].filter(Boolean).join('\n'));
      }
      return failed.length ? 1 : 0;
    }
    if (cmd === 'status') {
      const s = L.status();
      out(s, [
        `installed ${s.installed || 'nothing'} · package ${s.package || '?'} · latest on npm ${s.latest || 'not checked'}${s.auto ? ' · auto-update on' : ' · auto-update off'}`,
        ...s.members.map((m) => `${m.name.padEnd(22)} ${String(m.version).padEnd(8)} claude: ${m.claude}${m.legacy.length ? ` (+ legacy ${m.legacy.join(', ')})` : ''}${m.legacyMarketplaces.length ? ` (+ legacy marketplace ${m.legacyMarketplaces.join(', ')})` : ''} · hub: ${m.hub.filter((h) => h.ok).length}/${m.hub.length}${m.shadows.length ? ` · SHADOW: ${m.shadows.join(', ')}` : ''}`),
      ].join('\n'));
      return 0;
    }
    if (cmd === 'restore') {
      const r = L.restore();
      out(r, r.length ? `Restored:\n  ${r.join('\n  ')}` : 'Nothing to restore.');
      return 0;
    }
    if (cmd === 'config' && rest[0] === 'set') {
      out(L.setConfig({ key: rest[1], value: rest[2] }), `update.auto = ${rest[2]}`);
      return 0;
    }
    if (cmd === 'uninstall') {
      const r = L.uninstall();
      out(r, r.length ? `Removed:\n  ${r.join('\n  ')}` : 'Nothing was installed.');
      return 0;
    }
    process.stdout.write(HELP + '\n');
    return cmd === 'help' || cmd === '--help' || cmd === '-h' ? 0 : 2;
  } catch (error) {
    process.stderr.write(`passioncode: ${error.message}\n`);
    return 1;
  }
}

process.exit(main(process.argv.slice(2)));
