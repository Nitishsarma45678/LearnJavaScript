// JavaScript Practice — 2026-09-10
// Topic: Recursive deep cloning with prototypes, circular references,
// property descriptors, symbols, Map, Set, Date, and RegExp.

// Goal:
// Build a deepClone function without using structuredClone() or JSON.parse/stringify.
// The implementation should preserve object relationships and custom prototypes.

function deepClone(value, seen = new WeakMap()) {
    // Primitive values and functions are returned as-is.
    if (value === null || typeof value !== "object") {
        return value;
    }

    // Circular-reference protection.
    if (seen.has(value)) {
        return seen.get(value);
    }

    // Handle built-in objects that need special reconstruction.
    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    if (value instanceof RegExp) {
        const clone = new RegExp(value.source, value.flags);
        clone.lastIndex = value.lastIndex;
        return clone;
    }

    if (value instanceof Map) {
        const clone = new Map();
        seen.set(value, clone);

        for (const [key, mapValue] of value) {
            clone.set(deepClone(key, seen), deepClone(mapValue, seen));
        }

        return clone;
    }

    if (value instanceof Set) {
        const clone = new Set();
        seen.set(value, clone);

        for (const item of value) {
            clone.add(deepClone(item, seen));
        }

        return clone;
    }

    // Preserve the original prototype for class instances and custom objects.
    const clone = Array.isArray(value)
        ? []
        : Object.create(Object.getPrototypeOf(value));

    seen.set(value, clone);

    // Reflect.ownKeys() includes non-enumerable and Symbol properties.
    for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);

        if (!descriptor) {
            continue;
        }

        // Data descriptors contain a value that may itself need cloning.
        if ("value" in descriptor) {
            descriptor.value = deepClone(descriptor.value, seen);
        }

        // Define the descriptor instead of assigning directly so that
        // readonly, non-enumerable, getters/setters, etc. are preserved.
        Object.defineProperty(clone, key, descriptor);
    }

    return clone;
}

// -----------------------------------------------------------------------------
// Practice scenario: custom prototype + circular object graph + Map/Set
// -----------------------------------------------------------------------------

function User(name, role) {
    this.name = name;
    this.role = role;
}

User.prototype.describe = function () {
    return `${this.name} (${this.role})`;
};

const admin = new User("Aarav", "admin");

Object.defineProperty(admin, "internalId", {
    value: 7421,
    enumerable: false,
    writable: false,
    configurable: false,
});

const project = {
    name: "JavaScript Engine",
    owner: admin,
    tags: new Set(["javascript", "algorithms"]),
    metadata: new Map([
        ["priority", { level: "high" }],
        ["created", new Date("2026-09-10T00:00:00Z")],
    ]),
};

// Create a circular reference.
project.owner.project = project;
project.self = project;

const clonedProject = deepClone(project);

console.log("Original project:", project);
console.log("Cloned project:", clonedProject);

console.log("\n--- Checks ---");
console.log("Different top-level object:", clonedProject !== project);
console.log("Different owner object:", clonedProject.owner !== project.owner);
console.log("Prototype preserved:", Object.getPrototypeOf(clonedProject.owner) === User.prototype);
console.log("Prototype method works:", clonedProject.owner.describe());
console.log("Circular owner link preserved:", clonedProject.owner.project === clonedProject);
console.log("Self-reference preserved:", clonedProject.self === clonedProject);
console.log("Set cloned:", clonedProject.tags !== project.tags);
console.log("Map cloned:", clonedProject.metadata !== project.metadata);
console.log("Date cloned:", clonedProject.metadata.get("created") !== project.metadata.get("created"));
console.log("Non-enumerable property preserved:", Object.prototype.propertyIsEnumerable.call(clonedProject.owner, "internalId") === false);
console.log("Readonly property preserved:", Object.getOwnPropertyDescriptor(clonedProject.owner, "internalId").writable === false);

// Challenge extensions:
// 1. Add support for ArrayBuffer and typed arrays.
// 2. Preserve Error objects including custom properties.
// 3. Detect objects whose cloning would invoke dangerous getters and avoid
//    executing those getters during the clone.
// 4. Write a deepEqual() function that verifies the clone structurally matches
//    the source while also handling circular references.
