/**
 * LFU Cache with LRU Tie-Breaking and TTL
 * Frequency buckets are doubly linked lists; equal-frequency eviction is LRU.
 * A versioned min-heap tracks deadlines. The clock is injectable for testing.
 * get() promotes frequency; peek() does not. Expiry records are discarded lazily.
 * Run: node lfu-ttl-cache.js
 */
"use strict";
class DoublyLinkedList{
  constructor(){this.head={prev:null,next:null};this.tail={prev:this.head,next:null};this.head.next=this.tail;this.length=0;}
  append(node){node.prev=this.tail.prev;node.next=this.tail;this.tail.prev.next=node;this.tail.prev=node;this.length++;}
  remove(node){if(!node.prev||!node.next)throw new Error("Node is not linked");node.prev.next=node.next;node.next.prev=node.prev;node.prev=null;node.next=null;this.length--;}
  removeLeastRecent(){if(!this.length)return null;const node=this.head.next;this.remove(node);return node;}
}
class MinHeap{
  constructor(){this.items=[];}
  get size(){return this.items.length;}
  peek(){return this.items[0]||null;}
  push(item){
    const a=this.items;a.push(item);let i=a.length-1;
    while(i>0){const p=(i-1)>>1;if(a[p].expiresAt<=item.expiresAt)break;a[i]=a[p];i=p;}
    a[i]=item;
  }
  pop(){
    const a=this.items;if(!a.length)return null;const root=a[0],last=a.pop();
    if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;
      if(c+1<a.length&&a[c+1].expiresAt<a[c].expiresAt)c++;
      if(a[c].expiresAt>=last.expiresAt)break;a[i]=a[c];i=c;}a[i]=last;}
    return root;
  }
}
class LFUTTLCache{
  constructor(capacity,options={}){
    if(!Number.isSafeInteger(capacity)||capacity<0)throw new RangeError("Invalid capacity");
    this.capacity=capacity;this.now=options.now===undefined?()=>Date.now():options.now;
    if(typeof this.now!=="function")throw new TypeError("now must be a function");
    this.defaultTTL=options.defaultTTL===undefined?Infinity:options.defaultTTL;this._validateTTL(this.defaultTTL);
    this.nodes=new Map();this.buckets=new Map();this.expirations=new MinHeap();this.minFrequency=0;this.lastNow=-Infinity;
  }
  get size(){this._expire();return this.nodes.size;}
  _validateTTL(ttl){if(ttl!==Infinity&&(!Number.isFinite(ttl)||ttl<0))throw new RangeError("TTL must be non-negative or Infinity");}
  _time(){const t=this.now();if(!Number.isFinite(t))throw new TypeError("Clock must return a finite number");if(t<this.lastNow)throw new RangeError("Clock must be monotonic");this.lastNow=t;return t;}
  _bucket(freq){let b=this.buckets.get(freq);if(!b){b=new DoublyLinkedList();this.buckets.set(freq,b);}return b;}
  _unlink(node){const b=this.buckets.get(node.frequency);if(!b)throw new Error("Missing frequency bucket");b.remove(node);if(!b.length)this.buckets.delete(node.frequency);}
  _promote(node){
    const old=node.frequency;this._unlink(node);node.frequency++;this._bucket(node.frequency).append(node);
    if(old===this.minFrequency&&!this.buckets.has(old))this.minFrequency=node.frequency;
  }
  _remove(node){
    this._unlink(node);this.nodes.delete(node.key);
    if(!this.nodes.size)this.minFrequency=0;
    else if(!this.buckets.has(this.minFrequency))this.minFrequency=Math.min(...this.buckets.keys());
  }
  _expireAt(now){
    while(this.expirations.size&&this.expirations.peek().expiresAt<=now){
      const record=this.expirations.pop(),node=this.nodes.get(record.key);
      if(node&&node.version===record.version&&node.expiresAt===record.expiresAt)this._remove(node);
    }
  }
  _expire(){this._expireAt(this._time());}
  _schedule(node,ttl,now){
    node.version++;node.expiresAt=ttl===Infinity?Infinity:now+ttl;
    if(!Number.isFinite(node.expiresAt)&&node.expiresAt!==Infinity)throw new RangeError("TTL deadline overflow");
    if(node.expiresAt!==Infinity)this.expirations.push({key:node.key,version:node.version,expiresAt:node.expiresAt});
  }
  get(key){this._expire();const node=this.nodes.get(key);if(!node)return undefined;this._promote(node);return node.value;}
  peek(key){this._expire();const node=this.nodes.get(key);return node?node.value:undefined;}
  has(key){this._expire();return this.nodes.has(key);}
  set(key,value,options={}){
    const now=this._time();this._expireAt(now);
    const ttl=options.ttl===undefined?this.defaultTTL:options.ttl;this._validateTTL(ttl);
    if(ttl===0){const old=this.nodes.get(key);if(old)this._remove(old);return this;}
    let node=this.nodes.get(key);
    if(node){node.value=value;this._promote(node);this._schedule(node,ttl,now);return this;}
    if(this.capacity===0)return this;
    if(this.nodes.size>=this.capacity){
      const bucket=this.buckets.get(this.minFrequency);if(!bucket)throw new Error("LFU invariant violated");
      const victim=bucket.removeLeastRecent();this.nodes.delete(victim.key);if(!bucket.length)this.buckets.delete(this.minFrequency);
    }
    node={key,value,frequency:1,prev:null,next:null,version:0,expiresAt:Infinity};
    this.nodes.set(key,node);this._bucket(1).append(node);this.minFrequency=1;this._schedule(node,ttl,now);return this;
  }
  delete(key){this._expire();const node=this.nodes.get(key);if(!node)return false;this._remove(node);return true;}
  clear(){this.nodes.clear();this.buckets.clear();this.expirations=new MinHeap();this.minFrequency=0;}
}
function runTests(){
  const assert=require("node:assert/strict");let now=0;
  const cache=new LFUTTLCache(2,{now:()=>now});cache.set("a",1).set("b",2);
  assert.equal(cache.get("a"),1);cache.set("c",3);assert.equal(cache.has("b"),false);
  assert.equal(cache.peek("a"),1);assert.equal(cache.get("c"),3);cache.set("d",4);
  assert.equal(cache.has("a"),false,"LRU breaks a frequency tie");
  const timed=new LFUTTLCache(3,{now:()=>now,defaultTTL:50});
  timed.set("short","x",{ttl:10});timed.set("long","y",{ttl:30});now=11;
  assert.equal(timed.has("short"),false);assert.equal(timed.get("long"),"y");now=31;assert.equal(timed.size,0);
  const stale=new LFUTTLCache(2,{now:()=>now});stale.set("key","old",{ttl:5});now+=2;
  stale.set("key","new",{ttl:20});now+=4;assert.equal(stale.get("key"),"new");
  now+=17;assert.equal(stale.has("key"),false);
  const zero=new LFUTTLCache(0,{now:()=>now});zero.set("ignored",1);assert.equal(zero.size,0);
  const immediate=new LFUTTLCache(1,{now:()=>now});immediate.set("gone",1,{ttl:0});assert.equal(immediate.has("gone"),false);
  assert.equal(immediate.delete("missing"),false);immediate.set("undefined",undefined);
  assert.equal(immediate.has("undefined"),true);assert.equal(immediate.peek("undefined"),undefined);
  assert.equal(immediate.get("undefined"),undefined);immediate.clear();assert.equal(immediate.size,0);
  assert.throws(()=>new LFUTTLCache(-1),RangeError);assert.throws(()=>immediate.set("bad",1,{ttl:-1}),RangeError);
  assert.throws(()=>new LFUTTLCache(1,{now:()=>NaN}).get("x"),TypeError);
  return {passed:22};
}
if(typeof require!=="undefined"&&require.main===module){const r=runTests();console.log("LFU TTL cache: "+r.passed+" checks passed");}
if(typeof module!=="undefined")module.exports={LFUTTLCache,DoublyLinkedList,MinHeap,runTests};