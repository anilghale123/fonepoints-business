import { environment } from '../../environments/environment';

/**
 * Where the Fonepoints Business portal finds the apps it hosts.
 *
 * OMS is a separate Next.js application embedded in an iframe. It serves an `/embed/*` surface
 * that renders its content with no sidebar or header of its own, because this portal supplies
 * the chrome.
 *
 * OMS must also allow this origin in its `frame-ancestors` CSP, or the browser refuses to frame
 * it — see `next.config.ts` and `NEXT_PUBLIC_EMBED_HOST_ORIGINS` in the OMS repo. The same list
 * is what OMS checks incoming `postMessage` origins against, so framing and messaging are
 * allowed or refused together.
 */
export const OMS_ORIGIN = environment.omsOrigin;

/**
 * This portal's own backend.
 *
 * It exists for one reason: it holds the OMS company API key. The browser cannot ask OMS for an
 * access token — it has no credential OMS would accept — so it asks this service, which presents
 * the key and hands back the token OMS issues. See `oms-auth.ts`.
 *
 * Requests to it are sent with credentials, because the portal session cookie is what proves which
 * merchant is asking.
 */
export const FONEPOINTS_API_URL = environment.fonepointsApiUrl;

/** Entry point of the embedded OMS surface. */
export const OMS_EMBED_URL = `${OMS_ORIGIN}/embed/orders`;

/* ─── Host protocol ───────────────────────────────────────────────────────
   The message contract with OMS. Mirrors `src/lib/host/messages.ts` in the OMS repo and is
   specified in `auth.md` section 8. The two apps deploy independently, so each keeps its own
   copy of these three constants rather than sharing a package; a receiver drops any message
   whose `source` or `v` it does not recognise, which is what makes that safe. */

/** Bumped only for a breaking change to the message shapes. */
export const OMS_PROTOCOL_VERSION = 1;

/** `source` on messages OMS sends to us. */
export const OMS_MESSAGE_SOURCE = 'fonepoints-oms';

/** `source` on messages we send to OMS. */
export const HOST_MESSAGE_SOURCE = 'fonepoints-host';
