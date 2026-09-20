/**
 * PROTOTYPE-BASED LRU CACHE
 *
 * Practice challenge:
 * Build an LRU cache from scratch using JavaScript prototypes.
 * The cache must support O(1) get/set operations, evict the least
 * recently used entry when capacity is reached, expire entries by TTL,
 * and expose statistics without leaking its internal linked-list state.
 *
 * Concepts:
 * - Prototypes and constructor functions
 * - Closures / encapsulation
 * - Doubly linked-list algorithms
 * - Map-based O(1) lookup
 * - Object/array state management
 * - Non-trivial data-structure problem solving
 */

function CacheNode(key, value, expiresAt) {
    this.key = key;
    this.value = value;
    this.expiresAt = expiresAt;
    this.prev = null;
    this.next = null;
}

function LRUCache(capacity, ttl = 0) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
        throw new RangeError("Capacity must be a positive integer");
    }

    const store = new Map();
    const head = new CacheNode(null, null, 0);
    const tail = new CacheNode(null, null, 0);
    let hits = 0;
    let misses = 0;
    let evictions = 0;

    head.next = tail;
    tail.prev = head;

    function isExpired(node) {
        return ttl > 0 && Date.now() >= node.expiresAt;
    }

    function unlink(node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
        node.prev = null;
        node.next = null;
    }

    function insertAtFront(node) {
        node.next = head.next;
        node.prev = head;
        head.next.prev = node;
        head.next = node;
    }

    function touch(node) {
        unlink(node);
        insertAtFront(node);
    }

    function removeNode(node) {
        unlink(node);
        store.delete(node.key);
    }

    function removeLeastRecentlyUsed() {
        const node = tail.prev;
        if (node === head) return;
        removeNode(node);
        evictions++;
    }

    this.get = function (key) {
        const node = store.get(key);

        if (!node) {
            misses++;
            return undefined;
        }

        if (isExpired(node)) {
            removeNode(node);
            misses++;
            return undefined;
        }

        hits++;
        touch(node);
        return node.value;
    };

    this.set = function (key, value) {
        const existing = store.get(key);
        const expiresAt = ttl > 0 ? Date.now() + ttl : Infinity;

        if (existing) {
            existing.value = value;
            existing.expiresAt = expiresAt;
            touch(existing);
            return this;
        }

        const node = new CacheNode(key, value, expiresAt);
        store.set(key, node);
        insertAtFront(node);

        if (store.size > capacity) {
            removeLeastRecentlyUsed();
        }

        return this;
    };

    this.has = function (key) {
        return this.get(key) !== undefined;
    };

    this.delete = function (key) {
        const node = store.get(key);
        if (!node) return false;
        removeNode(node);
        return true;
    };

    this.size = function () {
        return store.size;
    };

    this.stats = function () {
        return {
            size: store.size,
            hits,
            misses,
            evictions
        };
    };

    this.keys = function () {
        const keys = [];
        let current = head.next;

        while (current !== tail) {
            if (isExpired(current)) {
                const expired = current;
                current = current.next;
                removeNode(expired);
                continue;
            }

            keys.push(current.key);
            current = current.next;
        }

        return keys;
    };
}

// ------------------------------------------------------------
// Example usage
// ------------------------------------------------------------

const cache = new LRUCache(3, 2000);

cache.set("user:101", { name: "Asha" });
cache.set("user:102", { name: "Rohan" });
cache.set("user:103", { name: "Mira" });

console.log(cache.get("user:101"));

// user:102 is now the least recently used entry.
cache.set("user:104", { name: "Kabir" });

console.log("Keys from most to least recently used:", cache.keys());
console.log("Missing key:", cache.get("user:102"));
console.log("Stats:", cache.stats());

// Updating an existing key also moves it to the front.
cache.set("user:103", { name: "Mira Updated" });
console.log("After update:", cache.keys());

setTimeout(() => {
    console.log("After TTL expiration:", cache.keys());
    console.log("Final stats:", cache.stats());
}, 2100);
