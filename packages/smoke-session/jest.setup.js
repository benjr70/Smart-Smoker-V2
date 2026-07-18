// The jsdom test environment does not expose Node's `setImmediate`, which the
// shipped `flushPromises` test helper relies on to drain the microtask queue.
// Bridge that single gap so the slice-2 fake kit runs unchanged under jsdom
// (the React binding tests) as well as under the default node environment.
if (typeof globalThis.setImmediate === 'undefined') {
  globalThis.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
}
