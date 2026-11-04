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
const permissions = require('./permissions');

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
  if (!fs.existsSync(catalog.appPath(pr))) return pin;
  // A bundle whose version cannot be read may be ahead of the pin: it is reinstalled from the latest.
  const installed = D.normVersion(releases.appVersion(catalog.appPath(pr)));
  return !installed || D.newer(installed, pin) ? null : pin;
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

// An app that bundles its MCP server: installing it registers that server, which is the skill and MCP update.
const registers = (pr) => !!(pr.mcp && !pr.mcp.external);
const yesNo = async (ask, question, def) => {
  const a = String(await ask(`${question} [${def ? 'Y/n' : 'y/N'}] `) || '').trim().toLowerCase();
  return a ? a.startsWith('y') || a.startsWith('д') : def;
};

async function setup({
  home = os.homedir(), yes = false, withIds = null, withoutIds = [], noApps = false, noOpen = false, dryRun = false,
  repairOnly = false, online = true, ask = null, log = () => {}, platform = process.env.PASSIONCODE_PLATFORM || process.platform,
  train: trainName, // undefined: the saved one; null: none; a name: that train (PC-89)
  allowTools = false, // PC-117: the person's yes to PassionCode's own tool rules, given in advance
  allowCommands = false, // PC-119: the person's yes to the command rules, given in advance
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
  // PC-117: Claude Code's rules for PassionCode's own tools are shown in the plan and added only on the person's
  // yes to that set (a question in a terminal, or --allow-tools); --yes alone does not decide a security setting.
  // Offered where Claude Code is (its ~/.claude folder exists), never by doctor --fix.
  const settingsFile = L.paths(home).claudeSettings;
  const toolRules = repairOnly || !fs.existsSync(path.dirname(settingsFile)) ? { rules: [], error: null } : permissions.missing(settingsFile);
  if (toolRules.rules.length || toolRules.error) result.permissions = { rules: toolRules.rules, error: toolRules.error, taken: false };
  const offerRules = !!(result.permissions && result.permissions.rules.length);
  // PC-119: rules for shell commands, this launcher's own (COMMANDS) and those agents of the person's declare on this
  // machine (~/.passioncode/rules.d), a set of their own with its own question; settings that cannot be read are named
  // once, by the tool rules above.
  let commandsOffered = []; // the whole set, for a write whose plan could not read the settings
  if (!repairOnly && fs.existsSync(path.dirname(settingsFile))) {
    const local = permissions.declared(path.join(L.paths(home).state, 'rules.d'), { home, pathEnv: process.env.PATH, platform: process.platform });
    // A declaration names commands only (an MCP rule is refused by permissions.refusal); one the launcher carries is
    // listed once, as the launcher says it.
    const offered = [...permissions.COMMANDS, ...local.rules].filter((r, n, all) => all.findIndex((x) => x.rule === r.rule) === n);
    commandsOffered = offered;
    const lacking = toolRules.error ? [] : permissions.missing(settingsFile, offered.map((r) => r.rule)).rules;
    const rules = offered.filter((r) => lacking.includes(r.rule));
    if (rules.length || local.refused.length) result.commands = { rules, refused: local.refused, taken: false };
    // --allow-commands asked for them: settings that cannot be read make that a failed step, as for --allow-tools.
    // The plan shows the whole set it would write, since it cannot tell which rules the file already has.
    if (allowCommands && toolRules.error) result.commands = { rules: offered, refused: local.refused, taken: true, error: toolRules.error };
  }
  const offerCommands = !!(result.commands && result.commands.rules.length);

  // Ask: one question per absent app, one for the repairs. Without a terminal and without --yes,
  // nothing changes: the plan is the answer.
  // A train named again is no change: only a different one waits for agreement.
  const changesTrain = trainName !== undefined && trainName !== D.trainOf(home).id;
  if (offerRules && allowTools) result.permissions.taken = true; // before the dry run: its plan shows what the run would do
  // --allow-tools asked for the rules: settings it cannot read make that a failed step (exit 1), not a quiet success.
  if (allowTools && result.permissions && result.permissions.error) result.permissions.taken = true;
  if (offerCommands && allowCommands) result.commands.taken = true;
  if (dryRun) { result.planOnly = true; result.dryRun = true; if (changesTrain) result.trainNotSaved = trainName || 'none'; return finish(result, home, before); }
  let asked = false;
  let forcedUpdate = false; // PC-112: the update is the bundled install's to run, not the repairs question's
  const offeredYes = items.filter((i) => i.selected); // the offers a person declines by answering no
  if (!yes) {
    // A train named without --yes and without a terminal is a change nobody agreed to: plan only.
    if (!ask) {
      result.planOnly = items.some((i) => i.selected) || changesTrain;
      if (changesTrain) result.trainNotSaved = trainName || 'none';
      if (result.planOnly) return finish(result, home, before);
    }
    else {
      asked = true;
      for (const i of items.filter((x) => x.kind === 'install')) {
        const pr = catalog.byId(i.product);
        i.selected = await yesNo(ask, `Install ${pr.name}${pr.preview ? ' (early preview)' : ''}${i.note ? `: ${i.note}` : ''}?`, i.selected);
      }
      // PC-112: an install of an app that bundles its MCP server runs the skill and MCP update anyway (it
      // registers that server), so the repairs question does not ask about an update a no would not stop.
      const forced = items.some((x) => x.kind === 'install' && x.selected && registers(catalog.byId(x.product)));
      if (forced) forcedUpdate = true; // the update item stays taken (plan made it so) and runs with that install
      const repairs = items.filter((x) => x.kind !== 'install' && !(forced && x.kind === 'update'));
      if (repairs.length) {
        const go = await yesNo(ask, `Apply ${repairs.length} repair(s): ${repairs.map((r) => r.detail).join('; ')}?`, true);
        for (const r of repairs) r.selected = go;
      }
      if (offerRules && !result.permissions.taken) {
        result.permissions.taken = await yesNo(ask, `Let Claude Code use PassionCode's own tools without asking (allow ${result.permissions.rules.join(', ')})?`, false);
      }
      if (offerCommands && !result.commands.taken) {
        const wild = result.commands.rules.some((r) => wildcard(r.rule)) ? '; a rule ending in * allows any arguments after its words' : '';
        result.commands.taken = await yesNo(ask, `Let Claude Code run these commands without asking: ${result.commands.rules.map(commandLine).join('; ')}${wild}?`, false);
      }
    }
  }

  // The train is saved by a run the person agreed to: --yes, or answers in a terminal. Without
  // either nothing changes, whatever the plan. A person who answered no to every offer (at least one of
  // them defaulting to yes) declined a named train too; forgetting one (`none`) touches no app, so any answer saves
  // it: it is the way out of a saved train this launcher cannot use.
  const declinedAll = asked && offeredYes.length > 0 && !items.some((i) => i.selected) && !(result.permissions && result.permissions.taken)
    && !(result.commands && result.commands.taken);
  // PC-101: Enter on an offer that defaulted to no (Fabric without Docker) is not declining it (PC-89):
  // a declined run names those apps as not installed instead of counting them among the declined.
  const defaultNo = declinedAll ? items.filter((i) => i.kind === 'install' && !offeredYes.includes(i)).map((i) => catalog.byId(i.product).name) : [];
  // A named train declined with everything else changes nothing; its checks (made for that train)
  // are not saved as this machine's state either.
  if (trainName && declinedAll && changesTrain) {
    result.planOnly = true; result.declined = true; result.trainNotSaved = trainName;
    if (defaultNo.length) result.notTaken = defaultNo;
    // Its checks were made for the train it declined: what fixes them is setup with that train.
    result.humanSteps = humanSteps(result, before, items, [], noApps, `${D.NPX} setup --train ${trainName}`);
    return finish(result, home, before);
  }
  if (changesTrain) { // the train already saved is left as it is: nothing to write
    const was = D.trainOf(home).id;
    saveTrain(home, trainName);
    // A change of train is a change of this machine, reported like any other action.
    if (was !== trainName) {
      const detail = trainName ? `saved release train ${trainName}${was ? ` (it was ${was})` : ''}` : `forgot release train ${was}; apps follow their latest releases`;
      result.actions.push({ kind: 'train', detail, product: null, outcome: 'done' });
      log(`${'train'.padEnd(9)} ${detail}`);
    }
  }

  // Said so in the report: an empty run after "no" to every offer is not a machine with nothing to set
  // up. Forgetting a train (`--train none`) is still a change, so that run is not "declined".
  if (declinedAll && !result.actions.length) {
    result.declined = true;
    if (defaultNo.length) result.notTaken = defaultNo;
  }
  // PC-92: a run that asked, changed nothing and was not "declined" left install offers untaken
  // (each defaulting to no, like Fabric without Docker): it names them rather than calling the
  // machine set up. Pressing Enter on a default-no offer is not declining (PC-89, the test beginning
  // `PC-89: a run nobody agreed to`), so it says
  // "not installed", not "declined".
  if (asked && !result.declined && !result.actions.length && !items.some((i) => i.selected)) {
    const untaken = appsLeft(items);
    if (untaken.length) result.notTaken = untaken;
  }
  // PC-101: a run that asked nothing (--yes, or no terminal with nothing selected) and changed nothing
  // names the install offers it skipped by default (their notes are among the person's steps), rather
  // than calling the machine set up. Nothing was offered to a person, so they are "not installed".
  if (!asked && !result.actions.length && !items.some((i) => i.selected)) {
    const skipped = appsLeft(items);
    if (skipped.length) result.skipped = skipped;
  }

  const act = (kind, detail, product = null) => {
    const a = { kind, detail, product, outcome: 'done' };
    result.actions.push(a);
    log(`${kind.padEnd(9)} ${detail}`);
    return a;
  };
  const fail = (a, error) => { a.outcome = 'failed'; a.error = error.message || String(error); log(`  failed: ${a.error}`); };
  const installed = [];
  // A forced update runs only once its install has succeeded: an install that fails registers nothing.
  let needUpdate = !forcedUpdate && items.some((i) => i.kind === 'update' && i.selected);

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
      needUpdate = needUpdate || (i.kind === 'install' && registers(pr));
    } catch (error) { fail(a, error); }
  }

  // PC-112: an update only a bundled install would have run is not taken when that install failed.
  if (forcedUpdate && !needUpdate) for (const i of items.filter((x) => x.kind === 'update')) i.selected = false;

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

  // 2b. PassionCode's own tool rules for Claude Code, on the person's yes (PC-117).
  if (result.permissions && result.permissions.taken) {
    const file = L.paths(home).claudeSettings;
    const a = act('permissions', `allow ${result.permissions.rules.join(', ') || "PassionCode's own tools"} in ${file}`);
    try {
      const added = permissions.apply(file); // the file may have changed since the plan (the update writes it too)
      result.permissions.error = null; // read and written now, whatever the plan found
      a.detail = added.length ? `allowed ${added.join(', ')} in ${file} (an ask or deny rule for them still wins)`
        : `nothing to add in ${file}: each rule is already allowed, asked about or denied there`;
    } catch (error) { fail(a, error); }
  }

  // 2c. Rules for shell commands, on the person's yes to that set (PC-119).
  if (result.commands && result.commands.taken) {
    const file = L.paths(home).claudeSettings;
    const a = act('commands', `allow ${result.commands.rules.map((r) => r.rule).join(', ') || 'the rules for commands'} in ${file}`);
    try {
      // A plan that could not read the settings asks for the whole set; apply takes only what is still lacking.
      // The set the question showed; a plan that could not read the settings showed the whole set. Only what is still
      // lacking is added.
      const added = permissions.apply(file, (result.commands.error ? commandsOffered : result.commands.rules).map((r) => r.rule));
      result.commands.error = undefined;
      a.detail = added.length ? `allowed ${added.join(', ')} in ${file} (an ask or deny rule for them still wins${added.some(wildcard) ? '; a rule ending in * allows any arguments after its words' : ''})`
        : `nothing to add in ${file}: each rule is already allowed, asked about or denied there`;
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

  result.humanSteps = humanSteps(result, after, items, installed, noApps);
  return finish(result, home, after);
}

// The person's steps, once: every remaining problem's fix, the guides of the apps just installed,
// what an install leaves to a person, and a restart when skills or MCP servers changed.
function humanSteps(result, after, items, installed, noApps, setupStep = `${D.NPX} setup`) {
  const steps = [];
  const push = (t) => { if (t && !steps.includes(t)) steps.push(t); };
  const anyFailed = result.actions.some((x) => x.outcome === 'failed');
  // PC-94: a run that answered no to its repairs was not that command either, even when it changed
  // something else (forgetting a train with `--train none` saves it on any answer).
  const repairsLeft = items.some((i) => i.kind !== 'install' && !i.selected);
  for (const c of after) {
    if (!(c.state === 'fail' || c.state === 'warn') || !c.fix) continue;
    if (c.fix === `${D.NPX} setup` && !anyFailed && !result.planOnly && !noApps && !result.declined && !repairsLeft) continue; // this run was that command (unless it was declined)
    const train = 'first make the release train usable: '; // the train row names the same step
    const fix = c.fix.startsWith(train) ? c.fix.slice(train.length) : c.fix;
    // Every setup a fix names (alone, after "quit X, then run", or with --with) becomes the step's own
    // command; a fix that already names a train is left as written.
    push(fix.includes('--train') ? fix : fix.split(`${D.NPX} setup`).join(setupStep));
  }
  for (const i of items.filter((x) => x.kind === 'install' && !x.selected)) {
    const pr = catalog.byId(i.product);
    // PC-94: after a declined train, asking for an app (`--with`) is setup with that train; an app the
    // person named with --with and then answered no to was not installed, whatever its note said.
    const ask = setupStep === `${D.NPX} setup` ? '--with' : `${setupStep} --with`;
    const note = i.note && i.note.replace('; installed because you asked for it', `; not installed (--with ${pr.id})`).replace('(--with ', `(${ask} `);
    if (note) push(`${pr.name}: ${note}`);
  }
  for (const pr of installed) push(pr.guide);
  if (result.actions.some((a) => a.kind === 'update' && a.outcome === 'done' && /[1-9]\d* change/.test(a.detail)) || installed.length) {
    push('Restart your coding agents: skills and MCP servers load when a session starts.');
  }
  return steps;
}

function finish(result, home, checks) {
  result.ok = !result.actions.some((a) => a.outcome === 'failed') && D.summarise(checks).fail === 0;
  if (!result.after) result.after = { checks, summary: D.summarise(checks) };
  // Stamped after the after-check: the update inside this run set installedAt earlier, and the
  // session hook ignores a result older than the installed release.
  if (!result.planOnly) D.save(home, { at: new Date().toISOString(), checks, summary: D.summarise(checks) });
  return result;
}

// The exit code of a setup or doctor --fix run. A plan exits 0 (nothing was agreed, nothing ran);
// a declined run (PC-91) is not a plan but the person's answer, so it exits by its checks like any
// run that changed nothing (PC-93): 1 when a check still fails, with or without a named train.
const exitCode = (r) => (r.planOnly && !r.declined ? 0 : r.ok ? 0 : 1);

// The install offers a run leaves out, by app name: what the plan would leave, what a run that asked
// left untaken, what a run that asked nothing skipped (PC-105: one rule for the three).
const appsLeft = (items) => items.filter((i) => i.kind === 'install' && !i.selected).map((i) => catalog.byId(i.product).name);

const were = (names) => `${names.join(' and ')} ${names.length > 1 ? 'were' : 'was'}`;
const declined = (r, a) => (r.notTaken
  ? `You declined every other offer, and ${were(r.notTaken)} not installed; nothing was changed.${stand(a)}`
  : `You declined every offer; nothing was changed.${stand(a)}`);
const notTaken = (names, a) => `Nothing was changed: ${were(names)} offered and not installed.${stand(a)}`;
const skipped = (names, a) => `Nothing was changed: ${were(names)} not installed (see your steps below).${stand(a)}`;
const wouldSkip = (names, a) => `Nothing would change: ${names.join(' and ')} would not be installed (see the plan below).${stand(a)}`;
// PC-104, PC-105: a headline that says nothing changed points at the checks below whenever one is
// still open (a FAIL or a WARN, the rows "Open now" and "Still open" list), and only then.
const stand = (a) => (a.fail || a.warn ? ' The checks below still stand.' : '');
// PC-105: a plan's train is one of its lines; forgetting it (`--train none`) names no train.
// PC-119: a command rule as the plan and the question show it: the rule, what it allows, and who declared it.
const wildcard = (rule) => /(?::\*| \*)\)$/.test(rule);
const commandLine = (r) => `${r.rule} (${r.why}${r.by ? `; declared by ${r.by}` : ''})`;
const toolsStep = (rules) => `let Claude Code use PassionCode's own tools without asking: allow ${rules.join(', ')}`;
const trainStep = (t) => (t === 'none' ? 'forget the saved release train' : `save release train ${t}`);

