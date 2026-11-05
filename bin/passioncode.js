#!/usr/bin/env node
'use strict';
const L = require('../lib/launcher');
const VERSION = require('../package.json').version;

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

const HELP = `passioncode sets up and checks PassionCode.ai on this machine: the apps, their MCP servers, the skills

  npx @passioncode-ai/passioncode@latest setup [--yes|-y] [--with ids] [--without ids] [--train name|none] [--no-apps] [--no-open] [--dry-run] [--allow-tools] [--allow-commands] [--offline] [--json]
        a new machine: install and configure everything; an existing one: check, repair, check again
  npx @passioncode-ai/passioncode@latest doctor [--fix] [--offline] [--json]     check everything (changes nothing but the anonymous counts); --fix repairs as setup does
  npx @passioncode-ai/passioncode@latest update [--dry-run] [--quiet] [--json]   install or update the skill set and the apps' MCP registrations
  npx @passioncode-ai/passioncode@latest status [--json]                         what is installed where
  npx @passioncode-ai/passioncode@latest restore [--json]                        put back what the last update moved aside
  npx @passioncode-ai/passioncode@latest config set update.auto on|off [--json]  background updates at session start
  npx @passioncode-ai/passioncode@latest uninstall [--json]                      remove the set (quarantined items stay restorable)
  npx @passioncode-ai/passioncode@latest permissions [allow|remove <rule>...|mode <mode>] [--by who] [--json]
        Claude Code's permission rules PassionCode installed, and its default mode; allow and remove change only PassionCode's rules
  npx @passioncode-ai/passioncode@latest analytics [on|off|status] [--json]     anonymous usage and error counts (on by default)

onboard is another name for setup, install for update. --offline skips the check for newer app
releases; --quiet prints nothing when an update succeeds; --allow-tools lets Claude Code use
PassionCode's own tools without asking, --allow-commands run the commands setup lists (--yes
never does either). App ids: switchboard, dashboards,
observatory, inbox, fabric. Exit codes: 0 nothing failed (or only a plan was shown), 1 a check
or a step failed, 2 bad arguments. Claude Code gets plugins from the local "passioncode"
marketplace; other agents get the same skills through ~/.agents/skills. Restart your agent after
a change.`;

const IDS = ['switchboard', 'dashboards', 'observatory', 'inbox', 'fabric'];

/** Flags of setup and doctor: booleans, plus --with/--without taking a comma list. Null when invalid. */
function parseSetupArgs(cmd, rest) {
  const allowed = cmd === 'doctor' ? ['--fix', '--json', '--offline'] : ['--yes', '-y', '--json', '--offline', '--no-apps', '--no-open', '--dry-run', '--allow-tools', '--allow-commands'];
  const o = { flags: new Set(), withIds: null, withoutIds: [], train: undefined };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const m = /^--(with|without)(?:=(.*))?$/.exec(arg);
    const tr = /^--train(?:=(.*))?$/.exec(arg);
    if (tr && cmd !== 'doctor') {
      const value = tr[1] !== undefined ? tr[1] : rest[++i];
      if (!value || o.train !== undefined) return null;
      o.train = value === 'none' ? null : value; // PC-89: a release train's pinned versions instead of the latest
    } else if (m && cmd !== 'doctor') {
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
  if (o.train) {
    try { require('../lib/trains').load(o.train); } catch (error) { process.stderr.write(`passioncode: ${error.message}.\n`); return 2; }
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
    noOpen: o.flags.has('--no-open'), dryRun: o.flags.has('--dry-run'), repairOnly, online, ask: json ? null : asker(), log, train: o.train,
    allowTools: o.flags.has('--allow-tools'),
    allowCommands: o.flags.has('--allow-commands'),
  });
  process.stdout.write(json ? JSON.stringify(r, null, 2) + '\n' : S.render(r, { repairOnly }) + '\n');
  return S.exitCode(r);
}

