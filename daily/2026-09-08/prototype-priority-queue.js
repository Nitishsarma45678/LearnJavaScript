// Daily JavaScript practice — 2026-09-08
// Prototype-based priority queue with stable ordering and custom comparators.

function PriorityQueue(compare = (a, b) => a.priority - b.priority) {
  this.items = [];
  this.compare = compare;
}

PriorityQueue.prototype.swap = function (i, j) {
  [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
};

PriorityQueue.prototype.bubbleUp = function (index) {
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (this.compare(this.items[index], this.items[parent]) >= 0) break;
    this.swap(index, parent);
    index = parent;
  }
};

PriorityQueue.prototype.bubbleDown = function (index) {
  const length = this.items.length;

  while (true) {
    let best = index;
    const left = index * 2 + 1;
    const right = left + 1;

    if (left < length && this.compare(this.items[left], this.items[best]) < 0) {
      best = left;
    }

    if (right < length && this.compare(this.items[right], this.items[best]) < 0) {
      best = right;
    }

    if (best === index) break;
    this.swap(index, best);
    index = best;
  }
};

PriorityQueue.prototype.enqueue = function (value) {
  this.items.push(value);
  this.bubbleUp(this.items.length - 1);
  return this;
};

PriorityQueue.prototype.dequeue = function () {
  if (!this.items.length) return undefined;
  if (this.items.length === 1) return this.items.pop();

  const first = this.items[0];
  this.items[0] = this.items.pop();
  this.bubbleDown(0);
  return first;
};

PriorityQueue.prototype.peek = function () {
  return this.items[0];
};

PriorityQueue.prototype.size = function () {
  return this.items.length;
};

const queue = new PriorityQueue((a, b) => {
  const priorityDiff = a.priority - b.priority;
  return priorityDiff || a.sequence - b.sequence;
});

[
  { task: "compile", priority: 3, sequence: 2 },
  { task: "security-scan", priority: 1, sequence: 4 },
  { task: "unit-tests", priority: 2, sequence: 1 },
  { task: "deploy", priority: 1, sequence: 5 },
].forEach(job => queue.enqueue(job));

while (queue.size()) {
  console.log(queue.dequeue().task);
}
