// JavaScript Practice — 2026-09-10
// Topic: Recursive JSON querying, higher-order functions, path matching,
// filtering, and immutable result construction.

// Goal:
// Build a small query engine that walks an arbitrarily nested object/array,
// finds values matching a predicate, and returns useful paths to those values.
// The traversal must be recursive and should not mutate the input structure.

function queryJson(root, predicate, options = {}) {
    const {
        includeContainers = false,
        maxDepth = Infinity,
    } = options;

    const matches = [];
    const visited = new WeakSet();

    function visit(value, path, depth) {
        if (depth > maxDepth) {
            return;
        }

        const isObject = value !== null && typeof value === "object";

        if (!isObject) {
            if (predicate(value, path, depth)) {
                matches.push({ value, path: [...path], depth });
            }
            return;
        }

        // Protect the recursive walk from circular references.
        if (visited.has(value)) {
            return;
        }
        visited.add(value);

        if (includeContainers && predicate(value, path, depth)) {
            matches.push({ value, path: [...path], depth });
        }

        const entries = Array.isArray(value)
            ? value.entries()
            : Object.entries(value);

        for (const [key, child] of entries) {
            visit(child, [...path, key], depth + 1);
        }
    }

    visit(root, [], 0);
    return matches;
}

// Higher-order helper: convert query results into a lookup object.
function indexByPath(results) {
    return results.reduce((index, result) => {
        const path = result.path.length === 0 ? "$" : result.path.join(".");
        index[path] = result.value;
        return index;
    }, {});
}

// Higher-order helper: compose multiple predicates into one.
function everyPredicate(...predicates) {
    return (value, path, depth) =>
        predicates.every((predicate) => predicate(value, path, depth));
}

// -----------------------------------------------------------------------------
// Practice scenario: nested API-style data
// -----------------------------------------------------------------------------

const data = {
    users: [
        {
            id: 101,
            name: "Aarav",
            active: true,
            skills: ["JavaScript", "Node.js"],
            profile: { score: 91, city: "Guwahati" },
        },
        {
            id: 102,
            name: "Mira",
            active: false,
            skills: ["Python", "JavaScript"],
            profile: { score: 87, city: "Kolkata" },
        },
        {
            id: 103,
            name: "Rohan",
            active: true,
            skills: ["TypeScript", "JavaScript"],
            profile: { score: 96, city: "Guwahati" },
        },
    ],
    metadata: {
        version: 3,
        generatedBy: "practice-engine",
    },
};

// Query 1: recursively find every occurrence of "JavaScript".
const javascriptMatches = queryJson(
    data,
    (value) => value === "JavaScript"
);

console.log("JavaScript paths:");
console.log(javascriptMatches.map((match) => match.path.join(".")));

// Query 2: find numeric values greater than 90.
const highScores = queryJson(
    data,
    (value) => typeof value === "number" && value > 90
);

console.log("\nHigh-score index:");
console.log(indexByPath(highScores));

// Query 3: combine predicates to find active users' numeric IDs.
const activeUserIdPaths = queryJson(
    data,
    everyPredicate(
        (value) => typeof value === "number",
        (value, path) => path.includes("id")
    )
);

console.log("\nNumeric ID paths:");
console.log(activeUserIdPaths.map((match) => match.path.join(".")));

// Query 4: demonstrate depth limiting.
const shallowStrings = queryJson(
    data,
    (value) => typeof value === "string",
    { maxDepth: 2 }
);

console.log("\nStrings found at depth <= 2:");
console.log(shallowStrings.map(({ value, path, depth }) => ({
    value,
    path: path.join("."),
    depth,
})));

// Circular-reference check: the input remains untouched and traversal terminates.
const circular = { name: "root", child: { value: 42 } };
circular.child.parent = circular;

const circularMatches = queryJson(
    circular,
    (value) => value === 42
);

console.log("\nCircular-reference query:");
console.log(circularMatches);

// Challenge extensions:
// 1. Add wildcard path matching, e.g. users.*.profile.score.
// 2. Support a query language such as { key: "score", gt: 90 }.
// 3. Preserve Symbol keys during traversal.
// 4. Add breadth-first traversal and compare its memory characteristics.
// 5. Add a generator-based version that yields matches lazily instead of
//    storing every match in memory.
