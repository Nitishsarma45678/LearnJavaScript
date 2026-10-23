// Sliding-window analyzer: tracks rolling averages and detects threshold crossings.
// Run: node sliding-window-analyzer.js

class SlidingWindowAnalyzer {
  constructor(size, threshold) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be positive");
    this.size = size;
    this.threshold = threshold;
    this.values = [];
    this.sum = 0;
  }

  push(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("value must be a finite number");
    }

    this.values.push(value);
    this.sum += value;

    if (this.values.length > this.size) {
      this.sum -= this.values.shift();
    }

    const average = this.sum / this.values.length;
    return {
      average,
      full: this.values.length === this.size,
      crossedThreshold: this.values.length === this.size && average >= this.threshold,
    };
  }

  reset() {
    this.values = [];
    this.sum = 0;
  }
}

const analyzer = new SlidingWindowAnalyzer(3, 8);
for (const value of [4, 7, 9, 10, 6]) {
  console.log(value, analyzer.push(value));
}
