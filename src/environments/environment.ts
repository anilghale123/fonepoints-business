/**
 * Development values. Replaced by `environment.production.ts` in a production build
 * (`fileReplacements` in angular.json).
 *
 * Only two URLs differ between environments, and both are read from `core/config.ts` — nothing
 * else in the app names a host.
 */
export const environment = {
  /** Where the OMS frontend is served. Also the only origin the portal will accept messages from. */
  omsOrigin: 'http://localhost:3000',
  /** The Fonepoints backend, which holds the OMS company API key. */
  fonepointsApiUrl: 'http://localhost:4000',
};
