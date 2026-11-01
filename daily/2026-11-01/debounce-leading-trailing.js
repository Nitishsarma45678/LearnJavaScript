const assert = require('node:assert/strict');

function debounce(fn, wait, {leading = false, trailing = true} = {}) {
  let timer = null, lastArgs, lastThis, leadingCalled = false;
  function invoke() {
    const args = lastArgs, ctx = lastThis;
    lastArgs = lastThis = undefined;
    return fn.apply(ctx, args);
  }
  function wrapped(...args) {
    lastArgs = args; lastThis = this;
    if (timer === null && leading) { leadingCalled = true; invoke(); }
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (trailing && lastArgs) invoke();
      leadingCalled = false;
    }, wait);
  }
  wrapped.cancel = () => { clearTimeout(timer); timer = null; lastArgs = lastThis = undefined; leadingCalled = false; };
  return wrapped;
}
(async () => {
  const calls = [];
  const d = debounce(x => calls.push(x), 15, {leading:true, trailing:true});
  d(1); d(2); d(3);
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(calls, [1,3]);
  d(4); d.cancel();
  await new Promise(r => setTimeout(r, 25));
  assert.deepEqual(calls, [1,3,4]);
  console.log('Debounce tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });