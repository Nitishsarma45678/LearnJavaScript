/**
 * Generalized Chinese Remainder Theorem
 * Merges congruences even when moduli are not coprime. Incompatible systems
 * return null. All arithmetic is BigInt; remainders are normalized to [0,m).
 * Empty input yields the identity solution 0 (mod 1).
 * Run: node generalized-chinese-remainder.js
 */
"use strict";
function toBigInt(value,label){
  try{if(typeof value==="number"&&!Number.isSafeInteger(value))throw new TypeError(label+" must be a safe integer");return typeof value==="bigint"?value:BigInt(value);}
  catch(error){if(error instanceof TypeError)throw error;throw new TypeError(label+" must be an integer");}
}
function mod(value,modulus){const r=value%modulus;return r<0n?r+modulus:r;}
function gcd(a,b){
  a=a<0n?-a:a;b=b<0n?-b:b;
  while(b!==0n){const next=a%b;a=b;b=next;}return a;
}
function extendedGCD(a,b){
  let oldR=a,r=b,oldS=1n,s=0n,oldT=0n,t=1n;
  while(r!==0n){const q=oldR/r;[oldR,r]=[r,oldR-q*r];[oldS,s]=[s,oldS-q*s];[oldT,t]=[t,oldT-q*t];}
  return oldR<0n?{gcd:-oldR,x:-oldS,y:-oldT}:{gcd:oldR,x:oldS,y:oldT};
}
function solveCRT(congruences){
  if(!Array.isArray(congruences))throw new TypeError("Expected an array of congruences");
  let solution=0n,combinedModulus=1n;
  for(const item of congruences){
    if(!item||typeof item!=="object")throw new TypeError("Each congruence must be an object");
    const remainder=toBigInt(item.remainder,"remainder"),modulus=toBigInt(item.modulus,"modulus");
    if(modulus<=0n)throw new RangeError("Modulus must be positive");
    const target=mod(remainder,modulus),common=gcd(combinedModulus,modulus),difference=target-solution;
    if(difference%common!==0n)return null;
    const left=combinedModulus/common,right=modulus/common;
    let multiplier=0n;
    if(right!==1n){
      const inverse=extendedGCD(left,right);
      if(inverse.gcd!==1n)throw new Error("Reduced moduli must be coprime");
      multiplier=mod((difference/common)*inverse.x,right);
    }
    combinedModulus*=right;
    solution=mod(solution+(combinedModulus/right)*multiplier,combinedModulus);
  }
  return {remainder:solution,modulus:combinedModulus};
}
function firstSolutionAtLeast(solution,lowerBound){
  if(!solution||typeof solution!=="object")throw new TypeError("A solution object is required");
  const remainder=toBigInt(solution.remainder,"solution remainder");
  const modulus=toBigInt(solution.modulus,"solution modulus"),lower=toBigInt(lowerBound,"lower bound");
  if(modulus<=0n)throw new RangeError("Solution modulus must be positive");
  const delta=lower-remainder;let q=delta/modulus;
  if(delta>0n&&delta%modulus!==0n)q++;
  return remainder+q*modulus;
}
function runTests(){
  const assert=require("node:assert/strict");
  assert.deepEqual(solveCRT([{remainder:2,modulus:3},{remainder:3,modulus:5},{remainder:2,modulus:7}]),{remainder:23n,modulus:105n});
  assert.deepEqual(solveCRT([{remainder:2,modulus:6},{remainder:8,modulus:10}]),{remainder:8n,modulus:30n});
  assert.equal(solveCRT([{remainder:1,modulus:4},{remainder:2,modulus:6}]),null);
  assert.deepEqual(solveCRT([{remainder:-1,modulus:5}]),{remainder:4n,modulus:5n});
  assert.deepEqual(solveCRT([]),{remainder:0n,modulus:1n});
  assert.equal(firstSolutionAtLeast({remainder:23n,modulus:105n},300n),338n);
  assert.equal(firstSolutionAtLeast({remainder:4n,modulus:5n},-10n),-6n);
  assert.equal(gcd(-54n,24n),6n);
  const eg=extendedGCD(240n,46n);assert.equal(240n*eg.x+46n*eg.y,eg.gcd);assert.equal(eg.gcd,2n);
  assert.throws(()=>solveCRT([{remainder:1,modulus:0}]),RangeError);
  assert.throws(()=>solveCRT([{remainder:1.5,modulus:3}]),TypeError);
  assert.throws(()=>solveCRT([{remainder:1,modulus:-3}]),RangeError);
  let state=0xabcdef01;const random=max=>{state=(Math.imul(state,1103515245)+12345)>>>0;return state%max;};
  let checks=12;
  for(let trial=0;trial<240;trial++){
    const system=[];
    for(let i=0,count=1+random(4);i<count;i++){const modulus=1+random(9);system.push({modulus,remainder:random(2*modulus+1)-modulus});}
    const result=solveCRT(system);let brute=null,period=1;
    for(const item of system)period=period/Number(gcd(BigInt(period),BigInt(item.modulus)))*item.modulus;
    for(let candidate=0;candidate<period;candidate++){
      if(system.every(item=>mod(BigInt(candidate-item.remainder),BigInt(item.modulus))===0n)){brute=candidate;break;}
    }
    assert.equal(result===null?null:Number(result.remainder),brute);
    if(result){for(const item of system)assert.equal(mod(result.remainder-BigInt(item.remainder),BigInt(item.modulus)),0n);
      assert.equal(result.remainder>=0n&&result.remainder<result.modulus,true);}
    checks+=1+(result?system.length+1:0);
  }
  const huge=solveCRT([
    {remainder:12345678901234567890n,modulus:100000000000000000003n},
    {remainder:98765432109876543210n,modulus:100000000000000000019n}
  ]);
  assert.ok(huge&&huge.modulus>BigInt(Number.MAX_SAFE_INTEGER));
  return {passed:checks+2,randomizedTrials:240};
}
if(typeof require!=="undefined"&&require.main===module){const r=runTests();console.log("Generalized CRT: "+r.passed+" checks passed");}
if(typeof module!=="undefined")module.exports={gcd,extendedGCD,solveCRT,firstSolutionAtLeast,runTests};