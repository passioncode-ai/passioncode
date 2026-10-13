'use strict';
// A throwaway Ed25519 OpenPGP key for tests: its armoured public key and detached signatures in the
// format the PassionCode.ai release workflow publishes (v4, EdDSA, SHA-512, binary document).
const crypto = require('node:crypto');

const OID = Buffer.from('2b06010401da470f01', 'hex');
const armour = (kind, packet) => `-----BEGIN PGP ${kind}-----\n\n${packet.toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END PGP ${kind}-----\n`;
const header = (tag, body) => Buffer.concat([Buffer.from([0xc0 | tag, body.length]), body]);

function makeKey() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const created = Buffer.alloc(4); created.writeUInt32BE(Math.floor(Date.now() / 1000) - 3600);
  const keyBody = Buffer.concat([Buffer.from([4]), created, Buffer.from([22, OID.length]), OID, Buffer.from([0x01, 0x07, 0x40]), raw]);
  const fpr = crypto.createHash('sha1').update(Buffer.concat([Buffer.from([0x99, keyBody.length >> 8, keyBody.length & 255]), keyBody])).digest();
  const sign = (data) => {
    const when = Buffer.alloc(4); when.writeUInt32BE(Math.floor(Date.now() / 1000));
    const hashed = Buffer.concat([Buffer.from([22, 33, 4]), fpr, Buffer.from([5, 2]), when]);
    const head = Buffer.concat([Buffer.from([4, 0, 22, 10, hashed.length >> 8, hashed.length & 255]), hashed]);
    const trailer = Buffer.concat([Buffer.from([4, 0xff, 0, 0, head.length >> 8, head.length & 255])]);
    const digest = crypto.createHash('sha512').update(Buffer.concat([Buffer.from(data), head, trailer])).digest();
    const sig = crypto.sign(null, digest, privateKey);
    const mpi = (b) => Buffer.concat([Buffer.from([1, 0]), b]);
    return armour('SIGNATURE', header(2, Buffer.concat([head, Buffer.from([0, 0]), digest.subarray(0, 2), mpi(sig.subarray(0, 32)), mpi(sig.subarray(32))])));
  };
  return { publicArmour: armour('PUBLIC KEY BLOCK', header(6, keyBody)), fingerprint: fpr.toString('hex').toUpperCase(), sign };
}

module.exports = { makeKey };
