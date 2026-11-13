/**
 * Exercise: Implement a watermark-driven event-time tumbling-window aggregator.
 *
 * Events carry their own timestamps, which may arrive out of order. Advancing
 * the watermark emits completed windows. Events within allowed lateness update
 * an already emitted provisional result and produce a higher revision; events
 * older than the lateness horizon are dropped. A final revision is emitted
 * exactly once when the window's lateness horizon has passed.
 */
'use strict';

class EventTimeWindowAggregator {
  constructor({ windowSize, allowedLateness = 0, onEmit = () => {} }) {
    if (!(windowSize > 0) || !Number.isFinite(windowSize)) throw new RangeError('windowSize must be finite and > 0');
    if (!(allowedLateness >= 0) || !Number.isFinite(allowedLateness)) throw new RangeError('allowedLateness must be finite and >= 0');
    if (typeof onEmit !== 'function') throw new TypeError('onEmit must be a function');
    this.windowSize = windowSize; this.allowedLateness = allowedLateness; this.onEmit = onEmit;
    this.watermark = -Infinity; this.windows = new Map(); this.lateDropped = 0; this.totalAccepted = 0;
  }

  add({ timestamp, value = 1 }) {
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) throw new TypeError('timestamp and value must be finite numbers');
    if (timestamp < this.watermark - this.allowedLateness) { this.lateDropped++; return false; }
    const start = Math.floor(timestamp / this.windowSize) * this.windowSize;
    const end = start + this.windowSize;
    let bucket = this.windows.get(start);
    if (!bucket) {
      bucket = { start, end, count: 0, sum: 0, revision: 0, emitted: false };
      this.windows.set(start, bucket);
    }
    bucket.count++; bucket.sum += value; this.totalAccepted++;
    if (bucket.emitted) this._emit(bucket, false); // late correction to provisional result
    return true;
  }

  advanceWatermark(next) {
    if (next !== Infinity && !Number.isFinite(next)) throw new TypeError('watermark must be finite or Infinity');
    if (next < this.watermark) throw new RangeError('watermark cannot move backwards');
    this.watermark = next;
    const ordered = [...this.windows.values()].sort((a, b) => a.start - b.start);
    for (const bucket of ordered) {
      if (bucket.end > next) continue;
      const final = bucket.end + this.allowedLateness <= next;
      if (!bucket.emitted || final) this._emit(bucket, final);
      if (final) this.windows.delete(bucket.start);
    }
  }

  _emit(bucket, final) {
    bucket.revision++; bucket.emitted = true;
    this.onEmit(Object.freeze({ start: bucket.start, end: bucket.end, count: bucket.count,
      sum: bucket.sum, average: bucket.count ? bucket.sum / bucket.count : 0,
      revision: bucket.revision, final }));
  }

  snapshot() {
    return [...this.windows.values()].sort((a, b) => a.start - b.start).map(({ start, end, count, sum, revision, emitted }) =>
      ({ start, end, count, sum, revision, emitted }));
  }

  stats() { return { openWindows: this.windows.size, lateDropped: this.lateDropped, totalAccepted: this.totalAccepted, watermark: this.watermark }; }
}

