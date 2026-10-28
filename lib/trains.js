'use strict';
/**
 * Release trains (PC-89, organization R1 SD-4 O-2): one set of pinned app versions that every
 * machine of an organization installs, instead of each app's latest release. A train is a file in
 * `trains/<id>.json` shipped with the launcher; the skills are pinned by the launcher release itself
 * (`family.json`). The train's record (who pins what, and when) lives in fabric-workspace.
 */
const fs = require('fs');
const path = require('path');
const catalog = require('./catalog');

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const dir = () => process.env.PASSIONCODE_TRAINS || path.join(__dirname, '..', 'trains');

/** The train named `id`, validated, or an Error saying why it cannot be used. */
function load(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`"${id}" is not a release train name`);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(dir(), `${id}.json`), 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`no release train "${id}" in this launcher (known: ${list().join(', ') || 'none'})`);
    throw new Error(`release train "${id}" cannot be read: ${error.message}`);
  }
  if (doc.train !== id) throw new Error(`release train file ${id}.json names "${doc.train}"`);
  const apps = doc.apps && typeof doc.apps === 'object' ? doc.apps : null;
  if (!apps || !Object.keys(apps).length) throw new Error(`release train "${id}" pins no app`);
  for (const [app, version] of Object.entries(apps)) {
    if (!catalog.byId(app)) throw new Error(`release train "${id}" pins an unknown app "${app}"`);
    if (typeof version !== 'string' || !VERSION.test(version)) throw new Error(`release train "${id}" pins ${app} at "${version}", not a version`);
  }
  return { id, title: doc.title || id, pinned: doc.pinned || null, record: doc.record || null, apps: { ...apps } };
}

function list() {
  try { return fs.readdirSync(dir()).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).sort(); } catch (_) { return []; }
}

module.exports = { load, list };
