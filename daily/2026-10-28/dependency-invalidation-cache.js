// A cache that records dependency edges and invalidates every transitive dependent.
// Cycles are rejected so dependency relationships remain a DAG.
// Run with: node dependency-invalidation-cache.js
const assert = require("node:assert/strict");

class DependencyCache {
  constructor() {
    this.values = new Map();
    this.dependencies = new Map(); // key -> keys this entry depends on
    this.dependents = new Map();    // key -> entries that depend on it
  }

  has(key) {
    return this.values.has(key);
  }

  get(key) {
    return this.values.get(key);
  }

  set(key, value, { dependsOn = [] } = {}) {
    if (!Array.isArray(dependsOn)) throw new TypeError("dependsOn must be an array");
    const uniqueDependencies = [...new Set(dependsOn)];
    if (uniqueDependencies.includes(key)) throw new Error("dependency cycle detected");

    for (const dependency of uniqueDependencies) {
      if (this.#reaches(dependency, key)) throw new Error("dependency cycle detected");
    }

    this.#removeDependencyEdges(key);
    this.values.set(key, value);
    this.dependencies.set(key, new Set(uniqueDependencies));

    for (const dependency of uniqueDependencies) {
      if (!this.dependents.has(dependency)) this.dependents.set(dependency, new Set());
      this.dependents.get(dependency).add(key);
    }
    return this;
  }

  #reaches(start, target) {
    const stack = [start];
    const visited = new Set();

    while (stack.length) {
      const current = stack.pop();
      if (current === target) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dependency of this.dependencies.get(current) || []) {
        stack.push(dependency);
      }
    }
    return false;
  }

  #removeDependencyEdges(key) {
    for (const dependency of this.dependencies.get(key) || []) {
      const reverse = this.dependents.get(dependency);
      if (reverse) {
        reverse.delete(key);
        if (reverse.size === 0) this.dependents.delete(dependency);
      }
    }
    this.dependencies.delete(key);
  }

  invalidate(key) {
    if (!this.values.has(key) && !this.dependents.has(key)) return [];

    const doomed = new Set();
    const stack = [key];
    while (stack.length) {
      const current = stack.pop();
      if (doomed.has(current)) continue;
      doomed.add(current);
      for (const dependent of this.dependents.get(current) || []) stack.push(dependent);
    }

    for (const doomedKey of doomed) {
      this.values.delete(doomedKey);
    }
    for (const doomedKey of doomed) {
      this.#removeDependencyEdges(doomedKey);
      this.dependents.delete(doomedKey);
    }

    return [...doomed];
  }

  keys() {
    return [...this.values.keys()];
  }
}

const cache = new DependencyCache();
cache
  .set("raw-users", [{ id: 1 }])
  .set("user-index", new Map([[1, 0]]), { dependsOn: ["raw-users"] })
  .set("profile-view", { title: "User 1" }, { dependsOn: ["user-index"] })
  .set("dashboard", { count: 1 }, { dependsOn: ["profile-view", "raw-users"] })
  .set("unrelated", 42);

assert.equal(cache.get("unrelated"), 42);
const removed = new Set(cache.invalidate("raw-users"));
assert.deepEqual(removed, new Set(["raw-users", "user-index", "profile-view", "dashboard"]));
assert.equal(cache.has("raw-users"), false);
assert.equal(cache.has("profile-view"), false);
assert.equal(cache.has("dashboard"), false);
assert.equal(cache.get("unrelated"), 42, "unrelated entries survive invalidation");
assert.deepEqual(cache.invalidate("does-not-exist"), []);

cache.set("alpha", 1, { dependsOn: ["beta"] });
assert.throws(() => cache.set("beta", 2, { dependsOn: ["alpha"] }), /cycle/);
assert.equal(cache.has("alpha"), true);
assert.equal(cache.has("beta"), false, "a rejected cyclic write must not partially commit");

cache.set("alpha", 3);
assert.equal(cache.get("alpha"), 3, "replacing an entry updates its dependency edges");
assert.deepEqual(new Set(cache.invalidate("beta")), new Set(["alpha", "beta"]));

console.log("DependencyCache: all assertions passed");