// PC-125: `permissions`, the ledger of Claude Code rules PassionCode installed (lib/ledger.js), for people and for
// Fabric's permissions screen. Usage errors exit 2, a settings file or ledger that cannot be read or written 1.
function permissionsCommand(rest) {
  const ledger = require('../lib/ledger');
  const json = rest.includes('--json');
  const args = [];
  let by = null;
  for (let n = 0; n < rest.length; n += 1) {
    if (rest[n] === '--json') continue;
    if (rest[n] === '--by') { by = rest[n + 1]; n += 1; if (!by || by.startsWith('--')) return usage('--by needs who asked, for example "Fabric (operator)"'); continue; }
    if (rest[n].startsWith('-')) return usage(`unknown option ${rest[n]}`);
    args.push(rest[n]);
  }
  if (by !== null && ([...by].length > 80 || !by.trim() || require('../lib/permissions').CONTROL.test(by))) return usage('--by is 1 to 80 characters of plain text');
  const [verb, ...values] = args;
  if (by !== null && verb === undefined) return usage('--by goes with allow, remove or mode');
  if (by !== null) by = by.trim();
  const p = L.paths();
  const file = p.claudeSettings;
  const show = (view, headline) => {
    if (json) { process.stdout.write(JSON.stringify(view, null, 2) + '\n'); return; }
    process.stdout.write(renderPermissions(view, headline) + '\n');
  };
  try {
    if (verb === undefined) {
      const view = ledger.view(p.home, file, p.state);
      show(view);
      return view.readable && !view.ledgerError ? 0 : 1;
    }
    if (verb === 'allow' || verb === 'remove') {
      if (!values.length) return usage(`${verb} needs at least one rule`);
      const r = verb === 'allow' ? ledger.allow(p.home, file, p.state, values, { by, version: VERSION }) : ledger.remove(p.home, file, p.state, values, { by });
      const done = verb === 'allow' ? r.added : r.removed;
      show({ ...r.view, [verb === 'allow' ? 'added' : 'removed']: done },
        done.length ? `${verb === 'allow' ? 'Allowed' : 'Removed'}: ${done.join(', ')}`
          : `Nothing to ${verb}: ${verb === 'allow' ? 'each rule is already allowed, asked about or denied' : 'none of them is allowed there'}.`);
      return 0;
    }
    if (verb === 'mode') {
      if (values.length !== 1) return usage(`mode needs one of ${ledger.MODES.join(', ')}`);
      const r = ledger.mode(p.home, file, p.state, values[0], { by });
      show({ ...r.view, changed: r.changed, from: r.from }, r.changed ? `Default mode: ${values[0]} (was ${r.from === null ? 'not set' : r.from}).` : `Default mode is already ${values[0]}.`);
      return 0;
    }
    return usage(`unknown permissions command ${verb}`);
  } catch (error) {
    if (error.code === 'EUSAGE') return usage(error.message);
    process.stderr.write(`passioncode: ${error.message}\n`);
    return 1;
  }
}

function usage(message) {
  process.stderr.write(`passioncode: ${message}; run passioncode help.\n`);
  return 2;
}

function renderPermissions(view, headline) {
  const { shown } = require('../lib/permissions'); // a rule or a name from a file is printed with its control characters escaped
  const clean = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? shown(v) : v]));
  view = { ...view, rules: view.rules.map(clean), offered: view.offered.map(clean), foreign: view.foreign.map(shown) };
  const lines = [];
  if (headline) lines.push(shown(headline), '');
  lines.push(`Claude Code permissions in ${view.settingsFile}`);
  if (!view.readable) lines.push(`  ${view.error}`);
  if (view.ledgerError) lines.push(`  ${view.ledgerError}`);
  lines.push(`Default mode: ${!view.readable ? 'unknown (the settings file cannot be read)' : view.mode.value === null ? 'not set in this file (Claude Code asks before it edits files or runs commands, except what the allow rules let it do, unless a project or managed setting sets a mode)' : `${shown(String(view.mode.value))} (in this file; a project or managed setting can set another)`}`);
  if (view.rules.length) {
    lines.push('', "PassionCode's rules:");
    for (const r of view.rules) {
      const removed = r.removedAt ? `removed ${r.removedAt} by ${r.removedBy}${['allowed', 'asked', 'denied'].includes(r.state) ? ', and set again by hand since' : ''}` : '';
      const when = removed || (r.installedAt ? `installed ${r.installedAt} by ${r.installedBy || r.by}` : 'not in the ledger (set before it, or by hand)');
      lines.push(`  ${r.state.padEnd(8)} ${r.rule} (${r.why}; declared by ${r.by}; ${when})`);
    }
  }
  if (view.offered.length) {
    lines.push('', 'Offered and not allowed yet:', ...view.offered.map((r) => `  ${r.rule} (${r.why}; declared by ${r.by})`));
    lines.push(`To allow them: ${require('../lib/doctor').NPX} permissions allow <rule>`);
  }
  if (view.foreign.length) lines.push('', "Other allow rules (not PassionCode's; never changed here):", ...view.foreign.map((rule) => `  ${rule}`));
  if (view.refused.length) lines.push('', 'Rules declared on this machine and not offered as declared:', ...view.refused.map((x) => `  ${x}`));
  return lines.join('\n');
}

