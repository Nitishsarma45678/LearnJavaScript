'use strict';

// Exercise: implement Morris inorder and preorder traversals. They use temporary
// predecessor threads to achieve O(1) auxiliary space and must restore every
// modified pointer before returning.

function morrisInorder(root) {
  const result = [];
  let current = root;
  while (current) {
    if (!current.left) {
      result.push(current.value);
      current = current.right;
    } else {
      let predecessor = current.left;
      while (predecessor.right && predecessor.right !== current) predecessor = predecessor.right;
      if (!predecessor.right) {
        predecessor.right = current;
        current = current.left;
      } else {
        predecessor.right = null;
        result.push(current.value);
        current = current.right;
      }
    }
  }
  return result;
}

function morrisPreorder(root) {
  const result = [];
  let current = root;
  while (current) {
    if (!current.left) {
      result.push(current.value);
      current = current.right;
    } else {
      let predecessor = current.left;
      while (predecessor.right && predecessor.right !== current) predecessor = predecessor.right;
      if (!predecessor.right) {
        result.push(current.value);
        predecessor.right = current;
        current = current.left;
      } else {
        predecessor.right = null;
        current = current.right;
      }
    }
  }
  return result;
}

function node(value, left = null, right = null) {
  return { value, left, right };
}

const assert = require('node:assert/strict');
const root = node(4,
  node(2, node(1), node(3)),
  node(6, node(5), node(7))
);
const originalLinks = new Map();
(function capture(current) {
  if (!current) return;
  originalLinks.set(current, [current.left, current.right]);
  capture(current.left);
  capture(current.right);
})(root);
assert.deepEqual(morrisInorder(root), [1, 2, 3, 4, 5, 6, 7]);
assert.deepEqual(morrisPreorder(root), [4, 2, 1, 3, 6, 5, 7]);
for (const [current, [left, right]] of originalLinks) {
  assert.equal(current.left, left);
  assert.equal(current.right, right, 'temporary thread must be removed');
}
assert.deepEqual(morrisInorder(null), []);
console.log('Morris traversal tests passed');

module.exports = { morrisInorder, morrisPreorder, node };
