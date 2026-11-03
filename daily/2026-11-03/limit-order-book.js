const assert = require('node:assert/strict');

// A single-instrument limit order book. Best price wins; FIFO order breaks ties.
// Trades execute at the resting (maker) order's price.
class LimitOrderBook {
  constructor() {
    this.bids = [];
    this.asks = [];
    this.bidLevels = new Map();
    this.askLevels = new Map();
    this.openOrders = new Map();
  }

  _levels(side) { return side === 'buy' ? this.bids : this.asks; }
  _levelMap(side) { return side === 'buy' ? this.bidLevels : this.askLevels; }

  _best(side) {
    const levels = this._levels(side);
    const map = this._levelMap(side);
    while (levels.length) {
      const level = levels[0];
      while (level.head < level.orders.length && level.orders[level.head].remaining === 0) {
        level.head++;
      }
      if (level.head < level.orders.length) return level;
      levels.shift();
      map.delete(level.price);
    }
    return null;
  }

  _rest(order) {
    const levels = this._levels(order.side);
    const map = this._levelMap(order.side);
    let level = map.get(order.price);
    if (!level) {
      level = { price: order.price, orders: [], head: 0 };
      let index = 0;
      if (order.side === 'buy') {
        while (index < levels.length && levels[index].price > order.price) index++;
      } else {
        while (index < levels.length && levels[index].price < order.price) index++;
      }
      levels.splice(index, 0, level);
      map.set(order.price, level);
    }
    level.orders.push(order);
    this.openOrders.set(order.id, order);
  }

  submit({ id, side, price, quantity }) {
    if (id === undefined || id === null) throw new TypeError('order id is required');
    if (this.openOrders.has(id)) throw new Error('duplicate open order id');
    if (side !== 'buy' && side !== 'sell') throw new TypeError('side must be buy or sell');
    if (!Number.isFinite(price) || price <= 0) throw new RangeError('price must be positive');
    if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError('quantity must be a positive integer');

    const incoming = { id, side, price, remaining: quantity };
    const oppositeSide = side === 'buy' ? 'sell' : 'buy';
    const trades = [];

    while (incoming.remaining > 0) {
      const level = this._best(oppositeSide);
      if (!level) break;
      const crosses = side === 'buy' ? level.price <= price : level.price >= price;
      if (!crosses) break;

      const maker = level.orders[level.head];
      const filled = Math.min(incoming.remaining, maker.remaining);
      maker.remaining -= filled;
      incoming.remaining -= filled;
      trades.push({
        makerId: maker.id,
        takerId: incoming.id,
        price: maker.price,
        quantity: filled
      });

      if (maker.remaining === 0) {
        this.openOrders.delete(maker.id);
        level.head++;
      }
    }

    if (incoming.remaining > 0) this._rest(incoming);
    return { orderId: id, trades, remaining: incoming.remaining, resting: incoming.remaining > 0 };
  }

  cancel(id) {
    const order = this.openOrders.get(id);
    if (!order) return false;
    order.remaining = 0; // lazy removal preserves FIFO positions of other orders
    this.openOrders.delete(id);
    return true;
  }

  snapshot() {
    const copy = side => side.map(level => ({
      price: level.price,
      orders: level.orders.slice(level.head)
        .filter(order => order.remaining > 0)
        .map(({ id, remaining }) => ({ id, remaining }))
    })).filter(level => level.orders.length > 0);
    this._best('buy');
    this._best('sell');
    return { bids: copy(this.bids), asks: copy(this.asks) };
  }
}

const book = new LimitOrderBook();
book.submit({ id: 's1', side: 'sell', price: 100, quantity: 5 });
book.submit({ id: 's2', side: 'sell', price: 100, quantity: 3 });
book.submit({ id: 's3', side: 'sell', price: 99, quantity: 2 });
const fill = book.submit({ id: 'b1', side: 'buy', price: 100, quantity: 8 });
assert.deepEqual(fill.trades, [
  { makerId: 's3', takerId: 'b1', price: 99, quantity: 2 },
  { makerId: 's1', takerId: 'b1', price: 100, quantity: 5 },
  { makerId: 's2', takerId: 'b1', price: 100, quantity: 1 }
]);
assert.equal(fill.remaining, 0);
assert.deepEqual(book.snapshot().asks, [{ price: 100, orders: [{ id: 's2', remaining: 2 }] }]);
assert.equal(book.cancel('s2'), true);
assert.equal(book.cancel('s2'), false);

const second = new LimitOrderBook();
second.submit({ id: 'bid', side: 'buy', price: 50, quantity: 10 });
const sell = second.submit({ id: 'ask', side: 'sell', price: 49, quantity: 4 });
assert.equal(sell.trades[0].price, 50); // maker price
assert.equal(sell.trades[0].quantity, 4);
assert.deepEqual(second.snapshot().bids, [{ price: 50, orders: [{ id: 'bid', remaining: 6 }] }]);
assert.throws(() => second.submit({ id: 'x', side: 'buy', price: 0, quantity: 1 }), RangeError);
console.log('Limit order book tests passed');
