import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  HOST_MESSAGE_SOURCE,
  OMS_EMBED_URL,
  OMS_MESSAGE_SOURCE,
  OMS_ORIGIN,
  OMS_PROTOCOL_VERSION,
  OMS_SIGNOUT_URL,
} from './config';
import { trace } from './debug-log';
import { OmsAuth } from './oms-auth';
import { Theme } from './theme';

/**
 * How far the handoff has got for the frame on screen.
 *
 * `checking` — OMS is up and checking its own session; the portal waits. `reused` — OMS already
 * had a valid session, so no token was requested. `requesting` / `sent` / `accepted` — OMS asked
 * for a token (none, or an expired one), and this is how far that got.
 */
type HandoffState =
  'idle' | 'checking' | 'requesting' | 'sent' | 'accepted' | 'reused' | 'rejected';

/** OMS's order queue, as a path under its embedded surface (`/embed`). */
export const OMS_QUEUE_PATH = '/orders';

/**
 * An OMS screen path the portal will frame or ask OMS to open, or `null`: only the order queue and
 * one order (`/orders`, `/orders/{id}`), as a plain path. The same rule OMS applies to
 * `host.route.request` (`asHostRoute`), so a message or a URL can never point the frame elsewhere.
 */
export function asOmsPath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  return /^\/orders(\/[A-Za-z0-9._~%-]+)?$/.test(path) && !path.includes('..') ? path : null;
}

/** The OMS path for the portal's `?order=` query value: one order, or the queue. */
export function omsPathForOrder(order: string | null | undefined): string {
  return order ? `${OMS_QUEUE_PATH}/${encodeURIComponent(order)}` : OMS_QUEUE_PATH;
}

/** The portal's `?order=` value for an OMS path: the order's id, or `null` for the queue. */
export function orderForOmsPath(path: string): string | null {
  const id = path.slice(OMS_QUEUE_PATH.length + 1);
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class OmsBridge {
  private readonly theme = inject(Theme);
  private readonly auth = inject(OmsAuth);

  /** The embedded frame, registered by `OmsPage` while it is on screen. */
  private frame: HTMLIFrameElement | null = null;

  private readonly ready = signal(false);
  private readonly sentAt = signal<Date | null>(null);
  private readonly handoff = signal<HandoffState>('idle');

  /** True once OMS has answered `oms.ready` on the current frame. */
  readonly connected = computed(() => this.ready());

  /** When the portal last pushed the theme to OMS, for the status line. */
  readonly lastSentAt = computed(() => this.sentAt());

  private readonly route = signal<string | null>(null);

  /**
   * The screen OMS last said it is on (`oms.route.changed`): `/orders` or `/orders/{id}`. `null`
   * until the frame on screen has said. `OmsPage` mirrors it into the portal's URL.
   */
  readonly omsPath = this.route.asReadonly();

  /** How far the token handoff got, for the status line. */
  readonly authState = computed(() => this.handoff());

  /** Why the token could not be obtained, when it could not. */
  readonly authFailure = computed(() => this.auth.failure());

  constructor() {
    window.addEventListener('message', (event) => this.onMessage(event));

    // Pushes the theme whenever it changes. Reading both signals is what subscribes the effect to
    // them; the send is skipped until OMS has said it is listening.
    effect(() => {
      const mode = this.theme.resolved();
      const accent = this.theme.accent();
      if (this.ready()) this.sendTheme(mode, accent);
    });
  }

  /**
   * Called by `OmsPage` when the iframe element exists, and again with `null` when it goes away.
   *
   * Re-registering resets `ready`: a new frame has not spoken yet, and treating it as connected
   * would mean pushing a theme into a document that is not listening.
   */
  register(frame: HTMLIFrameElement | null): void {
    trace(
      'bridge',
      frame ? 'OMS frame registered: waiting for oms.ready' : 'OMS frame unregistered',
    );
    this.frame = frame;
    this.ready.set(false);
    this.sentAt.set(null);
    this.route.set(null);
    // A new document in the frame holds no session, so the handoff starts over for it.
    this.handoff.set('idle');
  }

  /**
   * The iframe URL, carrying the current appearance as a fragment.
   *
   * This is a pre-paint hint, not the protocol. Without it, OMS paints its own stored theme on
   * the first frame and only switches when `host.theme` arrives — a visible light flash inside a
   * dark portal. A fragment rather than a query string, because fragments are never sent to a
   * server, so this stays out of access logs and `Referer` headers.
   *
   * Only ever used for the initial `src`. Later theme changes go over the channel, so the frame
   * is never reloaded to recolour it.
   */
  embedUrl(cacheBust?: boolean, path: string = OMS_QUEUE_PATH): string {
    const hint = new URLSearchParams({
      theme: this.theme.resolved(),
      accent: this.theme.accent(),
    });
    // `OMS_EMBED_URL` is the queue; an order screen is the same surface one level down.
    const screen = `${OMS_EMBED_URL.slice(0, -OMS_QUEUE_PATH.length)}${asOmsPath(path) ?? OMS_QUEUE_PATH}`;
    const base = cacheBust ? `${screen}?r=${Date.now()}` : screen;
    return `${base}#${hint.toString()}`;
  }

  private onMessage(event: MessageEvent): void {
    // Three independent checks, all required. Origin alone is not enough — any document from
    // that origin could post to this window — and the envelope alone is not enough, because
    // anyone can set a `source` field.
    const message = event.data as {
      source?: unknown;
      v?: unknown;
      type?: unknown;
      session?: unknown;
      reason?: unknown;
    } | null;
    // Only a message that says it is from OMS is worth a log line when it is refused; everything
    // else that lands on this window (dev tools, extensions, the dev server) is noise.
    const claimsOms =
      typeof message === 'object' && message !== null && message.source === OMS_MESSAGE_SOURCE;

    if (event.origin !== OMS_ORIGIN) {
      if (claimsOms) {
        trace(
          'bridge',
          '✖ step 5 · refused a message that claims to be OMS: wrong origin (check B)',
          {
            origin: event.origin,
            expected: OMS_ORIGIN,
          },
        );
      }
      return;
    }
    if (!this.frame || event.source !== this.frame.contentWindow) {
      if (claimsOms) {
        trace('bridge', '✖ step 5 · refused a message: not sent by the OMS iframe (check B)');
      }
      return;
    }
    if (typeof message !== 'object' || message === null) return;
    if (message.source !== OMS_MESSAGE_SOURCE || message.v !== OMS_PROTOCOL_VERSION) {
      if (claimsOms) {
        trace('bridge', '✖ step 5 · refused a message: wrong protocol version (check B)', {
          v: message.v,
          expected: OMS_PROTOCOL_VERSION,
        });
      }
      return;
    }
    trace(
      'bridge',
      `← OMS     ${String(message.type)}  (origin, window and envelope checked)`,
      message,
    );

    // Theme only. This portal cannot see whether OMS already has a session — the token sits in
    // OMS's own HttpOnly cookie — so it does not guess. OMS checks and answers with
    // `oms.auth.ok` (nothing to do) or `oms.auth.renew` (send a token).
    if (message.type === 'oms.ready') {
      trace(
        'bridge',
        'step 4 · OMS is loaded and listening; answering with the theme only, no token',
      );
      this.ready.set(true);
      this.handoff.set('checking');
      this.sendTheme(this.theme.resolved(), this.theme.accent());
    }

    // OMS took the token and could not use it. Re-requesting would produce the same answer from
    // the same session, so this is surfaced rather than retried.
    if (message.type === 'oms.auth.failed') {
      trace('bridge', '✖ OMS could not store the token it was given; not retrying on its own');
      this.handoff.set('rejected');
    }

    // `existing`: OMS's cookie was still valid and no token was needed. Older OMS builds send no
    // `session` field, and only ever after a grant.
    if (message.type === 'oms.auth.ok') {
      trace(
        'bridge',
        message.session === 'existing'
          ? '✔ step 7 · OMS already had a session cookie: no token needed, none sent'
          : '✔ step 22 · OMS stored the new token and is signed in',
      );
      this.handoff.set(message.session === 'existing' ? 'reused' : 'accepted');
    }

    // OMS has no session cookie (`missing`), or the token it had was refused (`rejected`): ask the
    // backend for a token. Same call either way, because the portal keeps no token of its own.
    // The one message that starts a token request.
    if (message.type === 'oms.auth.renew') {
      trace('bridge', `step 8–9 · OMS asked for a token (reason: ${String(message.reason)})`);
      void this.sendGrant();
    }

    // The merchant moved inside OMS. Kept so the portal can put the screen in its own URL
    // (`OmsPage`), which is what makes a refresh reopen the same order. Only order screens count.
    if (message.type === 'oms.route.changed') {
      const path = asOmsPath((message as { path?: unknown }).path);
      if (path) this.route.set(path);
    }

    // Unhandled types fall through, which is the intended behaviour: it is what lets OMS add a
    // message before the portal knows about it.
  }

  /**
   * Asks our backend for an access token and posts it into the frame.
   *
   * The token comes from `OmsAuth`, which asks the backend and keeps nothing: the token is posted
   * to OMS and dropped.
   *
   * A failure is posted as `host.auth.denied` rather than left silent, so OMS can tell the
   * merchant why it is empty instead of showing a spinner that never resolves.
   *
   * Only `oms.auth.renew` calls this. A request already in flight is reused rather than doubled.
   */
  private async sendGrant(): Promise<void> {
    const target = this.frame?.contentWindow;
    if (!target) {
      trace('bridge', 'a token was requested but there is no OMS frame on screen; nothing to do');
      return;
    }

    this.handoff.set('requesting');
    const token = await this.auth.token();

    // The frame may have been replaced, or the page left, while the request was in flight.
    if (this.frame?.contentWindow !== target) {
      trace('bridge', 'the OMS frame was replaced while waiting for the backend: sending nothing');
      return;
    }

    if (!token) {
      trace('bridge', `✖ step 10–12 · → OMS     host.auth.denied (${this.auth.denyReason()})`);
      this.handoff.set('rejected');
      target.postMessage(
        {
          source: HOST_MESSAGE_SOURCE,
          v: OMS_PROTOCOL_VERSION,
          type: 'host.auth.denied',
          reason: this.auth.denyReason(),
        },
        OMS_ORIGIN,
      );
      return;
    }

    trace('bridge', '✔ step 14–15 · → OMS     host.auth.grant (to the exact OMS origin)', {
      token,
      to: OMS_ORIGIN,
    });
    this.handoff.set('sent');
    target.postMessage(
      {
        source: HOST_MESSAGE_SOURCE,
        v: OMS_PROTOCOL_VERSION,
        type: 'host.auth.grant',
        token,
        // The token does not expire — OMS ends the session, not a clock. The field is part of the
        // protocol, so it is sent empty rather than invented.
        expiresAt: '',
      },
      // The exact origin, never '*'. That mattered for the theme; it is non-negotiable for a
      // credential.
      OMS_ORIGIN,
    );
  }

  /**
   * The merchant has left OMS for another portal page, and the frame is now hidden. Like any
   * portal section, OMS should open on its landing page, the order queue, even if it was left on
   * an order (`host.route.request`) — so it is sent there *now*, while nobody can see the frame.
   * Sent on return instead, the frame would be shown still on the order and then switch to the
   * queue: a visible flicker. An older OMS ignores the message. Skipped before OMS has spoken: a
   * frame still loading is already on its first screen.
   */
  leave(): void {
    this.requestQueue('hidden: back on the queue before return');
  }

  /**
   * The merchant clicked OMS in the sidebar while already on it. The router sees the same URL and
   * does nothing, so without this a merchant on an order would stay there; like any portal section,
   * the link opens OMS's landing page, the order queue (`host.route.request`). OMS replaces the
   * history entry, so the back button does not step back to the order.
   */
  openQueue(): void {
    this.requestQueue('OMS clicked while on it: open the queue');
  }

  /**
   * Opens an OMS screen in the kept frame — the order in the portal's URL, when the merchant comes
   * back to `/oms?order=…` with the browser's back button.
   */
  openPath(path: string): void {
    this.requestRoute(path, 'the portal URL names this screen');
  }

  private requestQueue(why: string): void {
    this.requestRoute(OMS_QUEUE_PATH, why);
  }

  private requestRoute(path: string, why: string): void {
    const target = this.frame?.contentWindow;
    const route = asOmsPath(path);
    if (!target || !this.ready() || !route) return;

    trace('bridge', `→ OMS     host.route.request ${route} (${why})`);
    target.postMessage(
      {
        source: HOST_MESSAGE_SOURCE,
        v: OMS_PROTOCOL_VERSION,
        type: 'host.route.request',
        path: route,
      },
      OMS_ORIGIN,
    );
  }

  /**
   * The merchant is back on OMS after other portal pages, through the OMS link (or the back
   * button). The frame was kept alive and only hidden, so nothing in it was refetched meanwhile:
   * OMS refreshes what has gone stale (`host.visible`). It is already on the order queue (`leave`).
   * An older OMS ignores the message. Skipped before OMS has spoken: a frame still loading has
   * nothing stale.
   */
  showAgain(): void {
    const target = this.frame?.contentWindow;
    if (!target || !this.ready()) return;

    trace('bridge', '→ OMS     host.visible (shown again)');
    target.postMessage(
      { source: HOST_MESSAGE_SOURCE, v: OMS_PROTOCOL_VERSION, type: 'host.visible' },
      OMS_ORIGIN,
    );
  }

  private sendTheme(mode: string, accent: string): void {
    const target = this.frame?.contentWindow;
    if (!target) return;

    trace('bridge', '→ OMS     host.theme', { mode, accent, to: OMS_ORIGIN });
    target.postMessage(
      {
        source: HOST_MESSAGE_SOURCE,
        v: OMS_PROTOCOL_VERSION,
        type: 'host.theme',
        mode,
        accent,
      },
      // The exact origin, never '*'. A wildcard hands the message to whatever document happens
      // to occupy the frame, which matters much more once this channel carries a token.
      OMS_ORIGIN,
    );
    this.sentAt.set(new Date());
  }

  /**
   * Portal sign-out, for OMS: deletes OMS's persistent session cookie.
   *
   * OMS keeps the token in an HttpOnly cookie on its own site, which this page cannot delete. So it
   * loads OMS's sign-out page in a hidden iframe; OMS deletes its cookies and answers
   * `oms.auth.cleared`. Because the cookie is partitioned to this portal, the hidden frame reaches
   * the same cookie the OMS page uses, whether or not OMS is open right now.
   *
   * Call it from the portal's own sign-out, before ending the portal session. Resolves `true`
   * when OMS confirmed, `false` after five seconds without an answer.
   */
  signOut(): Promise<boolean> {
    trace('signout', 'step 29 · signing out: loading OMS’s sign-out page in a hidden frame');
    this.auth.clear();
    this.handoff.set('idle');

    return new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.hidden = true;
      frame.title = 'Signing out of OMS';
      frame.src = OMS_SIGNOUT_URL;

      const finish = (confirmed: boolean) => {
        trace(
          'signout',
          confirmed
            ? '✔ step 32–33 · OMS confirmed: its cookie is deleted; removing the hidden frame'
            : '✖ OMS did not answer within 5 s; signing out of the portal anyway (the cookie may remain)',
        );
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        frame.remove();
        resolve(confirmed);
      };

      // The same three checks as `onMessage`, against the hidden frame.
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== OMS_ORIGIN || event.source !== frame.contentWindow) return;
        const data = event.data as { source?: unknown; v?: unknown; type?: unknown } | null;
        if (data?.source !== OMS_MESSAGE_SOURCE || data.v !== OMS_PROTOCOL_VERSION) return;
        if (data.type === 'oms.auth.cleared') finish(true);
      };

      const timer = setTimeout(() => finish(false), 5000);
      window.addEventListener('message', onMessage);
      document.body.appendChild(frame);
    });
  }
}
