import { Injectable, computed, inject, signal } from '@angular/core';
import { FONEPOINTS_API_URL } from './config';
import { Profile } from './profile';

/**
 * Where the OMS access token comes from.
 *
 * The flow this implements, in full:
 *
 *   1. The merchant presses OMS in the sidebar.
 *   2. This service asks **our own backend** for a token (`POST /api/oms/token`).
 *   3. That backend presents the OMS company API key to the OMS backend.
 *   4. OMS validates the key, resolves the merchant, and issues an access token.
 *   5. The token comes back here, and `OmsBridge` posts it into the iframe.
 *
 * Step 3 is the whole reason for the indirection: the API key is a company credential, and a
 * browser is the wrong place for it. This service never sees it.
 *
 * The token itself is held only in memory, and only until the frame has it. It is not stored:
 * reopening OMS takes one round trip, and a credential in `localStorage` outlives the reason it
 * was issued.
 */

export type OmsAuthStatus = 'idle' | 'requesting' | 'granted' | 'failed';

export interface OmsMerchant {
  merchantId: string;
  companyName: string;
  location: string;
  logoUrl: string;
}

@Injectable({ providedIn: 'root' })
export class OmsAuth {
  private readonly profile = inject(Profile);

  private readonly state = signal<OmsAuthStatus>('idle');
  private readonly error = signal<string | null>(null);
  private readonly merchantInfo = signal<OmsMerchant | null>(null);

  readonly status = computed(() => this.state());
  readonly failure = computed(() => this.error());
  readonly merchant = computed(() => this.merchantInfo());

  /**
   * In flight, if a request is already running.
   *
   * OMS announces `oms.ready` on every reload, and the bridge answers each one. Without this, a
   * dev-server hot reload inside the frame could start several token requests at once.
   */
  private inFlight: Promise<string | null> | null = null;

  /**
   * A token for the current merchant, or `null` with `failure()` set.
   *
   * `force` discards an in-flight request and starts a new one; it is what `oms.auth.renew` from
   * OMS means — the session it had has stopped working, so a cached answer is no use.
   */
  token(force = false): Promise<string | null> {
    if (this.inFlight && !force) return this.inFlight;

    this.state.set('requesting');
    this.error.set(null);

    this.inFlight = this.request().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async request(): Promise<string | null> {
    // The portal session is what names the merchant, so it has to exist before asking.
    const signedIn = await this.ensureSession();
    if (!signedIn) {
      this.state.set('failed');
      this.error.set('Could not sign in to the Fonepoints backend.');
      return null;
    }

    try {
      const res = await fetch(`${FONEPOINTS_API_URL}/api/oms/token`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      });

      const body = (await res.json().catch(() => null)) as
        | { accessToken?: string; merchant?: OmsMerchant; error?: { message?: string } }
        | null;

      if (!res.ok || !body?.accessToken) {
        this.state.set('failed');
        this.error.set(body?.error?.message ?? 'OMS refused to issue an access token.');
        return null;
      }

      this.merchantInfo.set(body.merchant ?? null);
      this.state.set('granted');
      return body.accessToken;
    } catch {
      this.state.set('failed');
      this.error.set(
        `Could not reach the Fonepoints backend at ${FONEPOINTS_API_URL}. Is it running?`,
      );
      return null;
    }
  }

  /**
   * Makes sure there is a portal session, signing in as the profile's email if there is not.
   *
   * The automatic sign-in is the demo shortcut: this prototype has no password screen, and the
   * profile in Settings is the stand-in for an identity. What matters for the handoff is that a
   * session exists at all — the merchant the token is for comes from it, server-side, so it cannot
   * be chosen by this code.
   */
  private async ensureSession(): Promise<boolean> {
    try {
      const existing = await fetch(`${FONEPOINTS_API_URL}/api/auth/session`, {
        credentials: 'include',
      });
      if (existing.ok) return true;

      const login = await fetch(`${FONEPOINTS_API_URL}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: this.profile.user().email }),
      });
      return login.ok;
    } catch {
      return false;
    }
  }
}