// PC-123: `analytics on|off|status`, this product's own switch (lib/analytics.js).
function analyticsCommand(rest) {
  const A = require('../lib/analytics');
  const json = rest.includes('--json');
  const [verb = 'status', ...extra] = rest.filter((a) => a !== '--json');
  if (extra.length || !['on', 'off', 'status'].includes(verb)) return usage('analytics takes on, off or status');
  const state = L.paths().state;
  if (verb === 'status') A.honourSharedNo({ state }); // a no given earlier in another app is the answer from the first status on
  try { if (verb !== 'status') A.setEnabled(state, verb === 'on'); }
  catch (error) { process.stderr.write(`passioncode: the analytics switch could not be saved: ${error.message}\n`); return 1; }
  const s = A.status({ state });
  const why = { off: 'turned off (analytics off)', 'shared-unreadable': 'off for now: the shared PassionCode installation file cannot be read or holds no usable id, so nothing is sent until it can be', unreadable: `off for now: the switch file ${require('path').join(state, 'analytics.json')} cannot be read; analytics on or analytics off writes it again`, 'off-elsewhere': 'off, because they were turned off in another PassionCode app before the launcher counted anything; analytics on turns them on for the launcher alone', env: 'off for this process (PASSIONCODE_ANALYTICS=off)', 'do-not-track': 'off for this process (DO_NOT_TRACK)', 'no-key': 'this build carries no App Key, so nothing is sent', notice: `on, and this run shows their notice on stderr (unless another command is showing it right now); counts go to ${A.HOST} from then on` }; // the text says it; --json reports reason notice
  process.stdout.write(json ? JSON.stringify(s, null, 2) + '\n'
    : `Anonymous usage and error counts from the launcher: ${s.sending ? `on, sent to ${s.host}` : why[s.reason]}. Each PassionCode app has its own switch.\n`);
  return 0;
}

async function main(argv) {
  const [cmd = 'help', ...rest] = argv;
  if (cmd === 'permissions') return permissionsCommand(rest);
  if (cmd === 'analytics') return analyticsCommand(rest);
  if (cmd === 'setup' || cmd === 'onboard' || cmd === 'doctor') {
    try { return await setupOrDoctor(cmd === 'onboard' ? 'setup' : cmd, rest); } catch (error) {
      threw = true;
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
      const dryRun = rest.includes('--dry-run');
      const stateDir = L.paths().state;
      // LC-16: install outcomes go into the update log, which never creates the state folder: a refused
      // first install leaves nothing behind. A background update the hook started has its download done once this runs.
      const note = (event, outcome) => { if (!dryRun && require('fs').existsSync(stateDir)) require('../lib/update-log').logEvent(stateDir, event, outcome); };
      if (process.env.PASSIONCODE_UPDATE_FROM === 'session-start') note('update_download', 'done');
      let r;
      try { r = L.update({ dryRun }); } catch (error) { note('update_install', 'failed'); throw error; }
      const failed = r.steps.filter((s) => s.outcome === 'failed');
      note('update_install', failed.length ? 'failed' : 'installed');
      if (!quiet || failed.length) {
        const saved = r.moved.filter((e) => !e.failedAt).length;
        out(r, [
          ...r.steps.map((s) => `${s.outcome.padEnd(8)} ${s.kind.padEnd(11)} ${s.detail}${s.error ? `\n         ${s.error}` : ''}`),
          '',
          failed.length ? `${failed.length} step(s) failed. Completed steps remain applied. Fix the cause and retry${saved ? '; use passioncode restore for displaced files' : ''}.` : rest.includes('--dry-run') ? `Plan for PassionCode.ai ${r.version}: nothing was changed.` : `PassionCode.ai ${r.version}: done. Restart your agent: skills load at session start.`,
          // A registration that failed was never written, and restore skips it (PC-126): it is no recovery entry.
          saved ? `${saved} recovery entry(s) saved; use \`passioncode restore\`.` : '',
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
    // A partial restore or uninstall still shows what it did before its error (PC-127).
    const partly = (fn, label) => {
      try { return fn(); } catch (error) {
        if (Array.isArray(error.done) && error.done.length) out(error.done, `${label}:\n  ${error.done.join('\n  ')}`);
        throw error;
      }
    };
    if (cmd === 'restore') {
      const r = partly(() => L.restore(), 'Restored');
      out(r, r.length ? `Restored:\n  ${r.join('\n  ')}` : 'Nothing to restore.');
      return 0;
    }
    if (cmd === 'config' && configArgs[0] === 'set') {
      out(L.setConfig({ key: configArgs[1], value: configArgs[2] }), `update.auto = ${configArgs[2]}`);
      return 0;
    }
    if (cmd === 'uninstall') {
      const r = partly(() => L.uninstall(), 'Removed');
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

// PC-123: one batch of anonymous counts when the command ends (nothing from a build without a key, or when turned off).
const startedAt = Date.now();
const argv = process.argv.slice(2);
let threw = false; // a command that ended on a thrown error, not on what it found
const existing = require('fs').existsSync(L.paths().stateFile); // before the command: setup and update write it themselves
main(argv).then(async (code) => {
  process.exitCode = code; // first: the send below must never change how the command ended
  process.stderr.on('error', () => {}); // nor a stderr whose reader has gone (EPIPE): the notice then counts as not shown
  const cmd = { onboard: 'setup', install: 'update', '--help': 'help', '-h': 'help' }[argv[0]] || argv[0] || 'help'; // a word not in the list is sent as other
  // app_error's code: a plain doctor exits 1 when a check found a problem on the machine; --fix or a thrown error is other.
  const errorCode = cmd === 'doctor' && !argv.includes('--fix') && !threw ? 'check-failed' : 'other';
  await require('../lib/analytics').after({ command: cmd, code, errorCode, json: argv.includes('--json'), quiet: argv.includes('--quiet'), existing, startedAt, version: VERSION, state: L.paths().state });
});
