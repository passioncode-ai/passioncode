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
const ledger = require('./ledger');
const memory = require('./memory');
const VERSION = require('../package.json').version;

/** `setup --train <name>` remembers the train for later runs and for doctor; `--train none` forgets it. */
function saveTrain(home, id) { saveState(home, (state) => { if (id) state.train = id; else delete state.train; }); }

/** Change the launcher's state file in place (written whole, through a temporary file). */
function saveState(home, change) {
  const file = L.paths(home).stateFile;
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  change(state);
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
function pinFor(pr, train, home = os.homedir()) {
  const pin = train && train.apps[pr.id];
  if (!pin) return null;
  if (!fs.existsSync(catalog.appPath(pr, { home })) || catalog.foreignBundle(catalog.appPath(pr, { home }))) return pin;
  // A bundle whose version cannot be read may be ahead of the pin: it is reinstalled from the latest.
  const installed = D.normVersion(releases.appVersion(catalog.appPath(pr, { home })));
  return !installed || D.newer(installed, pin) ? null : pin;
}

/** `--with` and `--without` take `memory` for both of its parts, Obsidian and obsidian-wiki (PC-178). */
const expandIds = (ids) => (ids ? [...new Set(ids.flatMap((x) => (x === 'memory' ? catalog.MEMORY_IDS : [x])))] : ids);

function plan(checks, { platform, withIds = null, withoutIds = [], noApps = false, repairOnly = false, train = null, home = os.homedir(), wikiVault = null }) {
  withIds = expandIds(withIds); withoutIds = expandIds(withoutIds);
  const from = (pr) => (pinFor(pr, train, home) ? `its release ${train.apps[pr.id]}, pinned by release train ${train.id}`
    // PC-178: Obsidian publishes no signed checksums; its own chain checks it (ADR-0006).
    : pr.trust === 'vendor' ? `its latest release, checked by ${pr.name}'s own Developer ID signature, its notarization and GitHub's digest` : 'its latest signed release');
  const items = [];
  if (platform === 'darwin' && !noApps && !repairOnly) {
    for (const pr of [...catalog.PRODUCTS, catalog.OBSIDIAN]) { // PC-178: Obsidian, where a person reads the wiki memory
      // PC-160: another user's copy at this user's place is planned as a blocked install, never as installed.
      if (fs.existsSync(catalog.appPath(pr, { home })) && !catalog.foreignBundle(catalog.appPath(pr, { home }))) continue;
      if (catalog.adminCopy(pr, { home })) continue; // PC-178: an administrator's Obsidian is this user's too
      if (withoutIds.includes(pr.id) || (withIds && !withIds.includes(pr.id))) continue;
      const missing = prereqMissing(pr);
      const explicit = !!(withIds && withIds.includes(pr.id));
      const blocked = catalog.blockedFolder(catalog.appPath(pr, { home })); // PC-147: named before anything is downloaded
      items.push({
        kind: 'install', product: pr.id, selected: !blocked && (explicit || !missing.length), blocked: !!blocked,
        detail: `install ${pr.name}${pr.preview ? ' (early preview)' : ''} into ${path.dirname(catalog.appPath(pr, { home }))} from ${from(pr)}`,
        note: blocked ? `${catalog.blockedNote(blocked)}${missing.length ? `; it also needs ${missing.join(' and ')}` : ''}`
          : missing.length ? `needs ${missing.join(' and ')}${explicit ? '; installed because you asked for it' : '; skipped unless you ask for it (--with ' + pr.id + ')'}` : null,
      });
    }
  }
  // PC-178: the agents' wiki memory, on every system: obsidian-wiki at the launcher's pin (with uv) and, for a user with
  // no obsidian-wiki config, a new vault. An existing config or vault is left exactly as it is.
  const wiki = catalog.WIKI.id;
  if (!noApps && !repairOnly && !withoutIds.includes(wiki) && !(withIds && !withIds.includes(wiki))) {
    const vault = wikiVault || memory.defaultVault(home);
    const need = memory.needs(home, vault, platform);
    if (need.tool || need.vault) {
      const problem = need.vault ? need.problem : null;
      const unavailable = !!need.note || !!problem; // uv or git missing, or a folder that holds files: named, never asked
      items.push({
        key: 'memory', kind: 'memory', product: wiki, selected: !unavailable, unavailable, vault: need.vault ? vault : null,
        detail: need.tool && need.vault ? `install ${catalog.WIKI.name} ${memory.PIN} with uv (the agents' wiki memory) and make its vault in ${vault}`
          : need.tool ? `install ${catalog.WIKI.name} ${memory.PIN} with uv (the agents' wiki memory); your wiki config stays as it is`
            : `make the agents' wiki vault in ${vault} with obsidian-wiki setup --no-hooks`,
        note: problem ? `${vault} ${problem}; choose an empty or new folder with --wiki-vault <dir>` : need.note,
      });
    }
  }
  const seen = new Set();
  for (const c of checks) {
    const r = c.repair;
    if (!r) continue;
    // PC-178: the memory's repairs are left out with it, and under --no-apps (the recovery run installs and upgrades nothing).
    if ((r.kind === 'tool' || r.kind === 'hook') && (noApps || withoutIds.includes(r.product) || (withIds && !withIds.includes(r.product)))) continue;
    if (r.kind === 'replace' && (noApps || platform !== 'darwin')) continue;
    if (r.kind === 'replace' && (withoutIds.includes(r.product) || (withIds && !withIds.includes(r.product)))) continue;
    const key = r.kind === 'update' ? 'update' : `${r.kind}:${r.product || r.label}`;
    if (seen.has(key)) { items.find((i) => i.key === key).because.push(c.id); continue; }
    seen.add(key);
    const pr = r.product ? catalog.appById(r.product) : null;
    const blocked = r.kind === 'replace' ? catalog.blockedFolder(catalog.appPath(pr, { home })) : null; // PC-147
    items.push({
      key, kind: r.kind, product: r.product || null, label: r.label || null, selected: !blocked, blocked: !!blocked, because: [c.id],
      ...(blocked ? { note: catalog.blockedNote(blocked) } : {}),
      detail: r.kind === 'update' ? 'install or refresh the skill set and register the apps\' MCP servers for every agent'
        : r.kind === 'replace' ? `reinstall ${pr.name} from ${from(pr)}${blocked ? '' : ' (the current one goes to the Trash)'}`
          : r.kind === 'tool' ? `bring ${catalog.WIKI.name} up to ${memory.PIN} with uv tool install --force (its config and vault stay as they are)`
            : r.kind === 'hook' ? `register obsidian-wiki's SessionStart recap for Claude Code again (obsidian-wiki hooks install --only SessionStart)`
            : `start the ${r.label} service through launchd`,
    });
  }
  return items;
}

// An app that bundles its MCP server: installing it registers that server, which is the skill and MCP update.
const registers = (pr) => !!(pr.mcp && !pr.mcp.external);
// An offer setup asks about one by one: an absent app, or the agents' wiki memory (PC-178); the rest are repairs.
const offer = (i) => i.kind === 'install' || i.kind === 'memory';
// What an offer is called where a run names what it left: the app's name, or the wiki memory.
const itemName = (i) => (i.kind === 'memory' ? 'the wiki memory' : catalog.appById(i.product).name);
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
  wikiVault = null, // PC-178: where a new wiki vault goes; null: ~/Documents/Wiki
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
  const items = plan(before, { platform, withIds, withoutIds, noApps: noApps || followed.train instanceof Error, repairOnly, train, home, wikiVault });
  // PC-178: parts of the memory this run leaves out (--without, --with others, --no-apps, an unusable train): their rows
  // stay in the checks but do not fail the run.
  const outIds = expandIds(withoutIds) || [], inIds = expandIds(withIds);
  const leftOut = catalog.MEMORY_IDS.filter((id) => noApps || followed.train instanceof Error || outIds.includes(id) || (inIds && !inIds.includes(id)));
  const result = {
    version: D.PKG, platform, mode: fresh ? 'new' : 'existing', at: new Date().toISOString(), plan: items,
    actions: [], before: { checks: before, summary: D.summarise(before) }, after: null, humanSteps: [], planOnly: false,
    keyOverride: process.env.PASSIONCODE_RELEASE_KEY || null,
  };
  // PC-178: the memory ids this run left out, in the JSON, so `ok` and `after.summary.fail` reconcile.
  result.leftOut = leftOut;
  Object.defineProperty(result, 'home', { value: home, enumerable: false });
  // PC-147: an app whose folder (or bundle) this user cannot write is never installed or replaced by this run,
  // whatever else it changes; `blocked` names those apps in every run, a dry run included: the plan's blocked items,
  // and the apps of problems doctor marked blocked that the plan has no item for (an outdated copy in use, an app
  // this run leaves out with --without or --no-apps, a stale MCP entry).
  const blockedApps = [...new Set([
    ...items.filter((i) => i.blocked).map((i) => i.product),
    ...before.filter((c) => c.blocked && c.product && (c.state === 'fail' || c.state === 'warn')).map((c) => c.product),
  ].map((id) => catalog.appById(id).name))];
  if (blockedApps.length) result.blocked = blockedApps;
  // PC-117: Claude Code's rules for PassionCode's own tools are shown in the plan and added only on the person's
  // yes to that set (a question in a terminal, or --allow-tools); --yes alone does not decide a security setting.
  // Offered where Claude Code is (its ~/.claude folder exists), never by doctor --fix.
  const settingsFile = L.paths(home).claudeSettings;
  let commandSources = {}; // where each declared rule for commands came from, for the ledger (PC-125)
  // PC-133: a rule the person took out with `permissions remove` stays out until they name it again.
  const keptOut = repairOnly ? new Map() : ledger.removed(L.paths(home).state);
  const notRemoved = (rule) => !keptOut.has(rule);
  const toolRules = repairOnly || !fs.existsSync(path.dirname(settingsFile)) ? { rules: [], error: null } : permissions.missing(settingsFile);
  const keptTools = toolRules.rules.filter((rule) => !notRemoved(rule));
  toolRules.rules = toolRules.rules.filter(notRemoved);
  if (toolRules.rules.length || toolRules.error) result.permissions = { rules: toolRules.rules, error: toolRules.error, taken: false };
  // PC-125: the default mode the settings set, so a hint never says Claude Code asks when its mode does not (kept out of
  // the JSON result: it is the settings file's, not this run's).
  const loaded = toolRules.error || !fs.existsSync(settingsFile) ? null : permissions.load(settingsFile);
  const userPerms = loaded && !loaded.error && loaded.doc.permissions ? loaded.doc.permissions : {};
  // bypassPermissions switched off in the same file (disableBypassPermissionsMode) falls back to asking.
  const userMode = userPerms.defaultMode === 'bypassPermissions' && userPerms.disableBypassPermissionsMode === 'disable' ? undefined : userPerms.defaultMode;
  Object.defineProperty(result, 'claudeMode', { value: userMode, enumerable: false });
  const offerRules = !!(result.permissions && result.permissions.rules.length);
  // PC-119: rules for shell commands, this launcher's own (COMMANDS) and those agents of the person's declare on this
  // machine (~/.passioncode/rules.d), a set of their own with its own question; settings that cannot be read are named
  // once, by the tool rules above.
  if (!repairOnly && fs.existsSync(path.dirname(settingsFile))) {
    // A declaration names commands only (an MCP rule is refused by permissions.refusal); one the launcher carries is
    // listed once, as the launcher says it; PATH is read as Claude Code's shell has it (permissions.shellPath).
    const local = permissions.commandSet(L.paths(home).state, home);
    const offered = local.rules.filter((r) => notRemoved(r.rule));
    commandSources = local.sources;
    const lacking = toolRules.error ? [] : permissions.missing(settingsFile, local.rules.map((r) => r.rule)).rules;
    const rules = offered.filter((r) => lacking.includes(r.rule));
    keptTools.push(...local.rules.filter((r) => !notRemoved(r.rule) && lacking.includes(r.rule)).map((r) => r.rule));
    if (rules.length || local.refused.length) result.commands = { rules, refused: local.refused, taken: false };
    // --allow-commands asked for them: settings that cannot be read make that a failed step, as for --allow-tools.
    // The plan shows the whole set it would write, since it cannot tell which rules the file already has.
    if (allowCommands && toolRules.error) result.commands = { rules: offered, refused: local.refused, taken: true, error: toolRules.error };
  }
  const offerCommands = !!(result.commands && result.commands.rules.length);
  // PC-133: the rules left out because the person removed them, named with how to add one back.
  if (keptTools.length) result.keptOut = keptTools.map((rule) => ({ rule, removedAt: keptOut.get(rule).at, removedBy: keptOut.get(rule).by }));

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
      for (const i of items.filter((x) => offer(x) && !x.blocked && !x.unavailable)) { // a blocked one is named, never asked (PC-147)
        if (i.kind === 'memory') { i.selected = await yesNo(ask, `${i.detail[0].toUpperCase()}${i.detail.slice(1)}?`, i.selected); continue; } // PC-178
        const pr = catalog.appById(i.product);
        i.selected = await yesNo(ask, `Install ${pr.name}${pr.preview ? ' (early preview)' : ''} into ${path.dirname(catalog.appPath(pr, { home }))}${i.note ? `: ${i.note}` : ''}?`, i.selected);
      }
      // PC-112: an install of an app that bundles its MCP server runs the skill and MCP update anyway (it
      // registers that server), so the repairs question does not ask about an update a no would not stop.
      const forced = items.some((x) => x.kind === 'install' && x.selected && registers(catalog.appById(x.product)));
      if (forced) forcedUpdate = true; // the update item stays taken (plan made it so) and runs with that install
      const repairs = items.filter((x) => !offer(x) && !x.blocked && !(forced && x.kind === 'update'));
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
  const defaultNo = declinedAll ? items.filter((i) => offer(i) && !i.blocked && !offeredYes.includes(i)).map(itemName) : [];
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
    const pr = catalog.appById(i.product);
    const a = act(i.kind, i.detail, pr.id);
    try {
      const cacheFile = path.join(L.paths(home).state, 'releases-cache.json');
      const pin = pinFor(pr, train, home);
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

  // 1b. The agents' wiki memory (PC-178): obsidian-wiki at the pin and, for a user with no config, a new vault; an older
  // obsidian-wiki brought up to the pin (a repair). Neither runs obsidian-wiki setup over an existing config.
  // Claude Code is here when its CLI answers (doctor's rule); obsidian-wiki writes its hooks only to ~/.claude/settings.json.
  const claudeCode = { here: claude.available(), settings: L.paths(home).claudeSettings };
  // An older copy uv installed is brought up to the pin first, so a new vault is made by the pinned version.
  for (const i of items.filter((x) => x.kind === 'tool' && x.selected)) {
    const a = act('tool', i.detail, i.product);
    try { a.detail = memory.upgrade({ home, NPX: D.NPX }); } catch (error) { fail(a, error); }
  }
  for (const i of items.filter((x) => x.kind === 'memory' && x.selected)) {
    const a = act('memory', i.detail, i.product);
    try {
      a.detail = memory.install({
        home, vault: i.vault || memory.defaultVault(home), claude: claudeCode, report: (line) => log(`  ok  ${line}`),
        // The vault this launcher made is remembered: its missing SessionStart hook is a repair later (doctor's memory.hooks).
        made: (vault) => { a.vault = vault; saveState(home, (st) => { st.wiki = { vault, at: new Date().toISOString() }; }); },
      });
    } catch (error) { fail(a, error); }
  }
  for (const i of items.filter((x) => x.kind === 'hook' && x.selected)) {
    const a = act('hook', i.detail, i.product);
    try { a.detail = memory.hook({ home }); } catch (error) { fail(a, error); }
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
      // The file may have changed since the plan (the update writes it too); a rule the person removed stays out.
      const added = permissions.apply(file, permissions.RULES.filter(notRemoved));
      result.permissions.error = null; // read and written now, whatever the plan found
      a.detail = added.length ? `allowed ${added.join(', ')} in ${file} (an ask or deny rule for them still wins)`
        : `nothing to add in ${file}: each rule is already allowed, asked about or denied there`;
      // PC-125: the ledger names what PassionCode installed, for Fabric's permissions screen; the rules stand without it.
      a.detail += ledgerNote(() => ledger.record(L.paths(home).state, file, ledger.known(L.paths(home).state, home).rules.filter((r) => added.includes(r.rule)), { version: VERSION }));
    } catch (error) { fail(a, error); }
  }

  // 2c. Rules for shell commands, on the person's yes to that set (PC-119).
  if (result.commands && result.commands.taken) {
    const file = L.paths(home).claudeSettings;
    const a = act('commands', `allow ${result.commands.rules.map((r) => r.rule).join(', ') || 'the rules for commands'} in ${file}`);
    try {
      // A plan that could not read the settings asks for the whole set; apply takes only what is still lacking.
      // The set the plan and the question showed (the whole set when the plan could not read the settings); only what
      // is still lacking is added.
      const added = permissions.apply(file, result.commands.rules.map((r) => r.rule));
      result.commands.error = undefined;
      a.detail = added.length ? `allowed ${added.join(', ')} in ${file} (an ask or deny rule for them still wins${added.some(wildcard) ? '; a rule ending in * allows any arguments after its words' : ''})`
        : `nothing to add in ${file}: each rule is already allowed, asked about or denied there`;
      a.detail += ledgerNote(() => ledger.record(L.paths(home).state, file, result.commands.rules.filter((r) => added.includes(r.rule))
        .map((r) => ({ rule: r.rule, set: 'commands', why: r.why, by: r.by, source: commandSources[r.rule] || 'launcher' })), { version: VERSION }));
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
      const r = releases.run('open', [catalog.appPath(pr, { home })], { timeout: 30000 });
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
  const repairsLeft = items.some((i) => !offer(i) && !i.selected && !i.blocked);
  const blockedRepair = new Set(items.filter((i) => i.kind === 'replace' && i.blocked).map((i) => i.product));
  for (const c of after) {
    if (!(c.state === 'fail' || c.state === 'warn') || !c.fix) continue;
    if (c.repair && c.repair.kind === 'replace' && blockedRepair.has(c.repair.product)) continue; // its note below says why (PC-147)
    if (c.id === 'sessions.on-demand') continue; // PC-124: a readiness note (the default agent may not be Claude Code), never a step the person owes
    if (c.fix === `${D.NPX} setup` && !anyFailed && !result.planOnly && !noApps && !result.declined && !repairsLeft) continue; // this run was that command (unless it was declined)
    const train = 'first make the release train usable: '; // the train row names the same step
    const fix = c.fix.startsWith(train) ? c.fix.slice(train.length) : c.fix;
    // Every setup a fix names (alone, after "quit X, then run", or with --with) becomes the step's own
    // command; a fix that already names a train is left as written.
    // PC-147: a row setup cannot repair names its app, as a blocked plan item's note does (the same text, so once).
    // A product with a blocked plan item is named once, by that item's note below (it may say more, such as Docker).
    if (c.blocked && c.product) { if (!items.some((i) => i.blocked && i.product === c.product)) push(`${catalog.appById(c.product).name}: ${fix}`); continue; }
    push(fix.includes('--train') ? fix : fix.split(`${D.NPX} setup`).join(setupStep));
  }
  for (const i of items.filter((x) => x.kind === 'install' && !x.selected)) {
    const pr = catalog.appById(i.product);
    // PC-94: after a declined train, asking for an app (`--with`) is setup with that train; an app the
    // person named with --with and then answered no to was not installed, whatever its note said.
    const ask = setupStep === `${D.NPX} setup` ? '--with' : `${setupStep} --with`;
    const note = i.note && i.note.replace('; installed because you asked for it', `; not installed (--with ${pr.id})`).replace('(--with ', `(${ask} `);
    if (note) push(`${pr.name}: ${note}`);
  }
  // PC-178: the memory left out by what it needs (uv, an empty folder), with how to get it.
  for (const i of items.filter((x) => x.kind === 'memory' && !x.selected && x.note)) push(`The wiki memory: ${i.note}`);
  for (const i of items.filter((x) => x.kind === 'replace' && x.blocked)) push(`${catalog.appById(i.product).name}: ${i.note}`);
  // PC-178: a vault this run made is named, to open in Obsidian (its guide says the same in general words, so it gives way).
  const vaults = result.actions.filter((x) => x.kind === 'memory' && x.vault).map((x) => x.vault);
  const ob = catalog.OBSIDIAN;
  const obsidianHere = result.platform === 'darwin' && (fs.existsSync(catalog.appPath(ob, { home: result.home })) || !!catalog.adminCopy(ob, { home: result.home }));
  for (const v of vaults) {
    push(obsidianHere ? `Open the wiki vault ${v} in Obsidian once (Open folder as vault) to read what your agents remember.`
      : `Obsidian is where you read the wiki vault ${v}: download it from ${ob.page}, then open the vault in it (Open folder as vault).`);
  }
  // Obsidian's guide names a vault to open only where one exists after the run (round 6, P1).
  for (const pr of installed) {
    if (pr.id !== catalog.OBSIDIAN.id) push(pr.guide);
    else if (!vaults.length) push(memory.configOf(result.home) ? pr.guide : pr.guideNoVault);
  }
  // The wiki memory's skills and SessionStart hook load at session start too (PC-178).
  if (result.actions.some((a) => (a.kind === 'update' && a.outcome === 'done' && /[1-9]\d* change/.test(a.detail)) || (a.kind === 'memory' && a.outcome === 'done')) || installed.length) {
    push('Restart your coding agents: skills and MCP servers load when a session starts.');
  }
  return steps;
}

function finish(result, home, checks) {
  // A damaged signature is never muted by leaving the part out: it fails the run whatever it covered.
  const counted = checks.filter((c) => !(/^memory\./.test(c.id) && !/\.signature$/.test(c.id) && (result.leftOut || []).includes(c.product)));
  result.ok = !result.actions.some((a) => a.outcome === 'failed') && D.summarise(counted).fail === 0;
  if (!result.after) result.after = { checks, summary: D.summarise(checks) };
  // Stamped after the after-check: the update inside this run set installedAt earlier, and the
  // session hook ignores a result older than the installed release.
  // The session-start line reads what the run covered (round 6, R6): a part the run left out does not mark it.
  if (!result.planOnly) D.save(home, { at: new Date().toISOString(), checks: counted, summary: D.summarise(counted) });
  return result;
}

// The exit code of a setup or doctor --fix run. A plan exits 0 (nothing was agreed, nothing ran);
// a declined run (PC-91) is not a plan but the person's answer, so it exits by its checks like any
// run that changed nothing (PC-93): 1 when a check still fails, with or without a named train.
const exitCode = (r) => (r.planOnly && !r.declined ? 0 : r.ok ? 0 : 1);

// The install offers a run leaves out, by app name: what the plan would leave, what a run that asked
// left untaken, what a run that asked nothing skipped (PC-105: one rule for the three).
const appsLeft = (items) => items.filter((i) => offer(i) && !i.selected && !i.blocked).map(itemName);

const were = (names) => `${names.join(' and ')} ${names.length > 1 ? 'were' : 'was'}`;
const declined = (r, a) => (r.notTaken
  ? `You declined every other offer, and ${were(r.notTaken)} not installed; nothing was changed.${r.blocked ? ` ${blockedToo(r.blocked)}` : ''}${stand(a)}`
  : `You declined every offer; nothing was changed.${r.blocked ? ` ${blockedToo(r.blocked)}` : ''}${stand(a)}`);
// PC-147: a declined run names the apps it never asked about, since their folder is not writable.
const blockedToo = (names) => `Not asked about: ${need(names)} a folder you can write; the steps below say which.`;
const notTaken = (names, a) => `Nothing was changed: ${were(names)} offered and not installed.${stand(a)}`;
const skipped = (names, a) => `Nothing was changed: ${were(names)} not installed (see your steps below).${stand(a)}`;
const wouldSkip = (names, a) => `Nothing would change: ${names.join(' and ')} would not be installed (see the plan below).${stand(a)}`;
// The problems doctor marked blocked whose app has no blocked plan item, once per app and fix.
const blockedWithoutItem = (r) => r.before.checks.filter((c, k, all) => c.blocked && c.product && c.fix && (c.state === 'fail' || c.state === 'warn')
  && !r.plan.some((i) => i.blocked && i.product === c.product)
  && all.findIndex((d) => d.blocked && d.product === c.product && d.fix === c.fix && (d.state === 'fail' || d.state === 'warn')) === k);
const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]);
const need = (names) => `${list(names)} ${names.length > 1 ? 'need' : 'needs'}`;
// PC-147: apps whose folder this user cannot write, in a plan that changes nothing and after a run that changed something.
const wouldBlock = (names, a) => `Nothing would change: ${need(names)} a folder you can write (see the plan below).${stand(a)}`;
const leftBlocked = (names) => `Not installed or replaced: ${need(names)} a folder you can write; the steps below say which.`;
// PC-104, PC-105: a headline that says nothing changed points at the checks below whenever one is
// still open (a FAIL or a WARN, the rows "Open now" and "Still open" list), and only then.
const stand = (a) => (a.fail || a.warn ? ' The checks below still stand.' : '');
// PC-105: a plan's train is one of its lines; forgetting it (`--train none`) names no train.
// PC-119: a command rule as the plan and the question show it: the rule, what it allows, and who declared it.
// PC-125: a ledger that cannot be written is named on the step that added the rules, which still stand.
function ledgerNote(write) {
  try { write(); return ''; } catch (error) { return `; the permissions ledger was not updated (${error.message})`; }
}
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
    // PC-121: a plan whose only asked step cannot run (settings it cannot read) is not "nothing to do".
    const asksFailing = !!(tools && tools.error && (tools.taken || (result.commands && result.commands.taken && result.commands.error)));
    lines.push('', todo.length || trainPlanned || toolsPlanned ? 'Plan (nothing was changed):'
      : result.declined ? declined(result, a) : leftApps.length ? wouldSkip(leftApps, a) : result.blocked ? wouldBlock(result.blocked, a)
        : asksFailing ? `Nothing was changed: the step you asked for cannot run until Claude Code's settings are fixed.${stand(a)}` : `Nothing to do.${stand(a)}`);
    // PC-94: a declined run lists no plan: the person answered it, and its headline points at the checks.
    if (!result.declined) for (const i of result.plan) lines.push(`  ${i.selected ? '•' : '–'} ${i.detail}${i.note ? ` (${i.note})` : ''}`);
    // PC-147: a blocked app the plan has no item for (an outdated copy in use, an app the run leaves out) is named under
    // the plan with doctor's fix, which names the folder.
    if (!result.declined) for (const c of blockedWithoutItem(result)) lines.push(`  – ${catalog.appById(c.product).name}: ${c.fix}`);
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
    lines.push('', result.declined ? declined(result, a)
      : result.blocked ? `Nothing was changed: ${need(result.blocked)} a folder you can write; the steps below say which.${stand(a)}`
        : result.notTaken ? notTaken(result.notTaken, a)
      : result.skipped ? skipped(result.skipped, a)
        // PC-117: the tool rules it can add are not in place while they are still offered.
        : (tools && (tools.rules.length || tools.error)) || cmds ? `Everything else this command can set up is in place; nothing was changed.${stand(a)}`
          : `Everything this command can set up is in place; nothing was changed.${stand(a)}`);
  } else {
    lines.push('', 'Done:');
    for (const x of result.actions) lines.push(`  ${x.outcome === 'failed' ? 'FAILED' : 'done  '} ${x.detail}${x.error ? `\n         ${x.error}` : ''}`);
    if (result.blocked) lines.push('', leftBlocked(result.blocked));
  }
  // PC-117: a run that left the tool rules out says how to add them; settings it cannot read are named.
  if (tools && tools.error) {
    lines.push('', `Claude Code's settings were not changed: ${tools.error}`);
    const failing = [tools.taken && '--allow-tools', result.commands && result.commands.taken && result.commands.error && '--allow-commands'].filter(Boolean);
    if (failing.length && result.planOnly) lines.push(`A run with ${failing.join(' or ')} fails until that is fixed.`);
  }
  // PC-133: rules the person removed are not added back by setup; one line names them and how to add one back.
  if (result.keptOut && result.keptOut.length) {
    const names = result.keptOut.map((k) => permissions.shown(k.rule));
    lines.push('', `Left out, because you removed ${names.length === 1 ? 'it' : 'them'} with permissions remove: ${names.join(', ')}. To add one back: ${D.NPX} permissions allow <rule>`);
  }
  // A mode that does not ask (bypassPermissions, dontAsk, auto) makes "still asks" false: the hint names the mode instead.
  const quiet = ['bypassPermissions', 'dontAsk', 'auto'].includes(result.claudeMode) ? permissions.shown(result.claudeMode) : null;
  if (tools && tools.error) { /* named above */ }
  else if (tools && !tools.taken && (!result.planOnly || result.declined) && quiet) lines.push('', `Claude Code's allow rules do not include PassionCode's own tools; its default mode in your user settings, ${quiet}, decides what it does without them. To allow them: ${D.NPX} setup --allow-tools`);
  else if (tools && !tools.taken && (!result.planOnly || result.declined)) lines.push('', `Claude Code still asks before it uses PassionCode's own tools. To allow them: ${D.NPX} setup --allow-tools`);
  // PC-119: the same for the command rules, and every rule an agent declared that was not offered, with why.
  if (cmds && !cmds.taken && (!result.planOnly || result.declined) && quiet) {
    lines.push('', `Claude Code's allow rules do not include ${cmds.rules.map((r) => r.rule).join(', ')}; its default mode in your user settings, ${quiet}, decides what it does without them. To allow them: ${D.NPX} setup --allow-commands${cmds.rules.some((r) => wildcard(r.rule)) ? ' (a rule ending in * allows any arguments after its words)' : ''}`);
  } else if (cmds && !cmds.taken && (!result.planOnly || result.declined)) {
    lines.push('', `Claude Code still asks before it runs ${cmds.rules.map((r) => r.rule).join(', ')}. To allow them: ${D.NPX} setup --allow-commands${cmds.rules.some((r) => wildcard(r.rule)) ? ' (a rule ending in * allows any arguments after its words)' : ''}`);
  }
  const refused = (result.commands && result.commands.refused) || [];
  if (refused.length) lines.push('', 'Rules declared on this machine and not offered as declared:', ...refused.map((x) => `  ${permissions.shown(x)}`));
  // Before → after, by area, and every check whose state moved.
  const areas = ['prerequisites', 'skills', 'apps', 'memory', 'mcp', 'services'];
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
  lines.push('', single ? `${a.fail ? `${a.fail} problem(s)` : 'No problems'}${warned}. Check again any time: ${D.NPX} doctor`
    : `${a.fail ? `${a.fail} problem(s) remain` : 'No problems remain'} (before: ${b.fail})${warned}. Check again any time: ${D.NPX} doctor`);
  return lines.join('\n');
}

module.exports = { setup, plan, render, exitCode, humanSteps };
