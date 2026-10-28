'use strict';
/**
 * `passioncode setup` (alias `onboard`): one idempotent command for a new machine and an existing
 * setup (ADR-0004). It checks everything first (the doctor's checks), plans, asks, then:
 *   installs the absent apps the person chose — verified releases only;
 *   repairs what the checks found — the skill set and MCP registrations (`update`), an outdated or
 *   damaged app nobody is running (a verified reinstall; the old bundle goes to the Trash), a
 *   launchd service that does not answer (`launchctl kickstart`, never a kill);
 *   opens the apps it installed;
 * then checks again and prints the before/after table and the steps that stay a person's.
 * On a healthy machine the plan is empty, nothing changes, and it exits 0.
 * `doctor --fix` is this command with `repairOnly`: no new apps, nothing opened.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('./launcher');
const catalog = require('./catalog');
const releases = require('./releases');
const D = require('./doctor');
const trains = require('./trains');

/** `setup --train <name>` remembers the train for later runs and for doctor; `--train none` forgets it. */
function saveTrain(home, id) {
  const file = L.paths(home).stateFile;
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (id) state.train = id; else delete state.train;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function prereqMissing(product) {
  const missing = [];
  for (const need of product.needs || []) {
    if (need === 'docker' && releases.run('docker', ['--version'], { timeout: 10000 }).code === 127) missing.push('Docker (OrbStack or Docker Desktop)');
    if (need === 'supabase' && releases.run('supabase', ['--version'], { timeout: 10000 }).code === 127) missing.push('the Supabase CLI');
  }
  return missing;
}

/** What setup would do, from the checks: installs of absent apps and repairs. */
/**
 * The pin a train sets for `pr`, or null for the latest release. An installed app newer than its
 * pin is never taken back (its data may not open in an older release), so its reinstall (a damaged
 * signature, PC-89) takes the latest release instead.
 */
function pinFor(pr, train) {
  const pin = train && train.apps[pr.id];
  if (!pin) return null;
  const installed = fs.existsSync(catalog.appPath(pr)) ? releases.appVersion(catalog.appPath(pr)) : null;
  return installed && D.newer(installed, pin) ? null : pin;
}

function plan(checks, { platform, withIds = null, withoutIds = [], noApps = false, repairOnly = false, train = null }) {
  const from = (pr) => (pinFor(pr, train) ? `its release ${train.apps[pr.id]}, pinned by release train ${train.id}` : 'its latest signed release');
  const items = [];
  if (platform === 'darwin' && !noApps && !repairOnly) {
    for (const pr of catalog.PRODUCTS) {
      if (fs.existsSync(catalog.appPath(pr))) continue;
      if (withoutIds.includes(pr.id) || (withIds && !withIds.includes(pr.id))) continue;
      const missing = prereqMissing(pr);
      const explicit = !!(withIds && withIds.includes(pr.id));
      items.push({
        kind: 'install', product: pr.id, selected: explicit || !missing.length,
        detail: `install ${pr.name}${pr.preview ? ' (early preview)' : ''} from ${from(pr)}`,
        note: missing.length ? `needs ${missing.join(' and ')}${explicit ? '; installed because you asked for it' : '; skipped unless you ask for it (--with ' + pr.id + ')'}` : null,
      });
    }
  }
  const seen = new Set();
  for (const c of checks) {
    const r = c.repair;
    if (!r) continue;
    if (r.kind === 'replace' && (noApps || platform !== 'darwin')) continue;
    if (r.kind === 'replace' && (withoutIds.includes(r.product) || (withIds && !withIds.includes(r.product)))) continue;
    const key = r.kind === 'update' ? 'update' : `${r.kind}:${r.product || r.label}`;
    if (seen.has(key)) { items.find((i) => i.key === key).because.push(c.id); continue; }
    seen.add(key);
    const pr = r.product ? catalog.byId(r.product) : null;
    items.push({
      key, kind: r.kind, product: r.product || null, label: r.label || null, selected: true, because: [c.id],
      detail: r.kind === 'update' ? 'install or refresh the skill set and register the apps\' MCP servers for every agent'
        : r.kind === 'replace' ? `reinstall ${pr.name} from ${from(pr)} (the current one goes to the Trash)`
          : `start the ${r.label} service through launchd`,
    });
  }
  return items;
}

const yesNo = async (ask, question, def) => {
  const a = String(await ask(`${question} [${def ? 'Y/n' : 'y/N'}] `) || '').trim().toLowerCase();
  return a ? a.startsWith('y') || a.startsWith('д') : def;
};

async function setup({
  home = os.homedir(), yes = false, withIds = null, withoutIds = [], noApps = false, noOpen = false, dryRun = false,
  repairOnly = false, online = true, ask = null, log = () => {}, platform = process.env.PASSIONCODE_PLATFORM || process.platform,
  train: trainName, // undefined: the saved one; null: none; a name: that train (PC-89)
} = {}) {
  const claude = L.claudeRunner();
  if (trainName) trains.load(trainName); // refused before anything is checked or changed
  const before = D.sortChecks(await D.collect({ home, platform, claude, online, train: trainName }));
  const followed = D.trainOf(home, trainName);
  const train = followed.train instanceof Error ? null : followed.train; // an unusable one is doctor's fail row
  const fresh = !before.some((c) => c.id === 'skills.installed' && c.state !== 'fail')
    // An app doctor found (ok or warn: on Windows from the installer's records, PC-86) makes it existing.
    && !before.some((c) => /^app\.[^.]+$/.test(c.id) && (c.state === 'ok' || c.state === 'warn'));
  // A saved train this launcher cannot use touches no app: neither its pins nor the latest releases,
  // until the person names a train or `none` (the `train` row's fix).
  const items = plan(before, { platform, withIds, withoutIds, noApps: noApps || followed.train instanceof Error, repairOnly, train });
  const result = {
    version: D.PKG, platform, mode: fresh ? 'new' : 'existing', at: new Date().toISOString(), plan: items,
    actions: [], before: { checks: before, summary: D.summarise(before) }, after: null, humanSteps: [], planOnly: false,
    keyOverride: process.env.PASSIONCODE_RELEASE_KEY || null,
  };

  // Ask: one question per absent app, one for the repairs. Without a terminal and without --yes,
  // nothing changes: the plan is the answer.
  if (dryRun) { result.planOnly = true; return finish(result, home, before); }
  if (!yes) {
    if (!ask) { result.planOnly = items.some((i) => i.selected); if (result.planOnly) return finish(result, home, before); }
    else {
      for (const i of items.filter((x) => x.kind === 'install')) {
        const pr = catalog.byId(i.product);
        i.selected = await yesNo(ask, `Install ${pr.name}${pr.preview ? ' (early preview)' : ''}${i.note ? ` — ${i.note}` : ''}?`, i.selected);
      }
      const repairs = items.filter((x) => x.kind !== 'install');
      if (repairs.length) {
        const go = await yesNo(ask, `Apply ${repairs.length} repair(s): ${repairs.map((r) => r.detail).join('; ')}?`, true);
        for (const r of repairs) r.selected = go;
      }
    }
  }

  // The train is saved once the run goes ahead: a plan shown and not acted on changes nothing.
  if (trainName !== undefined) saveTrain(home, trainName);

  const act = (kind, detail, product = null) => {
    const a = { kind, detail, product, outcome: 'done' };
    result.actions.push(a);
    log(`${kind.padEnd(9)} ${detail}`);
    return a;
  };
  const fail = (a, error) => { a.outcome = 'failed'; a.error = error.message || String(error); log(`  failed: ${a.error}`); };
  const installed = [];
  let needUpdate = items.some((i) => i.kind === 'update' && i.selected);

  // 1. Apps: installs of absent ones, verified reinstalls of outdated or damaged ones.
  for (const i of items.filter((x) => (x.kind === 'install' || x.kind === 'replace') && x.selected)) {
    const pr = catalog.byId(i.product);
    const a = act(i.kind, i.detail, pr.id);
    try {
      const cacheFile = path.join(L.paths(home).state, 'releases-cache.json');
      const pin = pinFor(pr, train);
      const release = pin ? await releases.releaseAt(pr, pin, { cacheFile }) : await releases.latestRelease(pr, { cacheFile });
      const done = await releases.installApp(pr, release, {
        work: path.join(L.paths(home).state, 'downloads', `${pr.id}-${release.version}`), replace: i.kind === 'replace', home,
        report: (st) => log(`  ${st.ok === false ? 'FAILED' : 'ok'}  ${st.detail}`),
      });
      a.detail = `${i.kind === 'install' ? 'installed' : 'reinstalled'} ${pr.name} ${done.version} at ${done.path}${done.replaced ? `; the previous one is in ${done.replaced}` : ''}`;
      if (i.kind === 'install') installed.push(pr); // a reinstalled app was idle and stays closed
      needUpdate = needUpdate || (i.kind === 'install' && !!(pr.mcp && !pr.mcp.external));
    } catch (error) { fail(a, error); }
  }

  // 2. The skill set and the bundled MCP registrations.
  if (needUpdate) {
    const a = act('update', 'the skill set and the apps\' MCP registrations');
    try {
      const r = L.update({ home, claude, includePreview: true }); // setup is where a person chose Fabric
      const failed = r.steps.filter((st) => st.outcome === 'failed');
      const changed = r.steps.filter((st) => st.outcome === 'done');
      a.steps = changed.concat(failed);
      a.detail = `PassionCode.ai ${r.version}: ${changed.length} change(s)${failed.length ? `, ${failed.length} failed` : ''}`;
      if (failed.length) fail(a, new Error(failed.map((st) => `${st.detail}: ${st.error}`).join('; ')));
    } catch (error) { fail(a, error); }
  }

  // 3. Services launchd owns and that did not answer: start, never kill.
  for (const i of items.filter((x) => x.kind === 'kickstart' && x.selected)) {
    const a = act('start', `launchctl kickstart gui/${process.getuid ? process.getuid() : 0}/${i.label}`);
    const r = releases.run('launchctl', ['kickstart', `gui/${process.getuid ? process.getuid() : 0}/${i.label}`], { timeout: 30000 });
    if (r.code !== 0) fail(a, new Error((r.err || r.out || `exit ${r.code}`).trim()));
  }

  // 4. Open what was installed for its first run (never in --fix, never with --no-open).
  if (!repairOnly && !noOpen) {
    for (const pr of installed) {
      const a = act('open', `${pr.name} for its first run`, pr.id);
      const r = releases.run('open', [catalog.appPath(pr)], { timeout: 30000 });
      if (r.code !== 0) fail(a, new Error((r.err || r.out || `exit ${r.code}`).trim()));
    }
  }

  const after = result.actions.length ? D.sortChecks(await D.collect({ home, platform, claude, online })) : before;
  result.after = { checks: after, summary: D.summarise(after) };

  // The person's steps, once: every remaining problem's fix, the guides of the apps just installed,
  // what an install leaves to a person, and a restart when skills or MCP servers changed.
  const steps = [];
  const push = (t) => { if (t && !steps.includes(t)) steps.push(t); };
  const anyFailed = result.actions.some((x) => x.outcome === 'failed');
  for (const c of after) {
    if (!(c.state === 'fail' || c.state === 'warn') || !c.fix) continue;
    if (c.fix === `${D.NPX} setup` && !anyFailed && !result.planOnly) continue; // this run was that command
    push(c.fix);
  }
  for (const i of items.filter((x) => x.kind === 'install' && !x.selected)) {
    const pr = catalog.byId(i.product);
    if (i.note) push(`${pr.name}: ${i.note}`);
  }
  for (const pr of installed) push(pr.guide);
  if (result.actions.some((a) => a.kind === 'update' && a.outcome === 'done' && /[1-9]\d* change/.test(a.detail)) || installed.length) {
    push('Restart your coding agents: skills and MCP servers load when a session starts.');
  }
  result.humanSteps = steps;
  return finish(result, home, after);
}

function finish(result, home, checks) {
  result.ok = !result.actions.some((a) => a.outcome === 'failed') && D.summarise(checks).fail === 0;
  if (!result.after) result.after = { checks, summary: D.summarise(checks) };
  // Stamped after the after-check: the update inside this run set installedAt earlier, and the
  // session hook ignores a result older than the installed release.
  if (!result.planOnly) D.save(home, { at: new Date().toISOString(), checks, summary: D.summarise(checks) });
  return result;
}

function render(result, { repairOnly = false } = {}) {
  const lines = [];
  if (result.keyOverride) lines.push(`NOTE: releases are checked against the key in PASSIONCODE_RELEASE_KEY (${result.keyOverride}), not the bundled PassionCode.ai release key.`, '');
  const b = result.before.summary, a = result.after.summary;
  lines.push(`${repairOnly ? 'doctor --fix' : 'setup'} · ${result.mode === 'new' ? 'a new setup' : 'an existing setup'} · ${result.platform}`);
  const todo = result.plan.filter((i) => i.selected);
  if (result.planOnly) {
    lines.push('', todo.length ? 'Plan (nothing was changed):' : 'Nothing to do.');
    for (const i of result.plan) lines.push(`  ${i.selected ? '•' : '–'} ${i.detail}${i.note ? ` (${i.note})` : ''}`);
    if (todo.length) lines.push('', 'Run it with --yes to apply, or in a terminal to answer one question per app.');
  } else if (!result.actions.length) {
    lines.push('', 'Everything this command can set up is in place; nothing was changed.');
  } else {
    lines.push('', 'Done:');
    for (const x of result.actions) lines.push(`  ${x.outcome === 'failed' ? 'FAILED' : 'done  '} ${x.detail}${x.error ? `\n         ${x.error}` : ''}`);
  }
  // Before → after, by area, and every check whose state moved.
  const areas = ['prerequisites', 'skills', 'apps', 'mcp', 'services'];
  const count = (checks, area, st) => checks.filter((c) => c.area === area && c.state === st).length;
  const single = result.planOnly || !result.actions.length;
  lines.push('', single ? 'Checks          now (ok/warn/fail)' : 'Checks          before (ok/warn/fail)   after (ok/warn/fail)');
  for (const area of areas) {
    const bc = result.before.checks, ac = result.after.checks;
    if (!bc.some((c) => c.area === area) && !ac.some((c) => c.area === area)) continue;
    const f = (cs) => `${count(cs, area, 'ok')}/${count(cs, area, 'warn')}/${count(cs, area, 'fail')}`;
    lines.push(single ? `  ${area.padEnd(14)}${f(ac)}` : `  ${area.padEnd(14)}${f(bc).padEnd(24)}${f(ac)}`);
  }
  const was = new Map(result.before.checks.map((c) => [c.id, c.state]));
  const moved = result.after.checks.filter((c) => was.has(c.id) && was.get(c.id) !== c.state && c.state !== 'info');
  for (const c of moved) lines.push(`  ${was.get(c.id)} → ${c.state}: ${c.detail}`);
  const left = result.after.checks.filter((c) => c.state === 'fail' || c.state === 'warn');
  if (left.length) {
    lines.push('', result.planOnly ? 'Open now:' : 'Still open:');
    for (const c of left) lines.push(`  ${c.state === 'fail' ? 'FAIL' : 'warn'}  ${c.detail}`);
  }
  if (result.humanSteps.length) {
    lines.push('', 'Your steps (an agent cannot do these for you — sign-ins, consents, secrets in hidden prompts):');
    result.humanSteps.forEach((t, n) => lines.push(`  ${n + 1}. ${t}`));
  }
  lines.push('', single ? `${a.fail ? `${a.fail} problem(s)` : 'No problems'}. Check again any time: npx @passioncode-ai/passioncode@latest doctor`
    : `${a.fail ? `${a.fail} problem(s) remain` : 'No problems remain'} (before: ${b.fail}). Check again any time: npx @passioncode-ai/passioncode@latest doctor`);
  return lines.join('\n');
}

module.exports = { setup, plan, render };
