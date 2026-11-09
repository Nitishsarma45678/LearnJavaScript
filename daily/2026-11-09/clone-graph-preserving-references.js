/**
 * Graph-Aware Deep Clone
 * Preserves cycles, aliases, prototypes, property descriptors, symbols,
 * Map/Set contents, Date/RegExp, ArrayBuffers and shared typed-array buffers.
 * Functions are retained by reference. Weak collections, Promise and
 * SharedArrayBuffer are rejected because their internal state is not cloneable.
 * Accessor descriptors are copied without invoking getters.
 * Run: node clone-graph-preserving-references.js
 */
"use strict";
function isWeakCollection(value){return value instanceof WeakMap||value instanceof WeakSet;}
function isArrayIndexKey(key){
  if(typeof key!=="string"||key==="")return false;
  const n=Number(key);return Number.isInteger(n)&&n>=0&&n<0xffffffff&&String(n)===key;
}
function cloneGraph(root){
  const seen=new WeakMap();
  function copyProperties(source,target,skip=()=>false){
    for(const key of Reflect.ownKeys(source)){
      if(skip(key))continue;
      const descriptor=Object.getOwnPropertyDescriptor(source,key);
      if(Object.prototype.hasOwnProperty.call(descriptor,"value"))descriptor.value=clone(descriptor.value);
      Object.defineProperty(target,key,descriptor);
    }
    if(!Object.isExtensible(source))Object.preventExtensions(target);
    return target;
  }
  function clone(value){
    if(value===null||(typeof value!=="object"&&typeof value!=="function"))return value;
    if(typeof value==="function")return value;
    if(seen.has(value))return seen.get(value);
    if(isWeakCollection(value)||value instanceof Promise||
      (typeof SharedArrayBuffer!=="undefined"&&value instanceof SharedArrayBuffer)){
      throw new TypeError("Built-in contains uncloneable internal state");
    }
    if(value instanceof Date){const result=new Date(value.getTime());seen.set(value,result);return copyProperties(value,result);}
    if(value instanceof RegExp){const result=new RegExp(value.source,value.flags);result.lastIndex=value.lastIndex;seen.set(value,result);return copyProperties(value,result,key=>key==="lastIndex");}
    if(value instanceof ArrayBuffer){const result=value.slice(0);seen.set(value,result);return copyProperties(value,result);}
    if(ArrayBuffer.isView(value)){
      const buffer=clone(value.buffer);if(seen.has(value))return seen.get(value);
      const result=value instanceof DataView?new DataView(buffer,value.byteOffset,value.byteLength):
        new value.constructor(buffer,value.byteOffset,value.length);
      seen.set(value,result);return copyProperties(value,result,isArrayIndexKey);
    }
    if(value instanceof Map){
      const result=new Map();seen.set(value,result);
      for(const [key,entry] of value)result.set(clone(key),clone(entry));
      return copyProperties(value,result);
    }
    if(value instanceof Set){
      const result=new Set();seen.set(value,result);
      for(const entry of value)result.add(clone(entry));
      return copyProperties(value,result);
    }
    if(value instanceof Error){const result=Object.create(Object.getPrototypeOf(value));seen.set(value,result);return copyProperties(value,result);}
    if(Array.isArray(value)){
      const result=new Array(value.length);seen.set(value,result);
      copyProperties(value,result,key=>key==="length");
      Object.defineProperty(result,"length",Object.getOwnPropertyDescriptor(value,"length"));
      if(!Object.isExtensible(value))Object.preventExtensions(result);
      return result;
    }
    const result=Object.create(Object.getPrototypeOf(value));seen.set(value,result);return copyProperties(value,result);
  }
  return clone(root);
}
function runTests(){
  const assert=require("node:assert/strict");let getterCalls=0;
  const shared={label:"shared"},source={left:shared,right:shared};source.self=source;
  const copy=cloneGraph(source);assert.notEqual(copy,source);assert.equal(copy.self,copy);
  assert.equal(copy.left,copy.right);assert.notEqual(copy.left,shared);
  class Account{constructor(id){this.id=id;}describe(){return "account:"+this.id;}}
  const account=new Account(7);
  Object.defineProperty(account,"secret",{value:{score:42},enumerable:false,writable:false,configurable:false});
  Object.defineProperty(account,"computed",{get(){getterCalls++;return this.id*2;},enumerable:true,configurable:true});
  const accountCopy=cloneGraph(account);assert.equal(Object.getPrototypeOf(accountCopy),Account.prototype);
  assert.equal(accountCopy.describe(),"account:7");assert.equal(Object.getOwnPropertyDescriptor(accountCopy,"secret").writable,false);
  assert.notEqual(accountCopy.secret,account.secret);assert.equal(getterCalls,0);assert.equal(accountCopy.computed,14);assert.equal(getterCalls,1);
  const symbol=Symbol("metadata"),symbolObject={[symbol]:{nested:true}},symbolCopy=cloneGraph(symbolObject);
  assert.notEqual(symbolCopy[symbol],symbolObject[symbol]);
  const map=new Map(),key={id:1};map.set(key,{owner:key});map.set(map,key);
  const mapCopy=cloneGraph(map),clonedKey=Array.from(mapCopy.keys())[0];
  assert.notEqual(clonedKey,key);assert.equal(mapCopy.get(clonedKey).owner,clonedKey);assert.equal(mapCopy.get(mapCopy),clonedKey);
  const set=new Set();set.add(set);set.add(shared);const setCopy=cloneGraph(set);
  assert.equal(setCopy.has(setCopy),true);assert.notEqual(Array.from(setCopy)[1],shared);
  const buffer=new ArrayBuffer(16),bytes=new Uint8Array(buffer),words=new Uint32Array(buffer,4,2),view=new DataView(buffer,2,8);
  bytes[4]=123;const views=cloneGraph({buffer,bytes,words,view});
  assert.notEqual(views.buffer,buffer);assert.equal(views.bytes.buffer,views.buffer);
  assert.equal(views.words.buffer,views.buffer);assert.equal(views.view.buffer,views.buffer);
  assert.equal(views.bytes[4],123);views.words[0]=99;assert.equal(views.bytes[4],99);
  const date=new Date("2024-02-29T12:30:00Z"),dateCopy=cloneGraph(date);assert.equal(dateCopy.getTime(),date.getTime());
  const regex=/a+b/gi;regex.lastIndex=3;const regexCopy=cloneGraph(regex);
  assert.equal(regexCopy.source,regex.source);assert.equal(regexCopy.flags,regex.flags);assert.equal(regexCopy.lastIndex,3);
  const array=[];array.push(array);const arrayCopy=cloneGraph(array);assert.equal(arrayCopy[0],arrayCopy);
  const frozen=Object.freeze({nested:Object.freeze([1,2])}),frozenCopy=cloneGraph(frozen);
  assert.equal(Object.isFrozen(frozenCopy),true);assert.equal(Object.isFrozen(frozenCopy.nested),true);
  const fn=function same(){};assert.equal(cloneGraph(fn),fn);
  assert.throws(()=>cloneGraph(new WeakMap()),TypeError);assert.throws(()=>cloneGraph(Promise.resolve(1)),TypeError);
  return {passed:31};
}
if(typeof require!=="undefined"&&require.main===module){const r=runTests();console.log("Graph clone: "+r.passed+" checks passed");}
if(typeof module!=="undefined")module.exports={cloneGraph,runTests};