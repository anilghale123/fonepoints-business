import { Injectable, computed, inject, signal } from '@angular/core';
import { FONEPOINTS_API_URL } from './config';
import { Profile } from './profile';

export type OmsAuthStatus = 'idle' | 'requesting' | 'granted' | 'failed';

/** Why there is no token, as OMS understands it (`host.auth.denied { reason }`). */
export type OmsDenyReason = 'no_session' | 'token_request_failed';

@Injectable({ providedIn: 'root' })
export class OmsAuth {
  private readonly profile = inject(Profile);

  private readonly state = signal<OmsAuthStatus>('idle');
  private readonly error = signal<string | null>(null);
  private readonly denied = signal<OmsDenyReason>('token_request_failed');

  readonly status = computed(() => this.state());
  readonly failure = computed(() => this.error());
  /** Why the last request gave no token, for `host.auth.denied`. */
  readonly denyReason = computed(() => this.denied());

  /**
   * The portal keeps no token. OMS tokens do not expire, so one held here would sit where any
   * script on the page could read it, to save a backend call that happens only when OMS has no
   * cookie. The token goes from the backend to OMS and is dropped. Whether the backend keeps one
   * between visits is the backend's call.
   *
   * In flight, if a request is already running.
   *
   * OMS asks once per handshake, but a reload inside the frame, or a second frame, can ask again
   * before the first answer is back. The token in flight is just as good, so it is shared rather
   * than requested twice. It is shared only while the request runs, not afterwards.
   */
  private inFlight: Promise<string | null> | null = null;

  /** A token for the current merchant, or `null` with `failure()` and `denyReason()` set. */
  token(): Promise<string | null> {
    if (this.inFlight) return this.inFlight;

    this.state.set('requesting');
    this.error.set(null);

    this.inFlight = this.request().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  /** Reset the status shown in settings, at portal sign-out. There is no token to forget. */
  clear(): void {
    this.state.set('idle');
  }

  private async request(): Promise<string | null> {
    // The portal session is what names the merchant, so it has to exist
    const signedIn = await this.ensureSession();
    if (!signedIn) {
      return this.fail('no_session', 'Could not sign in to the Fonepoints backend.');
    }

    try {
      const res = await fetch(`${FONEPOINTS_API_URL}/api/oms/token`, {
        method: 'POST',
        // The portal session cookie names the merchant. No body: the backend decides the rest.
        credentials: 'include',
      });

      const body = (await res.json().catch(() => null)) as
        | { accessToken?: string; error?: { message?: string } }
        | null;

      if (res.status === 401) {
        return this.fail('no_session', body?.error?.message ?? 'Your portal session has ended.');
      }
      if (!res.ok || !body?.accessToken) {
        return this.fail(
          'token_request_failed',
          body?.error?.message ?? 'The Fonepoints backend could not get an OMS access token.',
        );
      }

      this.state.set('granted');
      return body.accessToken;
    } catch {
      return this.fail(
        'token_request_failed',
        `Could not reach the Fonepoints backend at ${FONEPOINTS_API_URL}. Is it running?`,
      );
    }
  }

  private fail(reason: OmsDenyReason, message: string): null {
    this.denied.set(reason);
    this.state.set('failed');
    this.error.set(message);
    return null;
  }

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
