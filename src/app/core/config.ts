/**
 * Where the Fonepoints Business portal finds the apps it hosts.
 *
 * OMS is a separate Next.js application embedded in an iframe. It serves an `/embed/*` surface
 * that renders its content with no sidebar or header of its own, because this portal supplies
 * the chrome.
 *
 * OMS must also allow this origin in its `frame-ancestors` CSP, or the browser refuses to frame
 * it — see `next.config.ts` and `NEXT_PUBLIC_EMBED_HOST_ORIGINS` in the OMS repo.
 */
export const OMS_ORIGIN = 'http://localhost:3000';

/** Entry point of the embedded OMS surface. */
export const OMS_EMBED_URL = `${OMS_ORIGIN}/embed/orders`;
