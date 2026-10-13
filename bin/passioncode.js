#!/usr/bin/env node
'use strict';
const L = require('../lib/launcher');

function cachedNpmStatus({ latest, checkedAt, installed }) {
  if (!latest) return 'npm latest: not checked';
  const checked = typeof checkedAt === 'string' && Number.isFinite(Date.parse(checkedAt))
    ? `checked ${checkedAt}` : 'check time unknown';
  let stale = false;
  // The registry probe accepts stable x.y.z versions only. Do not guess an
  // ordering for other values that may have been written to the state file.
  if (/^\d+\.\d+\.\d+$/.test(latest) && /^\d+\.\d+\.\d+$/.test(installed)) {
    const a = latest.split('.').map(Number), b = installed.split('.').map(Number);
    const difference = a.findIndex((part, i) => part !== b[i]);
    stale = difference !== -1 && a[difference] < b[difference];
  }
  return `npm latest (cached) ${latest} (${checked}${stale ? '; stale: older than installed' : ''})`;
}

const HELP = `passioncode — set up and check PassionCode.ai on this machine: the apps, their MCP servers, the skills

  npx @passioncode-ai/passioncode@latest setup [--yes] [--with ids] [--without ids] [--no-apps] [--no-open] [--dry-run] [--json]
        a new machine: install and configure everything; an existing one: check, repair, check again
  npx @passioncode-ai/passioncode@latest doctor [--fix] [--json]        check everything (read-only); --fix repairs as setup does
  npx @passioncode-ai/passioncode@latest update [--dry-run] [--json]     install or update the skill set and the apps' MCP registrations
  npx @passioncode-ai/passioncode@latest status [--json]                 what is installed where
  npx @passioncode-ai/passioncode@latest restore                         put back what the last update moved aside
  npx @passioncode-ai/passioncode@latest config set update.auto on|off   background updates at session start
  npx @passioncode-ai/passioncode@latest uninstall                       remove the set (quarantined items stay restorable)

App ids: switchboard, dashboards, observatory, inbox, fabric. Exit codes: 0 nothing failed,
1 a check or a step failed, 2 bad arguments. Claude Code gets plugins from the local
"passioncode" marketplace; other agents get the same skills through ~/.agents/skills.
Restart your agent after a change.`;

const IDS = ['switchboard', 'dashboards', 'observatory', 'inbox', 'fabric'];

/** Flags of setup and doctor: booleans, plus --with/--without taking a comma list. Null when invalid. */
function parseSetupArgs(cmd, rest) {
  const allowed = cmd === 'doctor' ? ['--fix', '--json', '--offline'] : ['--yes', '-y', '--json', '--offline', '--no-apps', '--no-open', '--dry-run'];
  const o = { flags: new Set(), withIds: null, withoutIds: [] };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const m = /^--(with|without)(?:=(.*))?$/.exec(arg);
    if (m && cmd !== 'doctor') {
      const value = m[2] !== undefined ? m[2] : rest[++i];
      const ids = String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (!ids.length || ids.some((x) => !IDS.includes(x))) return null;
      if (m[1] === 'with') o.withIds = [...(o.withIds || []), ...ids]; else o.withoutIds.push(...ids);
    } else if (allowed.includes(arg)) o.flags.add(arg === '-y' ? '--yes' : arg);
    else return null;
  }
  return o;
}

