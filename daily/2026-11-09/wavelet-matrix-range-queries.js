/**
 * Wavelet Matrix for Static Range Queries
 * Supports kth, countLessThan, rangeFrequency and exact count on half-open
 * zero-based ranges. Values are unsigned 32-bit integers. Build O(32*n),
 * query O(32), with prefix-one counts and stable zero/one partitions.
 * Run: node wavelet-matrix-range-queries.js
 */
"use strict";
const UINT32_LIMIT=0x100000000;
class WaveletMatrix{
  constructor(values){
    if(!Array.isArray(values)&&!ArrayBuffer.isView(values))throw new TypeError("Expected an array or typed array");
    this.length=values.length;let current=Array.from(values,value=>{
      if(!Number.isInteger(value)||value<0||value>=UINT32_LIMIT)throw new RangeError("Values must be uint32");
      return value;
    });
    this.prefixOnes=[];this.midpoints=[];
    for(let level=0;level<32;level++){
      const shift=31-level,prefix=new Uint32Array(this.length+1),zeros=[],ones=[];
      for(let i=0;i<current.length;i++){
        const bit=(current[i]>>>shift)&1;prefix[i+1]=prefix[i]+bit;(bit?ones:zeros).push(current[i]);
      }
      this.prefixOnes.push(prefix);this.midpoints.push(zeros.length);current=zeros.concat(ones);
    }
  }
  _range(left,right){if(!Number.isInteger(left)||!Number.isInteger(right)||left<0||right<left||right>this.length)throw new RangeError("Invalid half-open range");}
  _bound(value){if(!Number.isInteger(value)||value<0||value>UINT32_LIMIT)throw new RangeError("Bound must be in [0, 2^32]");}
  kth(left,right,k){
    this._range(left,right);if(!Number.isInteger(k)||k<0||k>=right-left)throw new RangeError("k is outside the range");
    let result=0;
    for(let level=0;level<32;level++){
      const p=this.prefixOnes[level],ol=p[left],or=p[right],zeros=(right-left)-(or-ol),shift=31-level;
      if(k<zeros){left-=ol;right-=or;}
      else{k-=zeros;result=(result|(1<<shift))>>>0;left=this.midpoints[level]+ol;right=this.midpoints[level]+or;}
    }
    return result;
  }
  countLessThan(left,right,value){
    this._range(left,right);this._bound(value);if(value===0||left===right)return 0;if(value===UINT32_LIMIT)return right-left;
    let count=0;
    for(let level=0;level<32;level++){
      const p=this.prefixOnes[level],ol=p[left],or=p[right],zeros=(right-left)-(or-ol),shift=31-level;
      if((value>>>shift)&1){count+=zeros;left=this.midpoints[level]+ol;right=this.midpoints[level]+or;}
      else{left-=ol;right-=or;}
    }
    return count;
  }
  rangeFrequency(left,right,low,high){
    this._range(left,right);this._bound(low);this._bound(high);if(high<low)throw new RangeError("high must be >= low");
    return this.countLessThan(left,right,high)-this.countLessThan(left,right,low);
  }
  count(left,right,value){this._bound(value);return value===UINT32_LIMIT?0:this.rangeFrequency(left,right,value,value+1);}
  access(index){if(!Number.isInteger(index)||index<0||index>=this.length)throw new RangeError("Index out of bounds");return this.kth(index,index+1,0);}
}
function runTests(){
  const assert=require("node:assert/strict");
  const matrix=new WaveletMatrix([5,1,9,1,0,0xffffffff,7]);
  assert.equal(matrix.kth(0,7,0),0);assert.equal(matrix.kth(0,7,6),0xffffffff);
  assert.equal(matrix.kth(1,4,1),1);assert.equal(matrix.countLessThan(0,7,5),3);
  assert.equal(matrix.rangeFrequency(0,7,1,8),4);assert.equal(matrix.count(0,7,1),2);
  assert.equal(matrix.access(5),0xffffffff);assert.equal(matrix.rangeFrequency(2,2,0,UINT32_LIMIT),0);
  assert.equal(new WaveletMatrix([]).length,0);
  let state=0x9e3779b9;const random=max=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%max;};
  let checks=9;
  for(let trial=0;trial<140;trial++){
    const values=Array.from({length:random(45)},()=>{const kind=random(8);return kind===0?0xffffffff:kind===1?0:random(1000);});
    const wm=new WaveletMatrix(values);
    for(let q=0;q<18&&values.length;q++){
      const left=random(values.length),right=left+1+random(values.length-left),sorted=values.slice(left,right).sort((a,b)=>a-b);
      const k=random(sorted.length);assert.equal(wm.kth(left,right,k),sorted[k]);
      const bound=random(1100);assert.equal(wm.countLessThan(left,right,bound),sorted.filter(v=>v<bound).length);
      const low=random(1000),high=low+random(1001-low);
      assert.equal(wm.rangeFrequency(left,right,low,high),sorted.filter(v=>v>=low&&v<high).length);checks+=3;
    }
    for(let i=0;i<values.length;i++)assert.equal(wm.access(i),values[i]);
  }
  assert.throws(()=>matrix.kth(0,7,7),RangeError);
  assert.throws(()=>matrix.countLessThan(0,7,UINT32_LIMIT+1),RangeError);
  assert.throws(()=>matrix.rangeFrequency(0,7,9,2),RangeError);
  assert.throws(()=>new WaveletMatrix([1,-1]),RangeError);
  return {passed:checks+4,randomizedTrials:140};
}
if(typeof require!=="undefined"&&require.main===module){const r=runTests();console.log("Wavelet matrix: "+r.passed+" checks passed");}
if(typeof module!=="undefined")module.exports={WaveletMatrix,runTests};