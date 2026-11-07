'use strict';

/**
 * Exercise: implement a small stack-based bytecode virtual machine.
 *
 * Features: lexical environments, closures, recursive calls, arithmetic,
 * conditional/unconditional jumps, arrays, property access, native functions,
 * instruction limits, and explicit call frames. Programs are data; no eval.
 *
 * Run: node 18-bytecode-virtual-machine.js
 */

const assert = require('node:assert/strict');

class Environment {
  constructor(parent = null) {
    this.parent = parent;
    this.bindings = new Map();
  }

  define(name, value) {
    if (this.bindings.has(name)) throw new Error('binding already defined: ' + name);
    this.bindings.set(name, value);
    return value;
  }

  get(name) {
    if (this.bindings.has(name)) return this.bindings.get(name);
    if (this.parent) return this.parent.get(name);
    throw new ReferenceError('unknown variable: ' + name);
  }

  assign(name, value) {
    if (this.bindings.has(name)) {
      this.bindings.set(name, value);
      return value;
    }
    if (this.parent) return this.parent.assign(name, value);
    throw new ReferenceError('cannot assign unknown variable: ' + name);
  }
}

class BytecodeVM {
  constructor(program, { maxSteps = 1_000_000, globals = {} } = {}) {
    if (!program || !Array.isArray(program.functions) || program.functions.length === 0) {
      throw new TypeError('program.functions must be a non-empty array');
    }
    if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) {
      throw new RangeError('maxSteps must be a positive safe integer');
    }
    this.program = program;
    this.maxSteps = maxSteps;
    this.globalEnv = new Environment();
    for (const [name, value] of Object.entries(globals)) this.globalEnv.define(name, value);
    for (const fn of program.functions) {
      if (!fn || !Array.isArray(fn.params) || !Array.isArray(fn.code)) {
        throw new TypeError('each function needs params and code arrays');
      }
      if (new Set(fn.params).size !== fn.params.length) {
        throw new SyntaxError('duplicate parameter in function ' + (fn.name || '<anonymous>'));
      }
    }
  }

  run(args = []) {
    return this._execute({ functionIndex: 0, environment: this.globalEnv }, args);
  }

  _execute(entry, args) {
    const makeFrame = (closure, values) => {
      const fn = this.program.functions[closure.functionIndex];
      if (!fn) throw new RangeError('invalid function index: ' + closure.functionIndex);
      if (values.length !== fn.params.length) {
        throw new TypeError((fn.name || 'function') + ' expects ' + fn.params.length + ' arguments');
      }
      const env = new Environment(closure.environment);
      fn.params.forEach((name, i) => env.define(name, values[i]));
      return { fn, ip: 0, env, stack: [] };
    };

    const rootClosure = { functionIndex: entry.functionIndex, environment: entry.environment };
    const frames = [makeFrame(rootClosure, args)];
    let steps = 0;

    while (frames.length) {
      if (++steps > this.maxSteps) throw new Error('instruction limit exceeded');
      const frame = frames[frames.length - 1];
      if (frame.ip < 0 || frame.ip >= frame.fn.code.length) {
        throw new Error('instruction pointer out of range in ' + (frame.fn.name || '<anonymous>'));
      }
      const instruction = frame.fn.code[frame.ip++];
      const stack = frame.stack;
      const pop = () => {
        if (stack.length === 0) throw new Error('operand stack underflow');
        return stack.pop();
      };

      switch (instruction.op) {
        case 'PUSH_CONST':
          stack.push(instruction.value);
          break;
        case 'LOAD':
          stack.push(frame.env.get(instruction.name));
          break;
        case 'DEFINE':
          frame.env.define(instruction.name, pop());
          break;
        case 'STORE': {
          const value = pop();
          frame.env.assign(instruction.name, value);
          break;
        }
        case 'POP':
          pop();
          break;
        case 'DUP': {
          const value = pop();
          stack.push(value, value);
          break;
        }
        case 'ADD': {
          const b = pop(), a = pop();
          stack.push(a + b);
          break;
        }
        case 'SUB': {
          const b = pop(), a = pop();
          stack.push(a - b);
          break;
        }
        case 'MUL': {
          const b = pop(), a = pop();
          stack.push(a * b);
          break;
        }
        case 'DIV': {
          const b = pop(), a = pop();
          if (b === 0) throw new RangeError('division by zero');
          stack.push(a / b);
          break;
        }
        case 'MOD': {
          const b = pop(), a = pop();
          if (b === 0) throw new RangeError('modulo by zero');
          stack.push(a % b);
          break;
        }
        case 'EQ': {
          const b = pop(), a = pop();
          stack.push(Object.is(a, b));
          break;
        }
        case 'LT': {
          const b = pop(), a = pop();
          stack.push(a < b);
          break;
        }
        case 'LTE': {
          const b = pop(), a = pop();
          stack.push(a <= b);
          break;
        }
        case 'GT': {
          const b = pop(), a = pop();
          stack.push(a > b);
          break;
        }
        case 'GTE': {
          const b = pop(), a = pop();
          stack.push(a >= b);
          break;
        }
        case 'NOT':
          stack.push(!pop());
          break;
        case 'NEG':
          stack.push(-pop());
          break;
        case 'JUMP':
          frame.ip = instruction.target;
          break;
        case 'JUMP_IF_FALSE':
          if (!pop()) frame.ip = instruction.target;
          break;
        case 'MAKE_CLOSURE':
          if (!this.program.functions[instruction.functionIndex]) {
            throw new RangeError('invalid closure function index');
          }
          stack.push({
            __vmClosure: true,
            functionIndex: instruction.functionIndex,
            environment: frame.env
          });
          break;
        case 'CALL': {
          if (!Number.isSafeInteger(instruction.argc) || instruction.argc < 0) {
            throw new RangeError('CALL argc must be a non-negative integer');
          }
          const callArgs = new Array(instruction.argc);
          for (let i = instruction.argc - 1; i >= 0; i--) callArgs[i] = pop();
          const callee = pop();
          if (callee && callee.__vmClosure === true) {
            frames.push(makeFrame(callee, callArgs));
          } else if (typeof callee === 'function') {
            stack.push(callee(...callArgs));
          } else {
            throw new TypeError('value is not callable');
          }
          break;
        }
        case 'BUILD_ARRAY': {
          if (!Number.isSafeInteger(instruction.count) || instruction.count < 0) {
            throw new RangeError('BUILD_ARRAY count must be non-negative');
          }
          const values = new Array(instruction.count);
          for (let i = instruction.count - 1; i >= 0; i--) values[i] = pop();
          stack.push(values);
          break;
        }
        case 'GET_PROP': {
          const object = pop();
          if (object === null || object === undefined) throw new TypeError('cannot read property of nullish value');
          stack.push(object[instruction.key]);
          break;
        }
        case 'SET_PROP': {
          const value = pop(), object = pop();
          if ((typeof object !== 'object' && typeof object !== 'function') || object === null) {
            throw new TypeError('SET_PROP target must be an object');
          }
          object[instruction.key] = value;
          stack.push(value);
          break;
        }
        case 'RETURN': {
          const value = stack.length ? pop() : undefined;
          frames.pop();
          if (frames.length === 0) return value;
          frames[frames.length - 1].stack.push(value);
          break;
        }
        default:
          throw new Error('unknown opcode: ' + instruction.op);
      }
    }
    return undefined;
  }
}