function asker() {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return null;
  const readline = require('readline');
  return (question) => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

async function setupOrDoctor(cmd, rest) {
  const o = parseSetupArgs(cmd, rest);
  if (!o) {
    process.stderr.write(`passioncode: unsupported arguments for ${cmd}; run passioncode help. App ids: ${IDS.join(', ')}.\n`);
    return 2;
  }
  const json = o.flags.has('--json');
  const online = !o.flags.has('--offline');
  if (cmd === 'doctor' && !o.flags.has('--fix')) {
    const D = require('../lib/doctor');
    const r = await D.doctor({ online });
    process.stdout.write(json ? JSON.stringify(r, null, 2) + '\n' : D.render(r) + '\n');
    return r.ok ? 0 : 1;
  }
  const S = require('../lib/setup');
  const repairOnly = cmd === 'doctor';
  const log = json ? () => {} : (line) => process.stderr.write(`${line}\n`);
  const r = await S.setup({
    yes: repairOnly || o.flags.has('--yes'), withIds: o.withIds, withoutIds: o.withoutIds, noApps: o.flags.has('--no-apps'),
    noOpen: o.flags.has('--no-open'), dryRun: o.flags.has('--dry-run'), repairOnly, online, ask: json ? null : asker(), log,
  });
  process.stdout.write(json ? JSON.stringify(r, null, 2) + '\n' : S.render(r, { repairOnly }) + '\n');
  return r.planOnly ? 0 : r.ok ? 0 : 1;
}

async function main(argv) {
  const [cmd = 'help', ...rest] = argv;
  if (cmd === 'setup' || cmd === 'onboard' || cmd === 'doctor') {
    try { return await setupOrDoctor(cmd === 'onboard' ? 'setup' : cmd, rest); } catch (error) {
      process.stderr.write(`passioncode: ${error.message}\n`);
      return 1;
    }
  }
  const json = rest.includes('--json');
  const quiet = rest.includes('--quiet');
  const out = (value, text) => process.stdout.write(json ? JSON.stringify(value, null, 2) + '\n' : text + '\n');
  const options = {
    update: ['--dry-run', '--json', '--quiet'], install: ['--dry-run', '--json', '--quiet'],
    status: ['--json'], restore: ['--json'], uninstall: ['--json'], help: [], '--help': [], '-h': [],
  };
  const configArgs = rest.filter((arg) => arg !== '--json');
  const invalid = cmd === 'config'
    ? configArgs.length !== 3 || configArgs[0] !== 'set'
    : Object.hasOwn(options, cmd) && rest.some((arg) => !options[cmd].includes(arg));
  if (invalid) {
    process.stderr.write(`passioncode: unsupported arguments for ${cmd}; run passioncode help.\n`);
    return 2;
  }
  try {
    if (cmd === 'update' || cmd === 'install') {
      const r = L.update({ dryRun: rest.includes('--dry-run') });
      const failed = r.steps.filter((s) => s.outcome === 'failed');
      if (!quiet || failed.length) {
        out(r, [
          ...r.steps.map((s) => `${s.outcome.padEnd(8)} ${s.kind.padEnd(11)} ${s.detail}${s.error ? `\n         ${s.error}` : ''}`),
          '',
          failed.length ? `${failed.length} step(s) failed. Completed steps remain applied. Fix the cause and retry; use passioncode restore for displaced files.` : rest.includes('--dry-run') ? `Plan for PassionCode.ai ${r.version}: nothing was changed.` : `PassionCode.ai ${r.version}: done. Restart your agent — skills load at session start.`,
          r.moved.length ? `${r.moved.length} recovery entry(s) saved; use \`passioncode restore\`.` : '',
        ].filter(Boolean).join('\n'));
      }
      return failed.length ? 1 : 0;
    }
    if (cmd === 'status') {
      const s = L.status();
      out(s, [
        `installed ${s.installed || 'nothing'} · package ${s.package || '?'} · ${cachedNpmStatus(s)}${s.auto ? ' · auto-update on' : ' · auto-update off'}`,
        ...s.members.map((m) => `${m.name.padEnd(22)} ${String(m.version).padEnd(8)} claude: ${m.claude}${m.legacy.length ? ` (+ legacy ${m.legacy.join(', ')})` : ''}${m.legacyMarketplaces.length ? ` (+ legacy marketplace ${m.legacyMarketplaces.join(', ')})` : ''} · hub: ${m.hub.filter((h) => h.ok).length}/${m.hub.length}${m.shadows.length ? ` · SHADOW: ${m.shadows.join(', ')}` : ''}`),
      ].join('\n'));
      return 0;
    }
    if (cmd === 'restore') {
      const r = L.restore();
      out(r, r.length ? `Restored:\n  ${r.join('\n  ')}` : 'Nothing to restore.');
      return 0;
    }
    if (cmd === 'config' && configArgs[0] === 'set') {
      out(L.setConfig({ key: configArgs[1], value: configArgs[2] }), `update.auto = ${configArgs[2]}`);
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

main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
