// Exercise: Implement deterministic selection using the median-of-medians pivot.
// Return the k-th smallest value (zero-based) without sorting the entire input.

function selectKth(values, k) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("values must be a non-empty array");
  }
  if (!Number.isInteger(k) || k < 0 || k >= values.length) {
    throw new RangeError("k is outside the array");
  }
  const array = values.slice();

  function choose(targetArray, targetIndex) {
    let left = 0;
    let right = targetArray.length - 1;

    while (left <= right) {
      if (right - left < 5) {
        const sorted = targetArray.slice(left, right + 1).sort((a, b) => a - b);
        return sorted[targetIndex - left];
      }

      const medians = [];
      for (let start = left; start <= right; start += 5) {
        const group = targetArray.slice(start, Math.min(start + 5, right + 1));
        group.sort((a, b) => a - b);
        medians.push(group[Math.floor(group.length / 2)]);
      }
      const pivot = choose(medians, Math.floor(medians.length / 2));

      let low = left;
      let scan = left;
      let high = right;
      while (scan <= high) {
        if (targetArray[scan] < pivot) {
          [targetArray[low], targetArray[scan]] = [targetArray[scan], targetArray[low]];
          low++;
          scan++;
        } else if (targetArray[scan] > pivot) {
          [targetArray[scan], targetArray[high]] = [targetArray[high], targetArray[scan]];
          high--;
        } else {
          scan++;
        }
      }

      if (targetIndex < low) right = low - 1;
      else if (targetIndex > high) left = high + 1;
      else return pivot;
    }
    throw new Error("selection invariant failed");
  }

  return choose(array, k);
}

// Tests
const assert = require("node:assert/strict");
const data = [12, 3, 5, 7, 4, 19, 26, 1, 5, 5, -2, 100];
const sorted = data.slice().sort((a, b) => a - b);
for (let k = 0; k < data.length; k++) {
  assert.equal(selectKth(data, k), sorted[k]);
}
assert.equal(selectKth([9, 9, 1, 9, 2], 3), 9);
assert.throws(() => selectKth([], 0), TypeError);
assert.throws(() => selectKth([1, 2], 2), RangeError);
assert.deepEqual(data, [12, 3, 5, 7, 4, 19, 26, 1, 5, 5, -2, 100]);
console.log("median-of-medians tests passed");
