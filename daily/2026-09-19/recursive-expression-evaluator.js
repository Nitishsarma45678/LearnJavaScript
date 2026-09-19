// Practice: Recursive Expression Evaluator
// Topics: recursion, closures, higher-order functions, array/object algorithms
// Challenge: Evaluate a small expression tree without using eval().

function createExpressionEvaluator(operations = {}) {
    const defaultOperations = {
        add: (a, b) => a + b,
        subtract: (a, b) => a - b,
        multiply: (a, b) => a * b,
        divide: (a, b) => {
            if (b === 0) {
                throw new Error("Division by zero is not allowed");
            }
            return a / b;
        },
        max: (...values) => Math.max(...values),
        min: (...values) => Math.min(...values),
    };

    const registry = { ...defaultOperations, ...operations };
    const memo = new WeakMap();

    function evaluate(node) {
        if (typeof node === "number") {
            return node;
        }

        if (!node || typeof node !== "object") {
            throw new TypeError("Expression node must be a number or object");
        }

        if (memo.has(node)) {
            return memo.get(node);
        }

        if (!registry[node.operation]) {
            throw new Error(`Unknown operation: ${node.operation}`);
        }

        if (!Array.isArray(node.args) || node.args.length === 0) {
            throw new Error(`Operation '${node.operation}' requires arguments`);
        }

        const values = node.args.map(evaluate);
        const result = registry[node.operation](...values);

        if (!Number.isFinite(result)) {
            throw new Error(`Operation '${node.operation}' produced an invalid result`);
        }

        memo.set(node, result);
        return result;
    }

    return {
        evaluate,
        addOperation(name, operation) {
            if (typeof name !== "string" || typeof operation !== "function") {
                throw new TypeError("Operation name and function are required");
            }
            registry[name] = operation;
        },
    };
}

const evaluator = createExpressionEvaluator();

const sharedSubExpression = {
    operation: "multiply",
    args: [6, 7],
};

const expression = {
    operation: "subtract",
    args: [
        {
            operation: "add",
            args: [sharedSubExpression, 10],
        },
        {
            operation: "max",
            args: [sharedSubExpression, 20, 5],
        },
    ],
};

console.log(evaluator.evaluate(expression)); // 32

// Custom higher-order operation.
evaluator.addOperation("average", (...values) => {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
});

const customExpression = {
    operation: "average",
    args: [10, { operation: "multiply", args: [3, 4] }, 20],
};

console.log(evaluator.evaluate(customExpression)); // 14.666...

// Uncomment to test cycle detection limitations intentionally:
// The exercise extension is to add cycle detection using a Set while
// preserving WeakMap memoization for shared sub-expressions.
