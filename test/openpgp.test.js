'use strict';
// The release signature check: SHA256SUMS.asc is verified against the organisation's release key,
// bundled with the launcher and pinned by fingerprint, with no gpg on the machine.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const pgp = require('../lib/openpgp');

const FIX = path.join(__dirname, 'fixtures/release');
const SUMS = fs.readFileSync(path.join(FIX, 'SHA256SUMS')); // Fabric Dashboards v0.7.7, as published
const SIG = fs.readFileSync(path.join(FIX, 'SHA256SUMS.asc'), 'utf8');
const KEY = fs.readFileSync(path.join(__dirname, '../lib/release-key.asc'), 'utf8');

test('the bundled key is the organisation release key, pinned by fingerprint', () => {
  const key = pgp.readPublicKey(KEY);
  assert.equal(key.fingerprint, '63B30DC324BD697487AA31944FAFB8AEC803B6A7');
  assert.equal(pgp.RELEASE_KEY_FINGERPRINT, key.fingerprint);
  assert.equal(key.expiresAt.toISOString().slice(0, 10), '2029-10-02', 'the self-signature sets a three-year expiry');
});

test('a published SHA256SUMS verifies against its SHA256SUMS.asc', () => {
  const r = pgp.verifyDetached(SUMS, SIG);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.fingerprint, '63B30DC324BD697487AA31944FAFB8AEC803B6A7');
  assert.equal(r.createdAt.toISOString().slice(0, 10), '2026-10-12');
});

test('one changed byte in SHA256SUMS fails the signature', () => {
  const tampered = Buffer.from(SUMS);
  tampered[10] = tampered[10] === 0x30 ? 0x31 : 0x30;
  const r = pgp.verifyDetached(tampered, SIG);
  assert.equal(r.ok, false);
  assert.match(r.reason, /signature/);
});

test('a damaged armour is refused, not crashed on', () => {
  assert.equal(pgp.verifyDetached(SUMS, 'not a signature').ok, false);
  assert.equal(pgp.verifyDetached(SUMS, SIG.replace('iHUE', 'iHUF')).ok, false);
});

// A valid OpenPGP signature made by ANOTHER Ed25519 key: correct format, wrong signer.
function foreignSignature(data) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const oid = Buffer.from('2b06010401da470f01', 'hex');
  const keyBody = Buffer.concat([Buffer.from([4]), Buffer.alloc(4), Buffer.from([22, oid.length]), oid, Buffer.from([0x01, 0x07, 0x40]), raw]);
  const fpr = crypto.createHash('sha1').update(Buffer.concat([Buffer.from([0x99, keyBody.length >> 8, keyBody.length & 255]), keyBody])).digest();
  const created = Buffer.alloc(4); created.writeUInt32BE(Math.floor(Date.now() / 1000));
  const hashed = Buffer.concat([Buffer.from([22, 33, 4]), fpr, Buffer.from([5, 2]), created]);
  const head = Buffer.concat([Buffer.from([4, 0, 22, 10, hashed.length >> 8, hashed.length & 255]), hashed]);
  const trailer = Buffer.concat([Buffer.from([4, 0xff]), Buffer.from([0, 0, head.length >> 8, head.length & 255])]);
  const digest = crypto.createHash('sha512').update(Buffer.concat([data, head, trailer])).digest();
  const sig = crypto.sign(null, digest, privateKey);
  const mpi = (b) => Buffer.concat([Buffer.from([1, 0]), b]);
  const body = Buffer.concat([head, Buffer.from([0, 0]), digest.subarray(0, 2), mpi(sig.subarray(0, 32)), mpi(sig.subarray(32))]);
  const packet = Buffer.concat([Buffer.from([0xc2, body.length]), body]);
  return `-----BEGIN PGP SIGNATURE-----\n\n${packet.toString('base64')}\n-----END PGP SIGNATURE-----\n`;
}

test('a well-formed signature by any other key is refused and names the signer', () => {
  const r = pgp.verifyDetached(SUMS, foreignSignature(SUMS));
  assert.equal(r.ok, false);
  assert.match(r.reason, /not the PassionCode\.ai release key/);
});

test('the sums parser reads names and refuses a malformed line', () => {
  const sums = pgp.parseSums(SUMS.toString('utf8'));
  assert.equal(sums.get('Fabric-Dashboards-0.7.7-mac.zip'), '3a541712edae0bee6ad1eaa858adf9f9acdc73f8ecadfbe887c2ff717f440094');
  assert.throws(() => pgp.parseSums('zz  file\n'), /SHA256SUMS line 1/);
});
