/**
 * Practice: Sliding-Window Event Analyzer
 *
 * Build a reusable analyzer for timestamped events.
 *
 * Concepts:
 * - closures for private state
 * - higher-order functions
 * - Map / Set based aggregation
 * - sliding-window algorithms
 * - sorting and object transformation
 * - non-trivial array processing
 *
 * The analyzer accepts events in any order, normalizes them, and exposes
 * functions for finding the busiest windows and suspiciously repeated users.
 */

function createEventAnalyzer(events = []) {
  let data = [...events];

  const normalize = event => ({
    user: String(event.user),
    type: String(event.type),
    timestamp: Number(event.timestamp)
  });

  const sortedEvents = () =>
    data
      .map(normalize)
      .filter(event => Number.isFinite(event.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);

  return {
    add(event) {
      data.push(normalize(event));
    },

    replace(events) {
      data = events.map(normalize);
    },

    countByType() {
      return sortedEvents().reduce((counts, event) => {
        counts[event.type] = (counts[event.type] || 0) + 1;
        return counts;
      }, {});
    },

    busiestWindow(windowMs = 60_000) {
      const events = sortedEvents();
      let left = 0;
      let best = null;

      for (let right = 0; right < events.length; right++) {
        while (
          events[right].timestamp - events[left].timestamp >= windowMs
        ) {
          left++;
        }

        const count = right - left + 1;

        if (!best || count > best.count) {
          best = {
            count,
            start: events[left].timestamp,
            end: events[right].timestamp,
            events: events.slice(left, right + 1)
          };
        }
      }

      return best;
    },

    repeatedUsers(minEvents = 3) {
      const users = sortedEvents().reduce((map, event) => {
        const list = map.get(event.user) || [];
        list.push(event);
        map.set(event.user, list);
        return map;
      }, new Map());

      return [...users.entries()]
        .filter(([, events]) => events.length >= minEvents)
        .map(([user, events]) => ({
          user,
          eventCount: events.length,
          types: [...new Set(events.map(event => event.type))]
        }))
        .sort((a, b) => b.eventCount - a.eventCount);
    },

    snapshot() {
      return sortedEvents().map(event => ({ ...event }));
    }
  };
}

// Example
const analyzer = createEventAnalyzer([
  { user: "alice", type: "login", timestamp: 1000 },
  { user: "bob", type: "login", timestamp: 1500 },
  { user: "alice", type: "purchase", timestamp: 2000 },
  { user: "alice", type: "logout", timestamp: 4000 },
  { user: "bob", type: "purchase", timestamp: 5000 },
  { user: "alice", type: "login", timestamp: 7000 },
  { user: "carol", type: "login", timestamp: 9000 }
]);

console.log("Counts:", analyzer.countByType());
console.log("Busiest window:", analyzer.busiestWindow(5000));
console.log("Repeated users:", analyzer.repeatedUsers(3));
