/**
 * Writes `src/environments/environment.production.ts` from environment variables.
 *
 * Angular bakes configuration in at build time, and on Vercel the only thing that varies between
 * deployments is a couple of environment variables. This is the bridge, so nobody edits source
 * to point the portal at a different OMS.
 *
 *   OMS_ORIGIN            https://oms-demo.vercel.app       (no trailing slash, no path)
 *   FONEPOINTS_API_URL    https://api.1-2-3-4.sslip.io
 *
 * Run it before `ng build`: `node scripts/set-env.mjs && ng build`.
 */

import { writeFileSync } from 'node:fs';

const omsOrigin = process.env.OMS_ORIGIN?.trim();
const apiUrl = process.env.FONEPOINTS_API_URL?.trim();

const onVercel = Boolean(process.env.VERCEL || process.env.CI);

if (!omsOrigin || !apiUrl) {
  if (onVercel) {
    console.error(
      'set-env: OMS_ORIGIN and FONEPOINTS_API_URL must both be set for a deployed build.',
    );
    process.exit(1);
  }
  console.log('set-env: variables not set, keeping the committed placeholders (local build).');
  process.exit(0);
}

/** An origin is scheme + host (+ port) only. A path or trailing slash would break every `postMessage` target. */
function origin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    console.error(`set-env: ${name} is not a valid URL: ${value}`);
    process.exit(1);
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    console.error(`set-env: ${name} must be https in a deployed build: ${value}`);
    process.exit(1);
  }
  return url.origin;
}

const out = `export const environment = {
  omsOrigin: ${JSON.stringify(origin(omsOrigin, 'OMS_ORIGIN'))},
  fonepointsApiUrl: ${JSON.stringify(origin(apiUrl, 'FONEPOINTS_API_URL'))},
};
`;

writeFileSync(new URL('../src/environments/environment.production.ts', import.meta.url), out);
console.log(
  `set-env: omsOrigin=${origin(omsOrigin, 'OMS_ORIGIN')} fonepointsApiUrl=${origin(apiUrl, 'FONEPOINTS_API_URL')}`,
);
