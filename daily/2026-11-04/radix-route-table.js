'use strict';

const assert = require('node:assert/strict');

class RouteNode {
  constructor() {
    this.staticChildren = new Map();
    this.paramChild = null;
    this.paramName = null;
    this.wildcardChild = null;
    this.wildcardName = null;
    this.handlers = new Map();
  }
}

function pathSegments(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new TypeError('Route paths must be absolute strings');
  }
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname.split('/').filter(Boolean);
}

class RouteTable {
  constructor() {
    this.root = new RouteNode();
  }

  add(method, pattern, handler) {
    if (typeof method !== 'string' || !method.trim()) throw new TypeError('method is required');
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const verb = method.toUpperCase();
    const segments = pathSegments(pattern);
    let node = this.root;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (segment.startsWith(':')) {
        const name = segment.slice(1);
        if (!name || name.includes('*')) throw new TypeError('Invalid parameter segment');
        if (node.paramChild && node.paramName !== name) {
          throw new Error('Ambiguous parameter names at the same route position');
        }
        if (!node.paramChild) {
          node.paramChild = new RouteNode();
          node.paramName = name;
        }
        node = node.paramChild;
      } else if (segment.startsWith('*')) {
        const name = segment.slice(1);
        if (!name || index !== segments.length - 1) {
          throw new TypeError('Wildcard must have a name and be the final segment');
        }
        if (node.wildcardChild && node.wildcardName !== name) {
          throw new Error('Ambiguous wildcard names at the same route position');
        }
        if (!node.wildcardChild) {
          node.wildcardChild = new RouteNode();
          node.wildcardName = name;
        }
        node = node.wildcardChild;
      } else {
        if (!node.staticChildren.has(segment)) {
          node.staticChildren.set(segment, new RouteNode());
        }
        node = node.staticChildren.get(segment);
      }
    }

    if (node.handlers.has(verb)) throw new Error(`Duplicate route: ${verb} ${pattern}`);
    node.handlers.set(verb, handler);
    return this;
  }

  match(method, path) {
    if (typeof method !== 'string') throw new TypeError('method must be a string');
    const segments = pathSegments(path);
    const verb = method.toUpperCase();

    const search = (node, index, params) => {
      if (index === segments.length && node.handlers.has(verb)) {
        return { handler: node.handlers.get(verb), params };
      }

      if (index < segments.length) {
        const staticChild = node.staticChildren.get(segments[index]);
        if (staticChild) {
          const found = search(staticChild, index + 1, params);
          if (found) return found;
        }

        if (node.paramChild) {
          const nextParams = { ...params, [node.paramName]: segments[index] };
          const found = search(node.paramChild, index + 1, nextParams);
          if (found) return found;
        }
      }

      if (node.wildcardChild) {
        const nextParams = {
          ...params,
          [node.wildcardName]: segments.slice(index).join('/')
        };
        const found = search(node.wildcardChild, segments.length, nextParams);
        if (found) return found;
      }
      return null;
    };

    return search(this.root, 0, {});
  }
}

if (require.main === module) {
  const routes = new RouteTable();
  routes
    .add('GET', '/users/:id', ({ id }) => `user:${id}`)
    .add('GET', '/users/new', () => 'new-user')
    .add('GET', '/users/:id/posts/:postId', ({ id, postId }) => `${id}/${postId}`)
    .add('GET', '/files/*path', ({ path }) => path)
    .add('POST', '/users/:id', ({ id }) => `created:${id}`);

  const userMatch = routes.match('GET', '/users/42');
  assert.equal(routes.match('GET', '/users/new').handler({}), 'new-user');
  assert.equal(userMatch.handler(userMatch.params), 'user:42');
  assert.deepEqual(routes.match('GET', '/users/7/posts/9').params, { id: '7', postId: '9' });
  const fileMatch = routes.match('GET', '/files/a/b.txt');
  assert.equal(fileMatch.handler(fileMatch.params), 'a/b.txt');
  assert.deepEqual(routes.match('GET', '/files').params, { path: '' });
  assert.equal(routes.match('DELETE', '/users/42'), null);
  assert.throws(() => routes.add('GET', '/users/:slug', () => {}), /Ambiguous/);
  assert.throws(() => routes.add('GET', '/files/*rest/more', () => {}), /final/);
  console.log('Radix route table tests passed');
}

module.exports = { RouteTable };
