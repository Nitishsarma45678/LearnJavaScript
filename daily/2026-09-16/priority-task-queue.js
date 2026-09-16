// Daily practice: priority queue implemented with a binary heap.
// Challenge: preserve FIFO order for tasks with the same priority while
// supporting enqueue, dequeue, peek, and reprioritization.

class PriorityTaskQueue {
  constructor() {
    this.heap = [];
    this.sequence = 0;
  }

  static higher(a, b) {
    if (a.priority !== b.priority) {
      return a.priority > b.priority;
    }
    return a.sequence < b.sequence;
  }

  enqueue(task, priority = 0) {
    const node = {
      id: this.sequence,
      sequence: this.sequence++,
      task,
      priority,
    };

    this.heap.push(node);
    this.#bubbleUp(this.heap.length - 1);
    return node.id;
  }

  dequeue() {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const top = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.#bubbleDown(0);
    return top;
  }

  peek() {
    return this.heap[0];
  }

  reprioritize(id, newPriority) {
    const index = this.heap.findIndex((node) => node.id === id);
    if (index === -1) return false;

    this.heap[index].priority = newPriority;
    this.#bubbleUp(index);
    this.#bubbleDown(index);
    return true;
  }

  get size() {
    return this.heap.length;
  }

  #bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!PriorityTaskQueue.higher(this.heap[parent], this.heap[index])) {
        [this.heap[parent], this.heap[index]] = [
          this.heap[index],
          this.heap[parent],
        ];
        index = parent;
      } else {
        break;
      }
    }
  }

  #bubbleDown(index) {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;

      if (
        left < this.heap.length &&
        PriorityTaskQueue.higher(this.heap[left], this.heap[best])
      ) {
        best = left;
      }

      if (
        right < this.heap.length &&
        PriorityTaskQueue.higher(this.heap[right], this.heap[best])
      ) {
        best = right;
      }

      if (best === index) break;
      [this.heap[index], this.heap[best]] = [this.heap[best], this.heap[index]];
      index = best;
    }
  }
}

const queue = new PriorityTaskQueue();
const first = queue.enqueue("write report", 2);
queue.enqueue("answer support tickets", 5);
queue.enqueue("send status update", 5);
queue.enqueue("backup database", 1);
queue.reprioritize(first, 6);

while (queue.size) {
  const next = queue.dequeue();
  console.log(`${next.priority}: ${next.task}`);
}

// Expected order:
// 6: write report
// 5: answer support tickets
// 5: send status update
// 1: backup database
