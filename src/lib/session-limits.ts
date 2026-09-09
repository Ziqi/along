/**
 * Storage ceilings shared by the client store and the cloud server functions.
 * Keeping them in one place means the catalog, localStorage, IndexedDB and the
 * database all agree on what "the last 40 classes" means.
 */

/** Classes kept per user, everywhere. */
export const SESSION_KEEP = 40;

/**
 * Serialized size the server accepts for one class body — the hour without its
 * handout (about 512 KB of JSON). Over it, the tape is left out and only the
 * catalog row, notes and handout reach the cloud.
 */
export const SESSION_PAYLOAD_MAX_CHARS = 512_000;

/** Serialized size the server accepts for one handout (about 256 KB of JSON). */
export const RECAP_PAYLOAD_MAX_CHARS = 256_000;

/**
 * Shape version stamped on every `ClassSession`. Bump when a field changes
 * meaning; `normalizeSessions` upgrades older rows on read.
 *
 * 2: `segments` (the class by topic) joined the body; older rows read as none.
 */
export const SESSION_SCHEMA_VERSION = 2;
