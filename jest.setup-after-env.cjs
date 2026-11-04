// DOM polyfills and matchers from the Cognia Host's jest.setup.dom.ts. They
// need the test framework installed first, so they run after the environment.
if (typeof window !== "undefined") {
  require("@testing-library/jest-dom")
  require("@testing-library/dom").configure({ asyncUtilTimeout: 5000 })
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }),
    })
  }
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
    root = null
    rootMargin = ""
    thresholds = []
  }
  for (const target of [globalThis, window]) {
    if (typeof target.ResizeObserver === "undefined") target.ResizeObserver = MockResizeObserver
    if (typeof target.IntersectionObserver === "undefined")
      target.IntersectionObserver = MockIntersectionObserver
  }
  if (typeof Element.prototype.hasPointerCapture !== "function")
    Element.prototype.hasPointerCapture = () => false
  if (typeof Element.prototype.releasePointerCapture !== "function")
    Element.prototype.releasePointerCapture = () => {}
  if (typeof Element.prototype.setPointerCapture !== "function")
    Element.prototype.setPointerCapture = () => {}
  if (typeof window.PointerEvent !== "function") {
    class PointerEventPolyfill extends MouseEvent {
      constructor(type, init = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 0
        this.pointerType = init.pointerType ?? "mouse"
        this.isPrimary = init.isPrimary ?? true
        this.width = init.width ?? 1
        this.height = init.height ?? 1
        this.pressure = init.pressure ?? 0
      }
    }
    window.PointerEvent = PointerEventPolyfill
    globalThis.PointerEvent = PointerEventPolyfill
  }
  if (typeof Element.prototype.scrollIntoView !== "function")
    Element.prototype.scrollIntoView = () => {}
}

// Component tests render plugin React code without the PluginLoader, so the
// SDK's host seams are unbound. The Host binds its real ports here
// (jest.setup.dom.ts); this repository binds the same lookup rule the Host's
// `usePluginTranslations` answers with (lib/plugin/api/i18n-api.ts): English,
// then the raw key, with `{name}` interpolation, re-rendering when a bundle
// registers. Bound before each test so a suite that resets the module
// registry still gets a bound instance.
beforeEach(() => {
  const i18n = require("@cognia/plugin-sdk/api/i18n")
  const { useCallback, useSyncExternalStore } = require("react")
  i18n.bindPluginTranslationsHost((pluginId) => {
    const version = useSyncExternalStore(
      i18n.subscribeToPluginI18n,
      i18n.getPluginI18nSnapshot,
      () => 0
    )
    return useCallback(
      (key, params) => {
        void version
        const resolved = key.startsWith(`plugin.${pluginId}.`) ? key : `plugin.${pluginId}.${key}`
        const value = i18n.lookupPluginMessage("en", resolved) ?? key
        if (!params || value === key) return value
        return value.replace(/\{(\w+)\}/g, (match, name) =>
          params[name] !== undefined ? String(params[name]) : match
        )
      },
      [pluginId, version]
    )
  })
})
