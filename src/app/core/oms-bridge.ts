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
  embedUrl(cacheBust?: boolean): string {
    const hint = new URLSearchParams({
      theme: this.theme.resolved(),
      accent: this.theme.accent(),
    });
    const base = cacheBust ? `${OMS_EMBED_URL}?r=${Date.now()}` : OMS_EMBED_URL;
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

    // `oms.route.changed` is specified in `auth.md` section 8 and handled when that phase lands.
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
