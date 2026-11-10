/*
 * Async Dependency Injection Container
 * -------------------------------------
 * Supports singleton, scoped, and transient registrations; asynchronous
 * factories; concurrent singleton/scoped resolution; dependency graphs;
 * circular-dependency detection; child scopes; and deterministic disposal.
 *
 * Singleton factories resolve from the root container. A singleton is not
 * allowed to capture a scoped dependency, preventing a captive-dependency
 * lifetime bug. Factories receive resolved dependencies positionally and a
 * final context object containing resolve(), container, and scope.
 */

"use strict";

const assert = require("node:assert/strict");

const VALID_LIFETIMES = new Set(["singleton", "scoped", "transient"]);

class AsyncDependencyContainer {
  constructor({ root = null, parent = null } = {}) {
    this.parent = parent;
    this.root = root || this;
    this.cache = new Map();
    this.instances = [];
    this.children = [];
    this.closed = false;

    if (this.root === this) {
      this.registrations = new Map();
      this.disposedInstances = new WeakSet();
    } else {
      this.registrations = null;
    }

    if (parent) parent.children.push(this);
  }

  _assertOpen() {
    if (this.closed || this.root.closed) {
      throw new Error("Container or scope has been disposed");
    }
  }

  register(token, {
    factory,
    deps = [],
    lifetime = "transient",
    dispose
  } = {}) {
    this._assertOpen();
    if (this !== this.root) {
      throw new Error("Registrations must be added to the root container");
    }
    if (typeof factory !== "function") {
      throw new TypeError("Registration factory must be a function");
    }
    if (!Array.isArray(deps)) {
      throw new TypeError("deps must be an array of tokens");
    }
    if (!VALID_LIFETIMES.has(lifetime)) {
      throw new RangeError("Unknown lifetime: " + lifetime);
    }
    if (dispose !== undefined && typeof dispose !== "function") {
      throw new TypeError("dispose must be a function");
    }
    if (this.registrations.has(token)) {
      throw new Error("Token is already registered");
    }

    this.registrations.set(token, {
      factory,
      deps: deps.slice(),
      lifetime,
      dispose
    });
    return this;
  }

  registerValue(token, value) {
    return this.register(token, {
      lifetime: "singleton",
      factory: () => value
    });
  }

  createScope() {
    this._assertOpen();
    return new AsyncDependencyContainer({
      root: this.root,
      parent: this
    });
  }

  resolve(token) {
    return this._resolve(token, []);
  }

  async _resolve(token, chain) {
    this._assertOpen();

    if (chain.some(parentToken => Object.is(parentToken, token))) {
      const cycle = chain.concat([token]).map(String).join(" -> ");
      throw new Error("Circular dependency detected: " + cycle);
    }

    const registration = this.root.registrations.get(token);
    if (!registration) {
      throw new Error("No registration for token: " + String(token));
    }

    if (
      registration.lifetime === "scoped" &&
      chain.some(parentToken => {
        const parentRegistration = this.root.registrations.get(parentToken);
        return parentRegistration &&
          parentRegistration.lifetime === "singleton";
      })
    ) {
      throw new Error(
        "A singleton cannot depend on a scoped service: " + String(token)
      );
    }

    const owner = registration.lifetime === "singleton" ? this.root : this;
    if (owner.closed) {
      throw new Error("The owning container has been disposed");
    }

    if (
      registration.lifetime !== "transient" &&
      owner.cache.has(token)
    ) {
      return owner.cache.get(token);
    }

    // A singleton's dependency graph belongs to the root. Scoped and
    // transient registrations resolve relative to the requesting scope.
    const resolutionScope =
      registration.lifetime === "singleton" ? this.root : this;
    const nextChain = chain.concat([token]);

    const pending = (async () => {
      const dependencies = await Promise.all(
        registration.deps.map(dependency =>
          resolutionScope._resolve(dependency, nextChain)
        )
      );

      const context = {
        container: this.root,
        scope: resolutionScope,
        resolve: dependency =>
          resolutionScope._resolve(dependency, nextChain)
      };

      const instance = await registration.factory(...dependencies, context);
      owner.instances.push({
        token,
        instance,
        dispose: registration.dispose
      });
      return instance;
    })();

    if (registration.lifetime !== "transient") {
      owner.cache.set(token, pending);
    }

    try {
      return await pending;
    } catch (error) {
      if (
        registration.lifetime !== "transient" &&
        owner.cache.get(token) === pending
      ) {
        owner.cache.delete(token);
      }
      throw error;
    }
  }

