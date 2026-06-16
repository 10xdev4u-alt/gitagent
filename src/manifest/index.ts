/**
 * Public surface of the `gitagent/manifest` subpath.
 *
 * Re-exports the Zod schema, the loader, the registry, the matcher, and
 * the error types. This is the only file end users should import from
 * the manifest subpath.
 */

export * from './schema.js';
export * from './loader.js';
export * from './registry.js';
export * from './matcher.js';
export * from './errors.js';
