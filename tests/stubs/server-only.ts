// Inert stub for the `server-only` package, used only in the test environment
// (aliased in vitest.config.ts). The real package throws on import outside a
// React Server Component bundle, which would otherwise break unit tests that
// import server-only modules like src/lib/db/jobs.ts.
export {};
