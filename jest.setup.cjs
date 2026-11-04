// Environment polyfills ported from the Cognia Host's Jest setup
// (jest.setup.ts / jest.setup.dom.ts), so plugin suites see the same globals
// in both repositories. Host-specific mocks (next/*, next-intl, the plugin
// consent broker) are deliberately not ported: a suite that needs them is a
// Host integration suite (host-integration-tests.json).
if (typeof globalThis.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("node:util")
  Object.assign(globalThis, { TextEncoder, TextDecoder })
}
if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
  const { webcrypto } = require("node:crypto")
  Object.defineProperty(globalThis, "crypto", {
    value: {
      subtle: webcrypto.subtle,
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      randomUUID: webcrypto.randomUUID.bind(webcrypto),
    },
    configurable: true,
    writable: true,
  })
}
for (const name of ["ReadableStream", "WritableStream", "TransformStream"]) {
  if (typeof globalThis[name] === "undefined") globalThis[name] = require("node:stream/web")[name]
}
if (typeof globalThis.fetch !== "function") {
  globalThis.fetch = function fetch() {
    return Promise.reject(
      new Error("jest.setup: global fetch is a stub — mock `fetch` in this suite before calling it.")
    )
  }
}
// jsdom hides Node's structuredClone; the Host falls back to a JSON clone.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value))
}
// jest-environment-jsdom deletes setImmediate; restore the real macrotask.
if (typeof globalThis.setImmediate !== "function") {
  const timers = require("node:timers")
  for (const name of ["setImmediate", "clearImmediate"])
    Object.defineProperty(globalThis, name, { value: timers[name], configurable: true, writable: true })
}
