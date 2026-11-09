/**
 * Convex Hull + Rotating Calipers
 * Andrew monotone chain builds a CCW hull; rotating calipers finds its diameter.
 * Points are finite {x,y} objects. By default collinear edge points are removed.
 * Run: node convex-hull-rotating-calipers.js
 */
"use strict";
function comparePoint(a,b){return a.x-b.x||a.y-b.y;}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function squaredDistance(a,b){const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy;}
function normalizePoints(input){
  if(!Array.isArray(input))throw new TypeError("Points must be an array");
  const unique=new Map();
  for(const point of input){
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new TypeError("Points need finite x and y");
    const x=Object.is(point.x,-0)?0:point.x,y=Object.is(point.y,-0)?0:point.y;
    unique.set(String(x)+"\u0000"+String(y),{x,y});
  }
  return Array.from(unique.values()).sort(comparePoint);
}
function convexHull(input,options={}){
  const points=normalizePoints(input),keep=options.includeCollinear===true;
  if(points.length<=2)return points;
  let collinear=true;
  for(let i=2;i<points.length;i++)if(cross(points[0],points[1],points[i])!==0){collinear=false;break;}
  if(collinear)return keep?points:[points[0],points[points.length-1]];
  function half(sequence){
    const result=[];
    for(const point of sequence){
      while(result.length>=2){
        const turn=cross(result[result.length-2],result[result.length-1],point);
        if(keep?turn<0:turn<=0)result.pop();else break;
      }
      result.push(point);
    }
    return result;
  }
  const lower=half(points),upper=half(points.slice().reverse());
  lower.pop();upper.pop();return lower.concat(upper);
}
function orderedPair(a,b){return comparePoint(a,b)<=0?[a,b]:[b,a];}
function comparePairs(a,b){return comparePoint(a[0],b[0])||comparePoint(a[1],b[1]);}
function diameter(hull){
  if(!Array.isArray(hull))throw new TypeError("Hull must be an array");
  const n=hull.length;
  if(!n)return null;
  if(n===1)return {distanceSquared:0,pair:[hull[0],hull[0]]};
  if(n===2)return {distanceSquared:squaredDistance(hull[0],hull[1]),pair:orderedPair(hull[0],hull[1])};
  let best=-1,bestPair=null;
  function consider(a,b){
    const pair=orderedPair(a,b),distance=squaredDistance(a,b);
    if(distance>best||(distance===best&&comparePairs(pair,bestPair)<0)){best=distance;bestPair=pair;}
  }
  let opposite=1;
  for(let i=0;i<n;i++){
    const next=(i+1)%n;
    while(true){
      const candidate=(opposite+1)%n;
      const currentArea=Math.abs(cross(hull[i],hull[next],hull[opposite]));
      const nextArea=Math.abs(cross(hull[i],hull[next],hull[candidate]));
      if(nextArea<=currentArea)break;
      opposite=candidate;
    }
    consider(hull[i],hull[opposite]);consider(hull[next],hull[opposite]);
    const adjacent=(opposite+1)%n;
    if(Math.abs(cross(hull[i],hull[next],hull[adjacent]))===
       Math.abs(cross(hull[i],hull[next],hull[opposite]))){
      consider(hull[i],hull[adjacent]);consider(hull[next],hull[adjacent]);
    }
  }
  return {distanceSquared:best,pair:bestPair};
}
function pointInHull(point,hull){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new TypeError("Invalid query point");
  if(!hull.length)return false;
  if(hull.length===1)return point.x===hull[0].x&&point.y===hull[0].y;
  if(hull.length===2)return cross(hull[0],hull[1],point)===0&&
    point.x>=Math.min(hull[0].x,hull[1].x)&&point.x<=Math.max(hull[0].x,hull[1].x)&&
    point.y>=Math.min(hull[0].y,hull[1].y)&&point.y<=Math.max(hull[0].y,hull[1].y);
  for(let i=0;i<hull.length;i++)if(cross(hull[i],hull[(i+1)%hull.length],point)<0)return false;
  return true;
}
function runTests(){
  const assert=require("node:assert/strict");
  const rect=convexHull([{x:2,y:2},{x:0,y:0},{x:2,y:0},{x:0,y:2},{x:1,y:1},{x:0,y:0}]);
  assert.equal(rect.length,4);assert.equal(diameter(rect).distanceSquared,8);
  assert.equal(pointInHull({x:1,y:1},rect),true);assert.equal(pointInHull({x:0,y:1},rect),true);
  assert.equal(pointInHull({x:3,y:1},rect),false);
  const line=[{x:0,y:0},{x:1,y:1},{x:2,y:2},{x:1,y:1}];
  assert.equal(convexHull(line).length,2);assert.equal(convexHull(line,{includeCollinear:true}).length,3);
  assert.equal(diameter(convexHull(line)).distanceSquared,8);
  assert.equal(convexHull([]).length,0);assert.equal(diameter([]),null);
  assert.equal(diameter([{x:4,y:5}]).distanceSquared,0);
  assert.throws(()=>convexHull([{x:0,y:NaN}]),TypeError);
  let state=0x12345678;
  const random=max=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%max;};
  let checks=12;
  for(let trial=0;trial<180;trial++){
    const points=Array.from({length:1+random(24)},()=>({x:random(31)-15,y:random(31)-15}));
    const hull=convexHull(points);
    for(const point of points){assert.equal(pointInHull(point,hull),true);checks++;}
    let brute=0;
    for(let i=0;i<hull.length;i++)for(let j=i+1;j<hull.length;j++)brute=Math.max(brute,squaredDistance(hull[i],hull[j]));
    assert.equal(diameter(hull).distanceSquared,brute);checks++;
  }
  return {passed:checks,randomizedTrials:180};
}
if(typeof require!=="undefined"&&require.main===module){const r=runTests();console.log("Convex hull: "+r.passed+" checks passed");}
if(typeof module!=="undefined")module.exports={convexHull,diameter,pointInHull,cross,squaredDistance,runTests};