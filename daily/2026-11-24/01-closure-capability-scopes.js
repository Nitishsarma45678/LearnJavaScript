'use strict';

const assert = require('node:assert/strict');

function createCapabilityAuthority() {
  const records = new WeakMap();

  function active(token) {
    let record = records.get(token);
    if (!record) return false;
    while (record) {
      if (record.revoked) return false;
      record = record.parent ? records.get(record.parent) : null;
    }
    return true;
  }

  function issue(permissions, parent = null) {
    const rights = new Set(permissions);
    if (parent) {
      const parentRecord = records.get(parent);
      if (!parentRecord || !active(parent)) throw new Error('Inactive parent capability');
      for (const right of rights) {
        if (!parentRecord.rights.has(right)) throw new Error('Cannot amplify capabilities');
      }
    }
    const token = Object.freeze(Object.create(null));
    records.set(token, { rights, parent, revoked: false });
    return token;
  }

  function derive(parent, permissions) {
    if (!records.has(parent) || !active(parent)) throw new Error('Inactive parent capability');
    return issue(permissions, parent);
  }

  function revoke(token) {
    const record = records.get(token);
    if (!record || record.revoked) return false;
    record.revoked = true;
    return true;
  }

  function allows(token, permission) {
    const record = records.get(token);
    return !!record && active(token) && record.rights.has(permission);
  }

  function require(token, permission) {
    if (!allows(token, permission)) throw new Error('Permission denied: ' + permission);
  }

  return Object.freeze({ issue, derive, revoke, allows, require });
}

// Example: delegated capabilities cannot gain rights and parent revocation
// invalidates every capability derived from that parent.
const authority = createCapabilityAuthority();
const admin = authority.issue(['read', 'write', 'delete']);
const editor = authority.derive(admin, ['read', 'write']);
const viewer = authority.derive(editor, ['read']);

assert.equal(authority.allows(viewer, 'read'), true);
assert.equal(authority.allows(viewer, 'write'), false);
assert.throws(() => authority.derive(viewer, ['delete']), /amplify/);
authority.require(editor, 'write');
assert.equal(authority.revoke(editor), true);
assert.equal(authority.allows(editor, 'read'), false);
assert.equal(authority.allows(viewer, 'read'), false);
assert.equal(authority.allows(admin, 'delete'), true);
assert.throws(() => authority.require(viewer, 'read'), /Permission denied/);
console.log('Capability-scope examples passed.');

module.exports = { createCapabilityAuthority };
