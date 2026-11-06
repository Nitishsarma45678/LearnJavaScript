'use strict';

// Hierarchical async DI container with singleton/scoped/transient lifetimes,
// concurrent singleton memoization, cycle detection and reverse disposal.
function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error((message || "Values differ") +
    ": expected " + String(expected) + ", got " + String(actual));
}
function tokenLabel(token) {
  if (typeof token === "symbol") return token.description || token.toString();
  return String(token);
}
class Container {
  constructor(parent = null) {
    this.parent = parent; this.root = parent ? parent.root : this;
    this.registrations = new Map(); this.instances = new Map();
    this.created = []; this.tracked = new WeakSet(); this.pending = new Set();
    this.children = new Set(); this.state = "active";
    if (parent) parent.children.add(this);
  }
  _assertActive() {
    if (this.state !== "active") throw new Error("container is not active");
  }
  register(token, factory, options = {}) {
    this._assertActive();
    if (typeof factory !== "function") throw new TypeError("factory must be a function");
    const lifetime = options.lifetime || "transient";
    if (!["singleton", "scoped", "transient"].includes(lifetime)) {
      throw new RangeError("unknown lifetime: " + lifetime);
    }
    if (this.registrations.has(token)) throw new Error("token already registered: " + tokenLabel(token));
    this.registrations.set(token, { factory, lifetime }); return this;
  }
  registerValue(token, value) {
    return this.register(token, () => value, { lifetime: "singleton" });
  }
  createScope() { this._assertActive(); return new Container(this); }
  _find(token) {
    for (let current = this; current; current = current.parent) {
      if (current.registrations.has(token)) {
        return { registration: current.registrations.get(token), owner: current };
      }
    }
    throw new Error("no registration for token: " + tokenLabel(token));
  }
  resolve(token) { return this._resolve(token, []); }
  _resolve(token, path) {
    this._assertActive();
    if (path.includes(token)) {
      const chain = path.concat([token]).map(tokenLabel).join(" -> ");
      return Promise.reject(new Error("circular dependency: " + chain));
    }
    let found;
    try { found = this._find(token); }
    catch (error) { return Promise.reject(error); }
    const lifetime = found.registration.lifetime;
    const cacheOwner = lifetime === "singleton" ? found.owner :
      lifetime === "scoped" ? this : null;
    if (cacheOwner && cacheOwner.instances.has(token)) return cacheOwner.instances.get(token);
    const nextPath = path.concat([token]);
    const promise = Promise.resolve().then(() => found.registration.factory({
      resolve: (dependency) => this._resolve(dependency, nextPath),
      container: this
    })).then((instance) => {
      (cacheOwner || this)._track(instance); return instance;
    });
    if (cacheOwner) cacheOwner.instances.set(token, promise);
    const pendingOwners = new Set([this, cacheOwner || this]);
    for (const owner of pendingOwners) owner.pending.add(promise);
    promise.then(
      () => { for (const owner of pendingOwners) owner.pending.delete(promise); },
      () => { for (const owner of pendingOwners) owner.pending.delete(promise); }
    );
    if (cacheOwner) promise.catch(() => {
      if (cacheOwner.instances.get(token) === promise) cacheOwner.instances.delete(token);
    });
    return promise;
  }
  _track(instance) {
    if ((typeof instance !== "object" || instance === null) && typeof instance !== "function") return;
    if (this.tracked.has(instance)) return;
    this.tracked.add(instance); this.created.push(instance);
  }
  async dispose() {
    if (this.state === "disposed") return;
    this._assertActive();
    for (const child of Array.from(this.children)) await child.dispose();
    if (this.pending.size) throw new Error("await outstanding resolve() calls before disposing");
    this.state = "disposing";
    for (let i = this.created.length - 1; i >= 0; i--) {
      const instance = this.created[i];
      const asyncDispose = typeof Symbol.asyncDispose === "symbol" ? instance[Symbol.asyncDispose] : null;
      const syncDispose = typeof Symbol.dispose === "symbol" ? instance[Symbol.dispose] : null;
      const disposer = typeof asyncDispose === "function" ? asyncDispose :
        typeof syncDispose === "function" ? syncDispose :
        typeof instance.dispose === "function" ? instance.dispose : null;
      if (disposer) await disposer.call(instance);
    }
    this.state = "disposed";
    if (this.parent) this.parent.children.delete(this);
  }
}
async function runTests() {
  const root = new Container(); let singletonCalls = 0;
  root.register("settings", async () => {
    singletonCalls++; await Promise.resolve(); return { region: "ap-south-1" };
  }, { lifetime: "singleton" });
  const firstScope = root.createScope(), secondScope = root.createScope();
  firstScope.register("requestContext", () => ({ requestId: "one" }), { lifetime: "scoped" });
  const [settingsA, settingsB] = await Promise.all([
    firstScope.resolve("settings"), secondScope.resolve("settings")
  ]);
  assert(settingsA === settingsB); equal(singletonCalls, 1);
  const requestA = await firstScope.resolve("requestContext");
  const requestAAgain = await firstScope.resolve("requestContext");
  const requestB = await secondScope.resolve("requestContext").catch(() => null);
  assert(requestA === requestAAgain); equal(requestB, null);

  const disposed = [];
  firstScope.register("resourceA", () => ({ dispose() { disposed.push("A"); } }), { lifetime: "scoped" });
  firstScope.register("resourceB", async ({ resolve }) => {
    await resolve("resourceA"); return { dispose() { disposed.push("B"); } };
  }, { lifetime: "scoped" });
  await firstScope.resolve("resourceB"); await firstScope.dispose();
  equal(disposed.join(","), "B,A");

  root.register("cycleA", async ({ resolve }) => ({ other: await resolve("cycleB") }));
  root.register("cycleB", async ({ resolve }) => ({ other: await resolve("cycleA") }));
  let cycleDetected = false;
  try { await root.resolve("cycleA"); }
  catch (error) { cycleDetected = /circular dependency/.test(error.message); }
  assert(cycleDetected);
  assert(await secondScope.resolve("settings") === settingsA);
  await root.dispose();
  equal(root.state, "disposed"); equal(secondScope.state, "disposed");
  let rejected = false;
  try { await root.resolve("settings"); } catch (_) { rejected = true; }
  assert(rejected);
  console.log("Scoped DI container: all tests passed");
}
if (typeof module !== "undefined" && require.main === module) runTests().catch((error) => {
  console.error(error); process.exitCode = 1;
});
if (typeof module !== "undefined") module.exports = { Container };