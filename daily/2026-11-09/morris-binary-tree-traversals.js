/**
 * Morris inorder, preorder, and postorder traversal.
 *
 * The algorithms temporarily thread predecessor pointers and restore every
 * pointer before returning. They use O(1) auxiliary space (excluding output).
 * Input must be a proper binary tree with left/right links and a value field.
 * Do not inspect or mutate the tree concurrently while a traversal is running.
 *
 * Run: node morris-binary-tree-traversals.js
 */
"use strict";

function morrisInorder(root) {
  const output = [];
  let current = root;
  while (current) {
    if (!current.left) {
      output.push(current.value);
      current = current.right;
      continue;
    }
    let predecessor = current.left;
    while (predecessor.right && predecessor.right !== current) {
      predecessor = predecessor.right;
    }
    if (!predecessor.right) {
      predecessor.right = current;
      current = current.left;
    } else {
      predecessor.right = null;
      output.push(current.value);
      current = current.right;
    }
  }
  return output;
}

function morrisPreorder(root) {
  const output = [];
  let current = root;
  while (current) {
    if (!current.left) {
      output.push(current.value);
      current = current.right;
      continue;
    }
    let predecessor = current.left;
    while (predecessor.right && predecessor.right !== current) {
      predecessor = predecessor.right;
    }
    if (!predecessor.right) {
      output.push(current.value);
      predecessor.right = current;
      current = current.left;
    } else {
      predecessor.right = null;
      current = current.right;
    }
  }
  return output;
}

function reverseRightBoundary(from, to) {
  if (from === to) return;
  let previous = from;
  let current = from.right;
  while (true) {
    const next = current.right;
    current.right = previous;
    previous = current;
    if (previous === to) break;
    current = next;
  }
}

function appendReversedBoundary(from, to, output) {
  reverseRightBoundary(from, to);
  let current = to;
  while (true) {
    output.push(current.value);
    if (current === from) break;
    current = current.right;
  }
  reverseRightBoundary(to, from);
}

function morrisPostorder(root) {
  const output = [];
  const dummy = { value: undefined, left: root, right: null };
  let current = dummy;
  while (current) {
    if (!current.left) {
      current = current.right;
      continue;
    }
    let predecessor = current.left;
    while (predecessor.right && predecessor.right !== current) {
      predecessor = predecessor.right;
    }
    if (!predecessor.right) {
      predecessor.right = current;
      current = current.left;
    } else {
      appendReversedBoundary(current.left, predecessor, output);
      predecessor.right = null;
      current = current.right;
    }
  }
  return output;
}

function snapshotLinks(root) {
  const links = [];
  const stack = root ? [root] : [];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (seen.has(node)) throw new TypeError("Input contains a cycle or shared child");
    seen.add(node);
    links.push([node, node.left, node.right]);
    if (node.right) stack.push(node.right);
    if (node.left) stack.push(node.left);
  }
  return links;
}

function assertLinksRestored(links, assert) {
  for (const [node, left, right] of links) {
    assert.strictEqual(node.left, left);
    assert.strictEqual(node.right, right);
  }
}

function recursiveTraversals(root) {
  const inorder = [];
  const preorder = [];
  const postorder = [];
  function visit(node) {
    if (!node) return;
    preorder.push(node.value);
    visit(node.left);
    inorder.push(node.value);
    visit(node.right);
    postorder.push(node.value);
  }
  visit(root);
  return { inorder, preorder, postorder };
}

function runTests() {
  const assert = require("node:assert/strict");
  const root = {
    value: 8,
    left: {
      value: 3,
      left: { value: 1, left: null, right: null },
      right: {
        value: 6,
        left: { value: 4, left: null, right: null },
        right: { value: 7, left: null, right: null }
      }
    },
    right: {
      value: 10,
      left: null,
      right: { value: 14, left: { value: 13, left: null, right: null }, right: null }
    }
  };
  const expected = recursiveTraversals(root);
  for (const [name, traversal] of [
    ["inorder", morrisInorder],
    ["preorder", morrisPreorder],
    ["postorder", morrisPostorder]
  ]) {
    const links = snapshotLinks(root);
    assert.deepEqual(traversal(root), expected[name]);
    assertLinksRestored(links, assert);
  }

  assert.deepEqual(morrisInorder(null), []);
  assert.deepEqual(morrisPreorder(null), []);
  assert.deepEqual(morrisPostorder(null), []);
  const single = { value: "only", left: null, right: null };
  assert.deepEqual(morrisPostorder(single), ["only"]);
  assert.deepEqual(morrisInorder(single), ["only"]);

  let seed = 0x13579bdf;
  const random = max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  let checks = 15;
  for (let trial = 0; trial < 120; trial++) {
    const nodes = Array.from({ length: 1 + random(35) }, (_, i) => ({
      value: random(9),
      left: null,
      right: null
    }));
    const available = [nodes[0]];
    for (let i = 1; i < nodes.length; i++) {
      while (true) {
        const parent = available[random(available.length)];
        const side = random(2) ? "left" : "right";
        if (!parent[side]) {
          parent[side] = nodes[i];
          if (!parent.left || !parent.right) available.push(parent);
          break;
        }
        if (parent.left && parent.right) {
          available.splice(available.indexOf(parent), 1);
        }
      }
    }
    const tree = nodes[0];
    const reference = recursiveTraversals(tree);
    for (const [name, traversal] of [
      ["inorder", morrisInorder],
      ["preorder", morrisPreorder],
      ["postorder", morrisPostorder]
    ]) {
      const links = snapshotLinks(tree);
      assert.deepEqual(traversal(tree), reference[name]);
      assertLinksRestored(links, assert);
      checks += 2;
    }
  }
  return { passed: checks, randomizedTrees: 120 };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runTests();
  console.log("Morris traversals: " + result.passed + " checks passed");
}
if (typeof module !== "undefined") {
  module.exports = {
    morrisInorder, morrisPreorder, morrisPostorder,
    snapshotLinks, recursiveTraversals, runTests
  };
}
