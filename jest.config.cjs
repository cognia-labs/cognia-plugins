// Plugin unit suites, split like the Cognia Host's Jest projects: `.test.ts`
// (and .mts/.cts) run in node, everything else in jsdom; a file's
// `@jest-environment` docblock still wins. Suites listed in
// host-integration-tests.json import Host modules and run in the Host.
const { files: hostIntegration } = require("./host-integration-tests.json")
const { pluginNodeTestSuites } = require("./scripts/node-test-suites.cjs")

const escape = (file) => file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const ignored = [
  "/node_modules/",
  "/\\.vendor/",
  "<rootDir>/plugins/pi-latex-workbench/vendor/",
  ...[...hostIntegration, ...pluginNodeTestSuites(__dirname)].map((file) => `<rootDir>/${escape(file)}$`),
]
const nodeTests = ["<rootDir>/plugins/**/*.test.ts", "<rootDir>/plugins/**/*.test.?(m|c)ts"]
const shared = {
  rootDir: __dirname,
  setupFiles: ["<rootDir>/jest.setup.cjs"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup-after-env.cjs"],
  moduleFileExtensions: ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "json", "node"],
  // SWC like the Host's next/jest transform: it hoists jest.mock() without
  // Babel's out-of-scope check, so suites run unchanged in both repositories.
  transform: {
    "^.+\\.[mc]?[jt]sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true, decorators: true },
          transform: { react: { runtime: "automatic" } },
          target: "es2022",
        },
        module: { type: "commonjs" },
      },
    ],
  },
  // The kit packages' CJS entries re-export their ESM build through Node's
  // require(esm), which Jest's runtime does not apply; transform them instead.
  transformIgnorePatterns: [
    "/node_modules/(?!\\.pnpm/|(?:@cognia/(?:plugin-sdk|plugin-ui|github-bot-kit)|pdfjs-dist|lucide-react|nanoid)/)",
    "/node_modules/\\.pnpm/(?!(?:@cognia\\+(?:plugin-sdk|plugin-ui|github-bot-kit)|pdfjs-dist|lucide-react|nanoid)@)",
  ],
  moduleNameMapper: { "\\.(css|less|scss)$": "identity-obj-proxy" },
  testPathIgnorePatterns: ignored,
}

module.exports = {
  projects: [
    { ...shared, displayName: "node", testEnvironment: "node", testMatch: nodeTests },
    {
      ...shared,
      displayName: "jsdom",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/plugins/**/*.test.?(m|c)js", "<rootDir>/plugins/**/*.test.[jt]sx"],
    },
  ],
}
