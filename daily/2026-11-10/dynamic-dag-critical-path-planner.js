'use strict';

class CycleError extends Error {
  constructor(cycle) {
    super(`Dependency would create a cycle: ${cycle.join(' -> ')}`);
    this.name = 'CycleError';
    this.cycle = cycle;
  }
}

/**
 * Mutable directed-acyclic task graph with cycle-safe edge insertion and CPM.
 * Durations are non-negative numbers. plan() computes earliest/latest times,
 * total float (slack), project duration, and one deterministic critical path.
 */
class DagPlanner {
  constructor() {
    this.duration = new Map();
    this.outgoing = new Map();
    this.incoming = new Map();
  }

  addTask(id, duration = 0) {
    if (id === undefined || id === null) throw new TypeError('task id is required');
    this._validateDuration(duration);
    if (this.duration.has(id)) throw new Error(`task already exists: ${String(id)}`);
    this.duration.set(id, duration);
    this.outgoing.set(id, new Set());
    this.incoming.set(id, new Set());
    return this;
  }

  _validateDuration(duration) {
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError('duration must be finite and non-negative');
  }

  updateDuration(id, duration) {
    this._requireTask(id);
    this._validateDuration(duration);
    this.duration.set(id, duration);
    return this;
  }

  _requireTask(id) {
    if (!this.duration.has(id)) throw new Error(`unknown task: ${String(id)}`);
  }

  _pathBetween(start, target) {
    const queue = [start];
    const parent = new Map([[start, null]]);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (Object.is(current, target)) {
        const path = [];
        for (let node = current; node !== null; node = parent.get(node)) path.push(node);
        return path.reverse();
      }
      for (const next of this.outgoing.get(current)) {
        if (!parent.has(next)) {
          parent.set(next, current);
          queue.push(next);
        }
      }
    }
    return null;
  }

  addDependency(before, after) {
    this._requireTask(before);
    this._requireTask(after);
    if (Object.is(before, after)) throw new CycleError([before, before]);
    if (this.outgoing.get(before).has(after)) return this;
    const path = this._pathBetween(after, before);
    if (path) throw new CycleError([before, ...path]);
    this.outgoing.get(before).add(after);
    this.incoming.get(after).add(before);
    return this;
  }

  removeDependency(before, after) {
    this._requireTask(before);
    this._requireTask(after);
    const removed = this.outgoing.get(before).delete(after);
    if (removed) this.incoming.get(after).delete(before);
    return removed;
  }

  removeTask(id) {
    this._requireTask(id);
    for (const predecessor of this.incoming.get(id)) this.outgoing.get(predecessor).delete(id);
    for (const successor of this.outgoing.get(id)) this.incoming.get(successor).delete(id);
    this.incoming.delete(id);
    this.outgoing.delete(id);
    this.duration.delete(id);
    return this;
  }

  plan() {
    const indegree = new Map([...this.incoming].map(([id, predecessors]) => [id, predecessors.size]));
    const queue = [...this.duration.keys()].filter(id => indegree.get(id) === 0);
    const order = [];
    for (let head = 0; head < queue.length; head += 1) {
      const id = queue[head];
      order.push(id);
      for (const next of this.outgoing.get(id)) {
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      }
    }
    if (order.length !== this.duration.size) throw new Error('internal invariant violated: graph is cyclic');

    const earliestStart = new Map([...this.duration.keys()].map(id => [id, 0]));
    const predecessor = new Map();
    const earliestFinish = new Map();
    let projectDuration = 0;
    for (const id of order) {
      const finish = earliestStart.get(id) + this.duration.get(id);
      earliestFinish.set(id, finish);
      projectDuration = Math.max(projectDuration, finish);
      for (const next of this.outgoing.get(id)) {
        if (finish > earliestStart.get(next)) {
          earliestStart.set(next, finish);
          predecessor.set(next, id);
        }
      }
    }

    const latestStart = new Map();
    const latestFinish = new Map();
    const slack = new Map();
    for (let index = order.length - 1; index >= 0; index -= 1) {
      const id = order[index];
      let finishLimit = projectDuration;
      if (this.outgoing.get(id).size > 0) {
        finishLimit = Infinity;
        for (const next of this.outgoing.get(id)) finishLimit = Math.min(finishLimit, latestStart.get(next));
      }
      const startLimit = finishLimit - this.duration.get(id);
      latestFinish.set(id, finishLimit);
      latestStart.set(id, startLimit);
      slack.set(id, startLimit - earliestStart.get(id));
    }

    let end = null;
    for (const id of order) {
      if (earliestFinish.get(id) === projectDuration) end = id;
    }
    const criticalPath = [];
    for (let id = end; id !== undefined; id = predecessor.get(id)) criticalPath.push(id);
    criticalPath.reverse();

    const tasks = order.map(id => ({
      id,
      duration: this.duration.get(id),
      earliestStart: earliestStart.get(id),
      earliestFinish: earliestFinish.get(id),
      latestStart: latestStart.get(id),
      latestFinish: latestFinish.get(id),
      slack: Math.max(0, slack.get(id))
    }));
    return {
      order,
      projectDuration,
      criticalPath,
      criticalTasks: tasks.filter(task => Math.abs(task.slack) < 1e-9).map(task => task.id),
      tasks
    };
  }
}

function runTests() {
  const assert = require('node:assert/strict');
  const planner = new DagPlanner();
  planner.addTask('design', 3).addTask('api', 2).addTask('ui', 4).addTask('release', 1)
    .addDependency('design', 'ui')
    .addDependency('api', 'ui')
    .addDependency('ui', 'release');
  const result = planner.plan();
  assert.equal(result.projectDuration, 8);
  assert.deepEqual(result.criticalPath, ['design', 'ui', 'release']);
  assert.equal(result.tasks.find(task => task.id === 'api').slack, 1);
  assert.throws(() => planner.addDependency('release', 'design'), error => {
    assert.ok(error instanceof CycleError);
    assert.deepEqual(error.cycle, ['release', 'design', 'ui', 'release']);
    return true;
  });
  assert.equal(planner.removeDependency('api', 'ui'), true);
  assert.equal(planner.removeDependency('api', 'ui'), false);
  planner.updateDuration('api', 5);
  assert.equal(planner.plan().criticalPath.includes('api'), false);
  planner.addTask('independent', 2).removeTask('independent');
  assert.throws(() => planner.addTask('bad', -1), /non-negative/);

  // Random DAGs: every edge must respect earliest times and every slack is non-negative.
  let seed = 0xabcdef01;
  for (let trial = 0; trial < 160; trial += 1) {
    const n = seed % 12;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const dag = new DagPlanner();
    for (let i = 0; i < n; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      dag.addTask(i, seed % 8);
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        if ((seed & 7) === 0) dag.addDependency(i, j);
      }
    }
    const plan = dag.plan();
    const byId = new Map(plan.tasks.map(task => [task.id, task]));
    for (let from = 0; from < n; from += 1) {
      for (const to of dag.outgoing.get(from)) {
        assert.ok(byId.get(to).earliestStart >= byId.get(from).earliestFinish);
      }
    }
    for (const task of plan.tasks) assert.ok(task.slack >= 0);
  }
  console.log('Dynamic DAG planner: all tests passed (160 randomized DAGs).');
}

if (require.main === module) runTests();
module.exports = { DagPlanner, CycleError };
