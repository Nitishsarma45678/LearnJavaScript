'use strict';

// Exercise: implement a monotone integer priority queue and use it for
// Dijkstra on graphs whose edge weights are non-negative 32-bit integers.

class RadixHeap {
  constructor() {
    this.last = 0;
    this.buckets = Array.from({ length: 33 }, () => []);
    this.size = 0;
  }

  bucketIndex(key) {
    return key === this.last ? 0 : 32 - Math.clz32((key ^ this.last) >>> 0);
  }

  push(key, value) {
    if (!Number.isInteger(key) || key < this.last || key > 0xffffffff) {
      throw new RangeError('keys must be monotone unsigned 32-bit integers');
    }
    this.buckets[this.bucketIndex(key)].push({ key, value });
    this.size++;
  }

  pop() {
    if (!this.size) return null;
    if (!this.buckets[0].length) {
      let index = 1;
      while (!this.buckets[index].length) index++;
      this.last = Math.min(...this.buckets[index].map(item => item.key));
      const items = this.buckets[index];
      this.buckets[index] = [];
      for (const item of items) this.buckets[this.bucketIndex(item.key)].push(item);
    }
    this.size--;
    return this.buckets[0].pop();
  }

  get length() { return this.size; }
}

function dijkstraIntegerWeights(vertexCount, edges, source) {
  const graph = Array.from({ length: vertexCount }, () => []);
  for (const [from, to, weight] of edges) {
    if (![from, to].every(v => Number.isInteger(v) && v >= 0 && v < vertexCount) ||
        !Number.isInteger(weight) || weight < 0 || weight > 0xffffffff) {
      throw new RangeError('invalid edge');
    }
    graph[from].push([to, weight]);
  }
  if (!Number.isInteger(source) || source < 0 || source >= vertexCount) throw new RangeError('invalid source');

  const distance = Array(vertexCount).fill(Infinity);
  const heap = new RadixHeap();
  distance[source] = 0;
  heap.push(0, source);

  while (heap.length) {
    const { key: currentDistance, value: vertex } = heap.pop();
    if (currentDistance !== distance[vertex]) continue;
    for (const [next, weight] of graph[vertex]) {
      const candidate = currentDistance + weight;
      if (candidate < distance[next]) {
        if (candidate > 0xffffffff) throw new RangeError('path distance exceeds 32-bit key range');
        distance[next] = candidate;
        heap.push(candidate, next);
      }
    }
  }
  return distance;
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const heap = new RadixHeap();
  [[0, 'zero'], [7, 'seven'], [3, 'three'], [3, 'three-b']].forEach(x => heap.push(...x));
  assert.deepEqual([heap.pop().key, heap.pop().key, heap.pop().key, heap.pop().key], [0, 3, 3, 7]);
  assert.equal(heap.pop(), null);
  assert.deepEqual(dijkstraIntegerWeights(5, [
    [0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 1], [2, 3, 5]
  ], 0), [0, 3, 1, 4, Infinity]);
  assert.throws(() => heap.push(2, 'out-of-order'), RangeError);
  console.log('radix heap and Dijkstra: all tests passed');
}

module.exports = { RadixHeap, dijkstraIntegerWeights };
