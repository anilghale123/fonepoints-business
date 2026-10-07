import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  HOST_MESSAGE_SOURCE,
  OMS_EMBED_URL,
  OMS_MESSAGE_SOURCE,
  OMS_ORIGIN,
  OMS_PROTOCOL_VERSION,
} from './config';
import { OmsAuth } from './oms-auth';
import { Theme } from './theme';

/**
 * The portal's side of the `postMessage` conversation with the embedded OMS.
 *
 * It carries two things, and they share one channel deliberately:
 *
 * - **The appearance.** The portal owns the theme for the whole window, so when the merchant
 *   switches to dark here, OMS follows inside the frame.
 * - **The access token.** OMS cannot authenticate a merchant on its own. The portal asks its own
 *   backend for a token (`OmsAuth`) and posts it in as `host.auth.grant`; OMS trades it for an
 *   httpOnly cookie of its own and uses it for every request it makes.
 *
 * The handshake is child-driven. The portal cannot know when the OMS bundle has parsed and
 * attached its listener, so it never sends first — it waits for `oms.ready` and answers. OMS
 * sends `oms.ready` again after every reload (including a dev-server hot reload), so the answer
 * must be re-sent every time rather than once per session. That invariant is what makes the
 * handoff survive a reload inside the frame without the merchant noticing.
 *
 * `connected` and `authState` exist so the integration is visible without opening devtools:
 * Settings → Appearance shows whether OMS answered, when the theme last went out, and whether the
 * token was accepted.
 */
/** How far the token handoff has got for the frame currently on screen. */
type HandoffState = 'idle' | 'sent' | 'accepted' | 'rejected';

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
    if (event.origin !== OMS_ORIGIN) return;
    if (!this.frame || event.source !== this.frame.contentWindow) return;

    const message = event.data as { source?: unknown; v?: unknown; type?: unknown } | null;
    if (typeof message !== 'object' || message === null) return;
    if (message.source !== OMS_MESSAGE_SOURCE || message.v !== OMS_PROTOCOL_VERSION) return;

    if (message.type === 'oms.ready') {
      this.ready.set(true);
      this.sendTheme(this.theme.resolved(), this.theme.accent());
      // Answered with a token as well as a theme. OMS asks separately (`oms.auth.renew`) only
      // when it already had a session and it stopped working, so granting here covers the first
      // load and every reload with no extra round trip.
      void this.sendGrant();
    }

    // OMS took the token and could not use it. Re-requesting would produce the same answer from
    // the same session, so this is surfaced rather than retried.
    if (message.type === 'oms.auth.failed') {
      this.handoff.set('rejected');
    }

    if (message.type === 'oms.auth.ok') {
      this.handoff.set('accepted');
    }

    // OMS has no valid session and is asking for one. `force` because whatever it held is no
    // longer accepted — a revoke, or a reseed of the OMS backend.
    if (message.type === 'oms.auth.renew') {
      void this.sendGrant(true);
    }

    // `oms.route.changed` is specified in `auth.md` section 8 and handled when that phase lands.
    // Unhandled types fall through, which is the intended behaviour: it is what lets OMS add a
    // message before the portal knows about it.
  }

  /**
   * Asks our backend for an access token and posts it into the frame.
   *
   * The token is handed straight over and never kept: this method is the only code on the portal
   * side that holds it, and only for the length of one call.
   *
   * A failure is posted as `host.auth.denied` rather than left silent, so OMS can tell the
   * merchant why it is empty instead of showing a spinner that never resolves.
   */
  private async sendGrant(force = false): Promise<void> {
    const target = this.frame?.contentWindow;
    if (!target) return;

    const token = await this.auth.token(force);

    // The frame may have been replaced, or the page left, while the request was in flight.
    if (this.frame?.contentWindow !== target) return;

    if (!token) {
      this.handoff.set('rejected');
      target.postMessage(
        {
          source: HOST_MESSAGE_SOURCE,
          v: OMS_PROTOCOL_VERSION,
          type: 'host.auth.denied',
          reason: 'token_request_failed',
        },
        OMS_ORIGIN,
      );
      return;
    }

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
}