// ------------------------------- Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const output = [];
  const agg = new EventTimeWindowAggregator({ windowSize: 10, allowedLateness : 5, onEmit: ý¥Ñ´ôø½ÕÑÁÕÐ¹ÁÕÍ ¡¥Ñ´¤ô¤ì(¹¡ìÑ¥µÍÑµÀèÈ°Ù±ÕèÐô¤ì(¹¡ìÑ¥µÍÑµÀèà°Ù±ÕèØô¤ì(¹¡ìÑ¥µÍÑµÀèÄÌ°Ù±ÕèÌô¤ì(¹Ù¹]ÑÉµÉ¬ ÄÀ¤ì(ÍÍÉÐ¹ÁÅÕ°¡½ÕÑÁÕÑlÁt°ìÍÑÉÐèÀ°¹èÄÀ°½Õ¹ÐèÈ°ÍÕ´èÄÀ°ÙÉèÔ°ÉÙ¥Í¥½¸èÄ°¥¹°è±Íô¤ì(ÍÍÉÐ¹ÅÕ°¡½ÕÑÁÕÐ¹±¹Ñ °Ä¤ì((¼¼±ÑµÕÐµ±±½ÝÙ¹ÐÉÙ¥ÍÌÑ¡±Éäµ¥ÑÑÝ¥¹½Ü¸(ÍÍÉÐ¹ÅÕ°¡¹¡ìÑ¥µÍÑµÀèØ°Ù±ÕèÔô¤°ÑÉÕ¤ì(ÍÍÉÐ¹ÅÕ°¡½ÕÑÁÕÑlÅt¹ÉÙ¥Í¥½¸°È¤ì(ÍÍÉÐ¹ÅÕ°¡½ÕÑÁÕÑlÅt¹ÍÕ´°ÄÔ¤ì(ÍÍÉÐ¹ÅÕ°¡½ÕÑÁÕÑlÅt¹¥¹°°±Í¤ì((¹Ù¹]ÑÉµÉ¬ ÄÔ¤ì(ÍÍÉÐ¹ÅÕ°¡½ÕÑÁÕÑlÉt¹ÍÑÉÐ°À¤ì(ÍÍÉÐ¹ÅÕ°¡½ÕÑÁÕÑlÉt¹¥¹°°ÑÉÕ¤ì(ÍÍÉÐ¹ÅÕ°¡½ÕÑÁÕÑlÉt¹ÉÙ¥Í¥½¸°Ì¤ì(ÍÍÉÐ¹ÅÕ°¡¹Í¹ÁÍ¡½Ð ¤¹Í½µ¡ÜôøÜ¹ÍÑÉÐôôôÀ¤°±Í¤ì(ÍÍÉÐ¹ÅÕ°¡¹¡ìÑ¥µÍÑµÀèÌ°Ù±Õèääô¤°±Í¤ì¼¼½±ÈÑ¡¸ÝÑÉµÉ¬´±Ñ¹ÍÌ(ÍÍÉÐ¹ÅÕ°¡¹ÍÑÑÌ ¤¹±ÑÉ½ÁÁ°Ä¤ì((¹Ù¹]ÑÉµÉ¬ ÈÔ¤ì¼¼Ý¥¹½ÜlÄÀ°ÈÀ¤½µÌ¥¹°(ÍÍÉÐ¹½¬¡½ÕÑÁÕÐ¹Í½µ¡àôøà¹ÍÑÉÐôôôÄÀà¹¥¹°¤¤ì(ÍÍÉÐ¹Ñ¡É½ÝÌ  ¤ôø¹Ù¹]ÑÉµÉ¬ ÈÐ¤°½­ÝÉÌ¼¤ì(ÍÍÉÐ¹Ñ¡É½ÝÌ  ¤ôø¹¡ìÑ¥µÍÑµÀè98ô¤°½¥¹¥Ñ¼¤ì(½¹ÍÐµÁÑäô¹ÜÙ¹ÑQ¥µ]¥¹½ÝÉÑ½È¡ìÝ¥¹½ÝM¥éèÔô¤ì(µÁÑä¹Ù¹]ÑÉµÉ¬ ÄÀÀ¤ì(ÍÍÉÐ¹ÅÕ°¡µÁÑä¹ÍÑÑÌ ¤¹½Á¹]¥¹½ÝÌ°À¤ì(½¹Í½±¹±½ Ù¹ÐµÑ¥µÝ¥¹½ÜÉÑ½Èè±°ÑÍÑÌÁÍÍ¤ì)ô()µ½Õ±¹áÁ½ÉÑÌôìÙ¹ÑQ¥µ]¥¹½ÝÉÑ½Èôì(ÿÿÿ