function render(result, { repairOnly = false } = {}) {
  const lines = [];
  if (result.keyOverride) lines.push(`NOTE: releases are checked against the key in PASSIONCODE_RELEASE_KEY (${result.keyOverride}), not the bundled PassionCode.ai release key.`, '');
  const b = result.before.summary, a = result.after.summary;
  lines.push(`${repairOnly ? 'doctor --fix' : 'setup'} · ${result.mode === 'new' ? 'a new setup' : 'an existing setup'} · ${result.platform}`);
  const todo = result.plan.filter((i) => i.selected);
  const tools = result.permissions; // PC-117: PassionCode's own tool rules for Claude Code, when any are missing
  const cmds = result.commands && result.commands.rules.length ? result.commands : null; // PC-119: command rules offered
  // The flags that take what a terminal would ask about and --yes does not decide.
  const untaken = [tools && tools.rules.length && !tools.taken && '--allow-tools', cmds && !cmds.taken && '--allow-commands'].filter(Boolean);
  if (result.planOnly) {
    // PC-104: a plan whose only change is a train is still a plan; an empty one names the apps it would leave.
    const leftApps = appsLeft(result.plan);
    const trainPlanned = result.trainNotSaved && !result.declined;
    const toolsPlanned = !!(!result.declined && ((tools && tools.rules.length) || cmds)); // PC-117, PC-119: rules offered or taken are part of a plan
    lines.push('', todo.length || trainPlanned || toolsPlanned ? 'Plan (nothing was changed):'
      : result.declined ? declined(result, a) : leftApps.length ? wouldSkip(leftApps, a) : `Nothing to do.${stand(a)}`);
    // PC-94: a declined run lists no plan: the person answered it, and its headline points at the checks.
    if (!result.declined) for (const i of result.plan) lines.push(`  ${i.selected ? '•' : '–'} ${i.detail}${i.note ? ` (${i.note})` : ''}`);
    if (trainPlanned) lines.push(`  • ${trainStep(result.trainNotSaved)}`);
    // PC-117: the tool rules are a line of the plan, taken only on their own yes.
    if (!result.declined && tools && tools.rules.length) lines.push(`  ${tools.taken ? '•' : '–'} ${toolsStep(tools.rules)} (asked in a terminal, or --allow-tools)`);
    // PC-119: the command rules are one line of the plan, each rule under it with what it allows.
    if (!result.declined && cmds) {
      lines.push(`  ${cmds.taken ? '•' : '–'} let Claude Code run these commands without asking (asked in a terminal, or --allow-commands):`);
      for (const r of cmds.rules) lines.push(`      ${commandLine(r)}`);
      if (cmds.rules.some((r) => wildcard(r.rule))) lines.push('      (a rule ending in * allows any arguments after its words, options included)');
    }
    // PC-107: the train line says what was not saved; how to apply the plan is the footer's alone, and
    // after a --dry-run (which only plans, with --yes or in a terminal too) it is to run without it, and
    // with --yes or in a terminal, since without either that run would only plan again.
    if (result.trainNotSaved) {
      lines.push('', result.trainNotSaved === 'none' ? 'The saved release train was not forgotten.' : `The release train (${result.trainNotSaved}) was not saved.`);
    }
    if (todo.length || trainPlanned || toolsPlanned) {
      // PC-110: a terminal asks about every item of the plan, an offer that defaults to no included; a plan
      // with none (its only change is a train) asks nothing there and saves the train at once.
      // PC-117: a dry run whose only change is the rules (an offer that defaults to no may stand beside them, unticked)
      // is applied in a terminal or with --allow-tools, never with --yes alone.
      const asksOnly = !todo.length && !trainPlanned && untaken.length; // a set taken already keeps its flag; the footer names the rest
      lines.push('', result.dryRun ? asksOnly ? `Run it without --dry-run, in a terminal or with ${untaken.join(' and ')}, to apply.` : 'Run it without --dry-run (with --yes, or in a terminal) to apply.'
        : result.plan.length || untaken.length ? 'Run it with --yes to apply, or in a terminal to answer its questions.' : 'Run it with --yes, or in a terminal, to apply.');
    }
  } else if (!result.actions.length) {
    lines.push('', result.declined ? declined(result, a) : result.notTaken ? notTaken(result.notTaken, a)
      : result.skipped ? skipped(result.skipped, a)
        // PC-117: the tool rules it can add are not in place while they are still offered.
        : (tools && (tools.rules.length || tools.error)) || cmds ? `Everything else this command can set up is in place; nothing was changed.${stand(a)}`
          : `Everything this command can set up is in place; nothing was changed.${stand(a)}`);
  } else {
    lines.push('', 'Done:');
    for (const x of result.actions) lines.push(`  ${x.outcome === 'failed' ? 'FAILED' : 'done  '} ${x.detail}${x.error ? `\n         ${x.error}` : ''}`);
  }
  // PC-117: a run that left the tool rules out says how to add them; settings it cannot read are named.
  if (tools && tools.error) {
    lines.push('', `Claude Code's settings were not changed: ${tools.error}`);
    const failing = [tools.taken && '--allow-tools', result.commands && result.commands.taken && result.commands.error && '--allow-commands'].filter(Boolean);
    if (failing.length && result.planOnly) lines.push(`A run with ${failing.join(' or ')} fails until that is fixed.`);
  }
  else if (tools && !tools.taken && (!result.planOnly || result.declined)) lines.push('', `Claude Code still asks before it uses PassionCode's own tools. To allow them: ${D.NPX} setup --allow-tools`);
  // PC-119: the same for the command rules, and every rule an agent declared that was not offered, with why.
  if (cmds && !cmds.taken && (!result.planOnly || result.declined)) {
    lines.push('', `Claude Code still asks before it runs ${cmds.rules.map((r) => r.rule).join(', ')}. To allow them: ${D.NPX} setup --allow-commands${cmds.rules.some((r) => wildcard(r.rule)) ? ' (a rule ending in * allows any arguments after its words)' : ''}`);
  }
  const refused = (result.commands && result.commands.refused) || [];
  if (refused.length) lines.push('', 'Rules declared on this machine and not offered:', ...refused.map((x) => `  ${x}`));
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
    lines.push('', result.planOnly && !result.declined ? 'Open now:' : 'Still open:'); // a declined run is a run (exitCode)
    for (const c of left) lines.push(`  ${c.state === 'fail' ? 'FAIL' : 'warn'}  ${c.detail}`);
  }
  if (result.humanSteps.length) {
    lines.push('', 'Your steps (sign-ins, consents and secrets in hidden prompts need you in person):');
    result.humanSteps.forEach((t, n) => lines.push(`  ${n + 1}. ${t}`));
  }
  // PC-107: warnings are named beside the problems (FAILs), so "No problems" never stands alone above them.
  const warned = a.warn ? `, ${a.warn} warning(s)` : '';
  lines.push('', single ? `${a.fail ? `${a.fail} problem(s)` : 'No problems'}${warned}. Check again any time: npx @passioncode-ai/passioncode@latest doctor`
    : `${a.fail ? `${a.fail} problem(s) remain` : 'No problems remain'} (before: ${b.fail})${warned}. Check again any time: npx @passioncode-ai/passioncode@latest doctor`);
  return lines.join('\n');
}

module.exports = { setup, plan, render, exitCode };