function runTests() {
  const factorialProgram = {
    functions: [
      {
        name: 'main',
        params: [],
        code: [
          { op: 'MAKE_CLOSURE', functionIndex: 1 },
          { op: 'DEFINE', name: 'fact' },
          { op: 'LOAD', name: 'fact' },
          { op: 'PUSH_CONST', value: 6 },
          { op: 'CALL', argc: 1 },
          { op: 'RETURN' }
        ]
      },
      {
        name: 'factorial',
        params: ['n'],
        code: [
          { op: 'LOAD', name: 'n' },
          { op: 'PUSH_CONST', value: 1 },
          { op: 'LTE' },
          { op: 'JUMP_IF_FALSE', target: 6 },
          { op: 'PUSH_CONST', value: 1 },
          { op: 'RETURN' },
          { op: 'LOAD', name: 'n' },
          { op: 'LOAD', name: 'fact' },
          { op: 'LOAD', name: 'n' },
          { op: 'PUSH_CONST', value: 1 },
          { op: 'SUB' },
          { op: 'CALL', argc: 1 },
          { op: 'MUL' },
          { op: 'RETURN' }
        ]
      }
    ]
  };
  assert.equal(new BytecodeVM(factorialProgram).run(), 720);

  const closureProgram = {
    functions: [
      {
        name: 'main',
        params: [],
        code: [
          { op: 'PUSH_CONST', value: 10 },
          { op: 'DEFINE', name: 'base' },
          { op: 'MAKE_CLOSURE', functionIndex: 1 },
          { op: 'DEFINE', name: 'addBase' },
          { op: 'LOAD', name: 'addBase' },
          { op: 'PUSH_CONST', value: 32 },
          { op: 'CALL', argc: 1 },
          { op: 'RETURN' }
        ]
      },
      {
        name: 'addBase',
        params: ['amount'],
        code: [
          { op: 'LOAD', name: 'base' },
          { op: 'LOAD', name: 'amount' },
          { op: 'ADD' },
          { op: 'RETURN' }
        ]
      }
    ]
  };
  assert.equal(new BytecodeVM(closureProgram).run(), 42);

  const counterProgram = {
    functions: [
      {
        name: 'main',
        params: [],
        code: [
          { op: 'PUSH_CONST', value: 0 },
          { op: 'DEFINE', name: 'count' },
          { op: 'MAKE_CLOSURE', functionIndex: 1 },
          { op: 'DEFINE', name: 'increment' },
          { op: 'LOAD', name: 'increment' },
          { op: 'CALL', argc: 0 },
          { op: 'LOAD', name: 'increment' },
          { op: 'CALL', argc: 0 },
          { op: 'ADD' },
          { op: 'RETURN' }
        ]
      },
      {
        name: 'increment',
        params: [],
        code: [
          { op: 'LOAD', name: 'count' },
          { op: 'PUSH_CONST', value: 1 },
          { op: 'ADD' },
          { op: 'DUP' },
          { op: 'STORE', name: 'count' },
          { op: 'RETURN' }
        ]
      }
    ]
  };
  assert.equal(new BytecodeVM(counterProgram).run(), 3);

  const nativeProgram = {
    functions: [{
      name: 'main',
      params: ['x'],
      code: [
        { op: 'LOAD', name: 'double' },
        { op: 'LOAD', name: 'x' },
        { op: 'CALL', argc: 1 },
        { op: 'RETURN' }
      ]
    }]
  };
  assert.equal(new BytecodeVM(nativeProgram, { globals: { double: x => x * 2 } }).run([21]), 42);
  assert.throws(() => new BytecodeVM(factorialProgram, { maxSteps: 4 }).run(), /instruction limit/);
  assert.throws(() => new BytecodeVM({ functions: [{ params: [], code: [{ op: 'BOGUS' }] }] }).run(), /unknown opcode/);
}

runTests();
module.exports = { BytecodeVM, Environment };