  async _disposeInstance(entry) {
    const instance = entry.instance;
    const isObject =
      instance !== null &&
      (typeof instance === "object" || typeof instance === "function");

    if (isObject) {
      if (this.root.disposedInstances.has(instance)) return;
      this.root.disposedInstances.add(instance);
    }

    if (entry.dispose) {
      await entry.dispose(instance);
      return;
    }

    if (!isObject) return;

    const asyncSymbol = Symbol.asyncDispose;
    const syncSymbol = Symbol.dispose;

    if (
      typeof asyncSymbol === "symbol" &&
      typeof instance[asyncSymbol] === "function"
    ) {
      await instance[asyncSymbol]();
    } else if (
      typeof syncSymbol === "symbol" &&
      typeof instance[syncSymbol] === "function"
    ) {
      instance[syncSymbol]();
    } else if (typeof instance.dispose === "function") {
      await instance.dispose();
    }
  }

  async dispose() {
    if (this.closed) return false;
    this.closed = true;

    const errors = [];

    // Child scopes are disposed before their parent scope.
    for (let index = this.children.length - 1; index >= 0; index -= 1) {
      try {
        await this.children[index].dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.children.length = 0;

    // Instances are released in reverse successful-resolution order.
    for (let index = this.instances.length - 1; index >= 0; index -= 1) {
      try {
        await this._disposeInstance(this.instances[index]);
      } catch (error) {
        errors.push(error);
      }
    }

    this.instances.length = 0;
    this.cache.clear();

    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index !== -1) this.parent.children.splice(index, 1);
    }

    if (errors.length) {
      throw new AggregateError(errors, "One or more disposers failed");
    }
    return true;
  }
}

async function runTests() {
  const container = new AsyncDependencyContainer();
  let singletonCalls = 0;
  let scopedCalls = 0;
  let transientCalls = 0;

  container.register("singleton", {
    lifetime: "singleton",
    factory: async () => {
      await Promise.resolve();
      singletonCalls += 1;
      return { id: singletonCalls };
    }
  });
  container.register("scoped", {
    lifetime: "scoped",
    factory: () => ({ id: ++scopedCalls })
  });
  container.register("transient", {
    lifetime: "transient",
    factory: () => ({ id: ++transientCalls })
  });

  const scopeA = container.createScope();
  const scopeB = container.createScope();

  const [singletonA, singletonB] = await Promise.all([
    scopeA.resolve("singleton"),
    scopeB.resolve("singleton")
  ]);
  assert.strictEqual(singletonA, singletonB);
  assert.equal(singletonCalls, 1);

  const scopedA1 = await scopeA.resolve("scoped");
  const scopedA2 = await scopeA.resolve("scoped");
  const scopedB = await scopeB.resolve("scoped");
  assert.strictEqual(scopedA1, scopedA2);
  assert.notStrictEqual(scopedA1, scopedB);

  const transient1 = await scopeA.resolve("transient");
  const transient2 = await scopeA.resolve("transient");
  assert.notStrictEqual(transient1, transient2);
  assert.equal(transientCalls, 2);

  container.register("needsScoped", {
    lifetime: "singleton",
    deps: ["scoped"],
    factory: scoped => ({ scoped })
  });
  await assert.rejects(
    scopeA.resolve("needsScoped"),
    /cannot depend on a scoped service/
  );

  container.register("cycleA", {
    deps: ["cycleB"],
    factory: value => value
  });
  container.register("cycleB", {
    deps: ["cycleA"],
    factory: value => value
  });
  await assert.rejects(
    container.resolve("cycleA"),
    /Circular dependency detected/
  );

  let attempts = 0;
  container.register("flaky", {
    lifetime: "singleton",
    factory: () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
      return { ready: true };
    }
  });
  await assert.rejects(container.resolve("flaky"), /temporary failure/);
  assert.deepEqual(await container.resolve("flaky"), { ready: true });
  assert.equal(attempts, 2);

  // Disposers run child-first, then in reverse order within each scope.
  const disposalOrder = [];
  container.register("firstResource", {
    lifetime: "scoped",
    factory: () => ({ dispose: () => disposalOrder.push("first") })
  });
  container.register("secondResource", {
    lifetime: "scoped",
    factory: () => ({ dispose: () => disposalOrder.push("second") })
  });
  container.register("childResource", {
    lifetime: "scoped",
    factory: () => ({ dispose: () => disposalOrder.push("child") })
  });
  container.register("rootResource", {
    lifetime: "singleton",
    factory: () => ({ dispose: () => disposalOrder.push("root") })
  });

  await container.resolve("rootResource");
  const disposalScope = container.createScope();
  await disposalScope.resolve("firstResource");
  await disposalScope.resolve("secondResource");
  const childScope = disposalScope.createScope();
  await childScope.resolve("childResource");

  await disposalScope.dispose();
  assert.deepEqual(disposalOrder, ["child", "second", "first"]);
  await container.dispose();
  assert.deepEqual(disposalOrder, ["child", "second", "first", "root"]);
  assert.equal(await container.dispose(), false);
  await assert.rejects(scopeA.resolve("singleton"), /disposed/);

  console.log("AsyncDependencyContainer: all tests passed");
}

module.exports = { AsyncDependencyContainer };

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}