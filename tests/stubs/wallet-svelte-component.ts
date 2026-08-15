// Stub for wallet-svelte-component.
//
// The published package ships Svelte components and extensionless ESM imports that Node cannot
// resolve, so vitest dies during collection with ERR_MODULE_NOT_FOUND before running a single
// test - including the tests already in the repo. It reaches the test run only transitively,
// through $lib, and nothing under tests/ touches it, so aliasing it to this empty module in
// vitest.config.ts is enough to let the suite run.
//
// If a test ever does need the real component, this stub is the place to give it a surface
// rather than removing the alias, which would put the collection error back.
export default {};
