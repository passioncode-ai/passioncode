'use strict';
/**
 * The one OpenPGP check the launcher needs: a detached v4 Ed25519 signature over SHA256SUMS,
 * made by the PassionCode.ai release key. Every product release publishes SHA256SUMS and
 * SHA256SUMS.asc (passioncode-ai/.github release-signing, `release-publish@v1`); the key is
 * bundled as lib/release-key.asc and pinned here by fingerprint, so no gpg and no keyserver are
 * involved and a key swapped in the package would not verify either.
 *
 * Scope on purpose: v4 packets, public-key algorithm 22 (EdDSA, curve Ed25519), hash SHA-256 or
 * SHA-512, signature type 0x00 (binary document). Anything else is refused, never guessed.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RELEASE_KEY_FINGERPRINT = '63B30DC324BD697487AA31944FAFB8AEC803B6A7';
const RELEASE_KEY_FILE = path.join(__dirname, 'release-key.asc');
const ED25519_OID = '2b06010401da470f01';
const HASHES = { 8: 'sha256', 10: 'sha512' };

function dearmor(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => /^-----BEGIN PGP (SIGNATURE|PUBLIC KEY BLOCK)-----$/.test(l));
  const end = lines.findIndex((l, i) => i > start && /^-----END PGP /.test(l));
  if (start < 0 || end < 0) throw new Error('no OpenPGP armour');
  let i = start + 1;
  while (i < end && lines[i].trim() !== '') i += 1; // armour headers
  const body = lines.slice(i + 1, end).filter((l) => !l.startsWith('=')).join('');
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) throw new Error('damaged OpenPGP armour');
  return Buffer.from(body, 'base64');
}

function packets(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const ctb = buf[i];
    if (!(ctb & 0x80)) throw new Error('not an OpenPGP packet');
    let tag, len, off;
    if (ctb & 0x40) {
      tag = ctb & 0x3f;
      const o = buf[i + 1];
      if (o < 192) { len = o; off = i + 2; }
      else if (o < 224) { len = ((o - 192) << 8) + buf[i + 2] + 192; off = i + 3; }
      else if (o === 255) { len = buf.readUInt32BE(i + 2); off = i + 6; }
      else throw new Error('partial-length packets are not supported');
    } else {
      tag = (ctb >> 2) & 0x0f;
      const t = ctb & 3;
      if (t === 0) { len = buf[i + 1]; off = i + 2; }
      else if (t === 1) { len = buf.readUInt16BE(i + 1); off = i + 3; }
      else if (t === 2) { len = buf.readUInt32BE(i + 1); off = i + 5; }
      else throw new Error('indeterminate-length packets are not supported');
    }
    if (off + len > buf.length) throw new Error('truncated OpenPGP packet');
    out.push({ tag, body: buf.subarray(off, off + len) });
    i = off + len;
  }
  return out;
}

function mpi(buf, at) {
  const bits = buf.readUInt16BE(at);
  const bytes = (bits + 7) >> 3;
  return { value: buf.subarray(at + 2, at + 2 + bytes), next: at + 2 + bytes };
}

function subpackets(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    let len = buf[i];
    let off = i + 1;
    if (len >= 192 && len < 255) { len = ((len - 192) << 8) + buf[i + 1] + 192; off = i + 2; }
    else if (len === 255) { len = buf.readUInt32BE(i + 1); off = i + 5; }
    out.push({ type: buf[off] & 0x7f, data: buf.subarray(off + 1, off + len) });
    i = off + len;
  }
  return out;
}

function parseSignature(body) {
  if (body[0] !== 4) throw new Error(`signature version ${body[0]} is not supported`);
  const type = body[1], algo = body[2], hash = body[3];
  const hashedLen = body.readUInt16BE(4);
  const hashed = body.subarray(6, 6 + hashedLen);
  const unhashedLen = body.readUInt16BE(6 + hashedLen);
  const unhashed = body.subarray(8 + hashedLen, 8 + hashedLen + unhashedLen);
  let at = 8 + hashedLen + unhashedLen;
  const left16 = body.subarray(at, at + 2); at += 2;
  const r = mpi(body, at); const s = mpi(body, r.next);
  const sub = [...subpackets(hashed), ...subpackets(unhashed)];
  const fprSub = sub.find((p) => p.type === 33);
  const created = subpackets(hashed).find((p) => p.type === 2);
  return {
    type, algo, hash, left16, r: r.value, s: s.value, hashedSub: subpackets(hashed),
    signed: body.subarray(0, 6 + hashedLen),
    issuer: fprSub ? fprSub.data.subarray(1).toString('hex').toUpperCase() : null,
    createdAt: created ? new Date(created.data.readUInt32BE(0) * 1000) : null,
  };
}

function pad32(b) { return b.length >= 32 ? b.subarray(b.length - 32) : Buffer.concat([Buffer.alloc(32 - b.length), b]); }

function sigDigest(sig, data) {
  const name = HASHES[sig.hash];
  if (!name) throw new Error(`hash algorithm ${sig.hash} is not supported`);
  const trailer = Buffer.alloc(6);
  trailer[0] = 4; trailer[1] = 0xff; trailer.writeUInt32BE(sig.signed.length, 2);
  return crypto.createHash(name).update(data).update(sig.signed).update(trailer).digest();
}

function edVerify(rawKey, digest, sig) {
  const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: rawKey.toString('base64url') }, format: 'jwk' });
  return crypto.verify(null, digest, key, Buffer.concat([pad32(sig.r), pad32(sig.s)]));
}

/** The primary key of an armoured public key block: fingerprint, raw Ed25519 point, expiry. */
function readPublicKey(armoured) {
  const list = packets(dearmor(armoured));
  const pk = list.find((p) => p.tag === 6);
  if (!pk) throw new Error('no public key packet');
  const b = pk.body;
  if (b[0] !== 4 || b[5] !== 22) throw new Error('the release key must be a v4 EdDSA key');
  const oidLen = b[6];
  if (b.subarray(7, 7 + oidLen).toString('hex') !== ED25519_OID) throw new Error('the release key must be on Ed25519');
  const point = mpi(b, 7 + oidLen).value;
  if (point[0] !== 0x40 || point.length !== 33) throw new Error('unexpected Ed25519 point encoding');
  const header = Buffer.from([0x99, b.length >> 8, b.length & 0xff]);
  const fingerprint = crypto.createHash('sha1').update(header).update(b).digest('hex').toUpperCase();
  const createdAt = new Date(b.readUInt32BE(1) * 1000);
  const raw = point.subarray(1);
  // The newest valid self-signature over the user id (types 0x10–0x13) carries the key's expiry.
  let expiresAt = null;
  const uidIndex = list.findIndex((p) => p.tag === 13);
  if (uidIndex >= 0) {
    const uid = list[uidIndex].body;
    for (const p of list.slice(uidIndex + 1)) {
      if (p.tag !== 2) { if (p.tag === 13 || p.tag === 14) break; continue; }
      const sig = parseSignature(p.body);
      if (sig.type < 0x10 || sig.type > 0x13 || sig.issuer !== fingerprint) continue;
      const uidHeader = Buffer.alloc(5); uidHeader[0] = 0xb4; uidHeader.writeUInt32BE(uid.length, 1);
      const signedData = Buffer.concat([header, b, uidHeader, uid]);
      if (!edVerify(raw, sigDigest(sig, signedData), sig)) continue;
      const exp = sig.hashedSub.find((s) => s.type === 9);
      expiresAt = exp ? new Date(createdAt.getTime() + exp.data.readUInt32BE(0) * 1000) : null;
    }
  }
  return { fingerprint, raw, createdAt, expiresAt };
}

