'use strict';
/**
 * Exercise: implement a B+ tree ordered index for numeric keys.
 * Internal nodes hold separators; linked leaves hold all key/value records.
 * Support insertion, update, lookup, deletion with borrow/merge, inclusive
 * range scans, and full structural invariant validation.
 * Run: node 16-b-plus-tree-index.js
 */
const assert = require('node:assert/strict');
function lowerBound(a,x){let l=0,h=a.length;while(l<h){const m=(l+h)>>>1;if(a[m]<x)l=m+1;else h=m;}return l;}
function upperBound(a,x){let l=0,h=a.length;while(l<h){const m=(l+h)>>>1;if(a[m]<=x)l=m+1;else h=m;}return l;}
class LeafNode{constructor(){this.leaf=true;this.keys=[];this.values=[];this.next=null;this.parent=null;}}
class InternalNode{constructor(children=[]){this.leaf=false;this.keys=[];this.children=children;this.parent=null;}}
class BPlusTree{
  constructor(order=4){if(!Number.isSafeInteger(order)||order<3)throw new RangeError('order must be an integer of at least 3');this.order=order;this.minLeafKeys=Math.ceil((order-1)/2);this.minChildren=Math.ceil(order/2);this.root=new LeafNode();this.size=0;}
  _assertKey(k){if(typeof k!=='number'||!Number.isFinite(k))throw new TypeError('keys must be finite numbers');}
  _findLeaf(k){let n=this.root;while(!n.leaf)n=n.children[upperBound(n.keys,k)];return n;}
  _minKey(n){while(!n.leaf)n=n.children[0];if(!n.keys.length)throw new Error('empty leaf cannot be a separator source');return n.keys[0];}
  _refresh(n){if(!n.leaf)n.keys=n.children.slice(1).map(c=>this._minKey(c));}
  _refreshUp(n){while(n){this._refresh(n);n=n.parent;}}
  get(k){this._assertKey(k);const l=this._findLeaf(k),i=lowerBound(l.keys,k);return i<l.keys.length&&l.keys[i]===k?{found:true,value:l.values[i]}:{found:false,value:undefined};}
  has(k){return this.get(k).found;}
  set(k,v){this._assertKey(k);const l=this._findLeaf(k),i=lowerBound(l.keys,k);if(l.keys[i]===k){l.values[i]=v;return false;}l.keys.splice(i,0,k);l.values.splice(i,0,v);this.size++;if(l.keys.length>=this.order)this._splitLeaf(l);else this._refreshUp(l.parent);return true;}
  _splitLeaf(left){const at=Math.ceil(left.keys.length/2),right=new LeafNode();right.keys=left.keys.splice(at);right.values=left.values.splice(at);right.next=left.next;left.next=right;right.parent=left.parent;this._insertRightSibling(left,right);}
  _insertRightSibling(left,right){const p=left.parent;if(!p){const root=new InternalNode([left,right]);left.parent=root;right.parent=root;this._refresh(root);this.root=root;return;}const i=p.children.indexOf(left);if(i<0)throw new Error('parent does not contain child');p.children.splice(i+1,0,right);right.parent=p;this._refresh(p);if(p.children.length>this.order)this._splitInternal(p);else this._refreshUp(p.parent);}
  _splitInternal(left){const at=Math.ceil(left.children.length/2),right=new InternalNode(left.children.splice(at));for(const c of right.children)c.parent=right;this._refresh(left);this._refresh(right);right.parent=left.parent;this._insertRightSibling(left,right);}
  delete(k){this._assertKey(k);const l=this._findLeaf(k),i=lowerBound(l.keys,k);if(i===l.keys.length||l.keys[i]!==k)return false;l.keys.splice(i,1);l.values.splice(i,1);this.size--;if(l===this.root)return true;if(l.keys.length>=this.minLeafKeys)this._refreshUp(l.parent);else this._rebalanceLeaf(l);return true;}
  _rebalanceLeaf(l){const p=l.parent,i=p.children.indexOf(l),left=i>0?p.children[i-1]:null,right=i+1<p.children.length?p.children[i+1]:null;
    if(left&&left.keys.length>this.minLeafKeys){l.keys.unshift(left.keys.pop());l.values.unshift(left.values.pop());this._refreshUp(p);return;}
    if(right&&right.keys.length>this.minLeafKeys){l.keys.push(right.keys.shift());l.values.push(right.values.shift());this._refreshUp(p);return;}
    if(left){left.keys.push(...l.keys);left.values.push(...l.values);left.next=l.next;p.children.splice(i,1);}
    else if(right){l.keys.push(...right.keys);l.values.push(...right.values);l.next=right.next;p.children.splice(i+1,1);}
    else throw new Error('non-root leaf has no sibling');this._rebalanceInternal(p);
  }
  _rebalanceInternal(n){
    if(n===this.root){if(n.children.length===1){this.root=n.children[0];this.root.parent=null;}else this._refresh(n);return;}
    if(n.children.length>=this.minChildren){this._refreshUp(n);return;}
    const p=n.parent,i=p.children.indexOf(n),left=i>0?p.children[i-1]:null,right=i+1<p.children.length?p.children[i+1]:null;
    if(left&&left.children.length>this.minChildren){const c=left.children.pop();n.children.unshift(c);c.parent=n;this._refresh(left);this._refresh(n);this._refreshUp(p);return;}
    if(right&&right.children.length>this.minChildren){const c=right.children.shift();n.children.push(c);c.parent=n;this._refresh(right);this._refresh(n);this._refreshUp(p);return;}
    if(left){for(const c of n.children){c.parent=left;left.children.push(c);}p.children.splice(i,1);this._refresh(left);}
    else if(right){for(const c of right.children){c.parent=n;n.children.push(c);}p.children.splice(i+1,1);this._refresh(n);}
    else throw new Error('underfull internal node has no sibling');this._rebalanceInternal(p);
  }
  range(start,end){this._assertKey(start);this._assertKey(end);if(start>end)return [];const out=[];let l=this._findLeaf(start),i=lowerBound(l.keys,start);while(l){for(;i<l.keys.length;i++){const k=l.keys[i];if(k>end)return out;out.push([k,l.values[i]]);}l=l.next;i=0;}return out;}
  entries(){return this.range(-Number.MAX_VALUE,Number.MAX_VALUE);}
  validate(){const leaves=[],keys=[];let leafDepth=null;
    const visit=(n,d,root)=>{if(n.leaf){if(!root&&n.keys.length<this.minLeafKeys)throw new Error('leaf underflow');if(n.keys.length>this.order-1||n.keys.length!==n.values.length)throw new Error('invalid leaf capacity');for(let i=1;i<n.keys.length;i++)if(n.keys[i-1]>=n.keys[i])throw new Error('leaf keys not sorted');if(leafDepth===null)leafDepth=d;if(leafDepth!==d)throw new Error('unequal leaf depths');leaves.push(n);keys.push(...n.keys);return;}
      if(n.children.length!==n.keys.length+1)throw new Error('separator/child count mismatch: '+n.children.length+'/'+n.keys.length);if(n.children.length>this.order||(root?n.children.length<2:n.children.length<this.minChildren))throw new Error('invalid internal capacity');
      for(let i=0;i<n.children.length;i++){const c=n.children[i];if(c.parent!==n)throw new Error('broken parent pointer');if(i>0&&n.keys[i-1]!==this._minKey(c))throw new Error('incorrect separator');visit(c,d+1,false);}for(let i=1;i<n.keys.length;i++)if(n.keys[i-1]>=n.keys[i])throw new Error('internal keys not sorted');};
    if(this.root.parent!==null)throw new Error('root has parent');visit(this.root,0,true);for(let i=0;i<leaves.length;i++)if(leaves[i].next!==(leaves[i+1]||null))throw new Error('broken leaf chain');if(keys.length!==this.size)throw new Error('incorrect size');for(let i=1;i<keys.length;i++)if(keys[i-1]>=keys[i])throw new Error('global order violated');return true;}
}
function runTests(){
  const tree=new BPlusTree(4),ref=new Map();for(let i=0;i<100;i++){tree.set(i,'v'+i);ref.set(i,'v'+i);}tree.validate();assert.equal(tree.size,100);
  assert.deepEqual(tree.range(17,23),Array.from({length:7},(_,i)=>[i+17,'v'+(i+17)]));assert.equal(tree.get(50).value,'v50');assert.equal(tree.set(50,'updated'),false);ref.set(50,'updated');assert.equal(tree.get(50).value,'updated');
  let seed=0x12345678;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/0x100000000);
  for(let s=0;s<1800;s++){const k=Math.floor(rnd()*240)-70;if(rnd()<0.57){const v='step-'+s,added=!ref.has(k);assert.equal(tree.set(k,v),added);ref.set(k,v);}else assert.equal(tree.delete(k),ref.delete(k));assert.equal(tree.validate(),true);assert.equal(tree.size,ref.size);for(let p=0;p<3;p++){const q=Math.floor(rnd()*240)-70,a=tree.get(q);assert.equal(a.found,ref.has(q));if(a.found)assert.equal(a.value,ref.get(q));}}
  const expected=[...ref.entries()].sort((a,b)=>a[0]-b[0]);assert.deepEqual(tree.entries(),expected);assert.deepEqual(tree.range(10,30),expected.filter(([k])=>k>=10&&k<=30));for(const [k] of expected)assert.equal(tree.delete(k),true);assert.equal(tree.size,0);assert.equal(tree.validate(),true);assert.deepEqual(tree.entries(),[]);
}
runTests();
module.exports={BPlusTree};
