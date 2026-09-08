/**
 * Storage ceilings shared by the client store and the cloud server functions.
 * Keeping them in one place means the catalog, localStorage, IndexedDB and the
 * database all agree on what "the last 40 classes" means.
 */

/** Classes kept per user, everywhere. */
export const SESSION_KEEP = 40;

/** Serialized size the server accepts for one class (about 512 KB of JSON). */
export const SESSION_PAYLOAD_MAX_CHARS = 512_000;

/**
 * Shape version stamped on every `ClassSession`. Bump when a field changes
 * meaning; `normalizeSessions` upgrades older rows on read.
 */
export const SESSION_SCHEMA_VERSION = 1;
