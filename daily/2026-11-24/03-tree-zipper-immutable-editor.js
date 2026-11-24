'use strict';

const assert = require('node:assert/strict');

function node(value, children = []) {
  return Object.freeze({ value, children: Object.freeze(children.slice()) });
}

class TreeZipper {
  constructor(focus, crumbs = []) {
    this.focus = focus;
    this.crumbs = crumbs;
  }

  down(index = 0) {
    if (!Number.isInteger(index) || index < 0 || index >= this.focus.children.length) {
      throw new RangeError('Child index out of range');
    }
    const children = this.focus.children;
    return new TreeZipper(children[index], this.crumbs.concat({
      value: this.focus.value,
      left: children.slice(0, index),
      right: children.slice(index + 1)
    }));
  }

  up() {
    if (!this.crumbs.length) return null;
    const crumb = this.crumbs[this.crumbs.length - 1];
    const parent = node(crumb.value, crumb.left.concat(this.focus, crumb.right));
    return new TreeZipper(parent, this.crumbs.slice(0, -1));
  }

  left() {
    if (!this.crumbs.length) return null;
    const crumb = this.crumbs[this.crumbs.length - 1];
    if (!crumb.left.length) return null;
    const previous = crumb.left[crumb.left.length - 1];
    const nextCrumb = { value: crumb.value, left: crumb.left.slice(0, -1), right: [this.focus].concat(crumb.right) };
    return new TreeZipper(previous, this.crumbs.slice(0, -1).concat(nextCrumb));
  }

  right() {
    if (!this.crumbs.length) return null;
    const crumb = this.crumbs[this.crumbs.length - 1];
    if (!crumb.right.length) return null;
    const next = crumb.right[0];
    const nextCrumb = { value: crumb.value, left: crumb.left.concat(this.focus), right: crumb.right.slice(1) };
    return new TreeZipper(next, this.crumbs.slice(0, -1).concat(nextCrumb));
  }

  replaceValue(value) {
    return new TreeZipper(node(value, this.focus.children), this.crumbs);
  }

  insertChild(index, child) {
    if (!Number.isInteger(index) || index < 0 || index > this.focus.children.length) {
      throw new RangeError('Insertion index out of range');
    }
    const children = this.focus.children.slice();
    children.splice(index, 0, child);
    return new TreeZipper(node(this.focus.value, children), this.crumbs);
  }

  toTree() {
    let zipper = this;
    while (zipper.crumbs.length) zipper = zipper.up();
    return zipper.focus;
  }
}

const original = node('root', [node('left', [node('left.leaf')]), node('middle'), node('right')]);
const edited = new TreeZipper(original).down(1).replaceValue('center').up()
  .insertChild(1, node('inserted')).toTree();
assert.equal(original.children[1].value, 'middle');
assert.deepEqual(edited.children.map(child => child.value), ['left', 'inserted', 'center', 'right']);
const leftLeaf = new TreeZipper(original).down(0).down(0);
assert.equal(leftLeaf.left(), null);
assert.equal(leftLeaf.up().focus.value, 'left');
assert.equal(new TreeZipper(original).down(0).right().focus.value, 'middle');
assert.throws(() => new TreeZipper(original).down(9), RangeError);
console.log('Tree-zipper examples passed.');

module.exports = { node, TreeZipper };
