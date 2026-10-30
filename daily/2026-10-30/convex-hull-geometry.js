/*
 * Monotone-chain convex hull and point-in-polygon classification.
 * Hull construction is O(n log n). Collinear boundary points can be retained.
 */
function point2D(point) {
  if (!Array.isArray(point) || point.length !== 2 ||
      typeof point[0] !== "number" || !Number.isFinite(point[0]) ||
      typeof point[1] !== "number" || !Number.isFinite(point[1])) {
    throw new TypeError("point must be a finite [x, y] pair");
  }
  return [point[0] === 0 ? 0 : point[0], point[1] === 0 ? 0 : point[1]];
}
function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) -
         (a[1] - o[1]) * (b[0] - o[0]);
}
function convexHull(points, { includeCollinear = false } = {}) {
  if (!Array.isArray(points)) throw new TypeError("points must be an array");
  if (typeof includeCollinear !== "boolean") throw new TypeError("includeCollinear must be boolean");
  const unique = new Map();
  for (const raw of points) {
    const p = point2D(raw);
    unique.set(JSON.stringify(p), p);
  }
  const sorted = Array.from(unique.values()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 1) return sorted;
  const allCollinear = sorted.every(p => cross(sorted[0], sorted[sorted.length - 1], p) === 0);
  if (allCollinear) {
    return includeCollinear ? sorted : [sorted[0], sorted[sorted.length - 1]];
  }
  const pop = value => includeCollinear ? value < 0 : value <= 0;
  const lower = [], upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 &&
           pop(cross(lower[lower.length - 2], lower[lower.length - 1], p))) lower.pop();
    lower.push(p);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 &&
           pop(cross(upper[upper.length - 2], upper[upper.length - 1], p))) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
function onSegment(p, a, b) {
  return cross(a, b, p) === 0 &&
    p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}
function classifyPoint(rawPoint, polygon) {
  const p = point2D(rawPoint);
  if (!Array.isArray(polygon)) throw new TypeError("polygon must be an array");
  const vertices = polygon.map(point2D), n = vertices.length;
  if (!n) return "outside";
  if (n === 1) return p[0] === vertices[0][0] && p[1] === vertices[0][1]
    ? "boundary" : "outside";
  if (n === 2) return onSegment(p, vertices[0], vertices[1]) ? "boundary" : "outside";
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = vertices[j], b = vertices[i];
    if (onSegment(p, a, b)) return "boundary";
    if ((a[1] > p[1]) !== (b[1] > p[1])) {
      const x = a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
      if (p[0] < x) inside = !inside;
    }
  }
  return inside ? "inside" : "outside";
}
function assert(ok, message) { if (!ok) throw new Error(message || "assertion failed"); }
function same(a, b) { assert(JSON.stringify(a) === JSON.stringify(b), "point list mismatch"); }
async function runTests() {
  const input = [[0,0],[2,0],[2,2],[0,2],[1,1],[1,0],[0,0],[1,2]];
  const hull = convexHull(input);
  same(hull, [[0,0],[2,0],[2,2],[0,2]]);
  assert(classifyPoint([1,1], hull) === "inside");
  assert(classifyPoint([2,1], hull) === "boundary");
  assert(classifyPoint([3,1], hull) === "outside");
  same(convexHull(input, { includeCollinear: true }),
       [[0,0],[1,0],[2,0],[2,2],[1,2],[0,2]]);
  same(convexHull([[3,3],[1,1],[2,2],[1,1]]), [[1,1],[3,3]]);
  same(convexHull([[3,3],[1,1],[2,2]], { includeCollinear: true }),
       [[1,1],[2,2],[3,3]]);
  same(convexHull([]), []);
  assert(classifyPoint([1,0], [[0,0],[2,0]]) === "boundary");
}
if (typeof module !== "undefined" && require.main === module) {
  runTests().then(() => console.log("convex-hull-geometry: tests passed"))
    .catch(e => { console.error(e); process.exitCode = 1; });
}