let bundled = null;
/**
 * The trusted release key. PASSIONCODE_RELEASE_KEY (an armoured key file) replaces it for tests,
 * like the launcher's other PASSIONCODE_* overrides: trusted local configuration, not a sandbox;
 * setup and doctor name the override in their output whenever it is set.
 */
function releaseKey() {
  if (process.env.PASSIONCODE_RELEASE_KEY) return readPublicKey(fs.readFileSync(process.env.PASSIONCODE_RELEASE_KEY, 'utf8'));
  if (!bundled) {
    bundled = readPublicKey(fs.readFileSync(RELEASE_KEY_FILE, 'utf8'));
    if (bundled.fingerprint !== RELEASE_KEY_FINGERPRINT) throw new Error('the bundled release key does not match its pinned fingerprint');
  }
  return bundled;
}

/**
 * Verify `data` against an armoured detached signature by the PassionCode.ai release key.
 * Returns { ok, reason?, fingerprint?, createdAt? }; it never throws on bad input.
 */
function verifyDetached(data, armouredSignature, { key, now = new Date() } = {}) {
  try { key = key || releaseKey(); } catch (error) { return { ok: false, reason: `release key: ${error.message}` }; }
  let sig;
  try {
    const p = packets(dearmor(armouredSignature)).find((x) => x.tag === 2);
    if (!p) return { ok: false, reason: 'no signature packet in SHA256SUMS.asc' };
    sig = parseSignature(p.body);
  } catch (error) {
    return { ok: false, reason: `unreadable signature: ${error.message}` };
  }
  if (sig.type !== 0x00) return { ok: false, reason: `signature type ${sig.type} is not a document signature` };
  if (sig.algo !== 22) return { ok: false, reason: `signature algorithm ${sig.algo} is not EdDSA` };
  if (sig.issuer && sig.issuer !== key.fingerprint) {
    return { ok: false, reason: `signed by ${sig.issuer}, which is not the PassionCode.ai release key ${key.fingerprint}` };
  }
  let digest;
  try { digest = sigDigest(sig, data); } catch (error) { return { ok: false, reason: error.message }; }
  if (!digest.subarray(0, 2).equals(sig.left16)) return { ok: false, reason: 'the signature does not match SHA256SUMS (digest prefix differs)' };
  let good = false;
  try { good = edVerify(key.raw, digest, sig); } catch (_) { good = false; }
  if (!good) return { ok: false, reason: 'the signature does not match SHA256SUMS' };
  if (key.expiresAt && sig.createdAt && sig.createdAt > key.expiresAt) return { ok: false, reason: `signed after the release key expired (${key.expiresAt.toISOString()})` };
  if (sig.createdAt && sig.createdAt.getTime() > now.getTime() + 24 * 3600 * 1000) return { ok: false, reason: 'the signature is dated in the future' };
  return { ok: true, fingerprint: key.fingerprint, createdAt: sig.createdAt };
}

/** SHA256SUMS → Map(name → hex). A line that is not `<64 hex>  <name>` is an error, not skipped. */
function parseSums(text) {
  const map = new Map();
  String(text).split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trimEnd());
    if (!m) throw new Error(`SHA256SUMS line ${i + 1} is not "<sha256>  <file>"`);
    map.set(m[2], m[1]);
  });
  return map;
}

module.exports = { verifyDetached, readPublicKey, releaseKey, parseSums, RELEASE_KEY_FINGERPRINT };
