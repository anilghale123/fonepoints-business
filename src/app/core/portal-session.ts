import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FONEPOINTS_API_URL } from './config';
import { trace } from './debug-log';
import { Profile } from './profile';

/** What the login page sends. Nothing is validated: any of these may be empty. */
export interface LoginInput {
  name: string;
  email: string;
  merchantId: string;
}

export interface PortalSessionUser {
  name: string;
  email: string;
  role: string;
  /** The merchant's id in Providhy; it decides whose orders OMS shows. */
  merchantId: string;
}

/**
 * The portal's own session with `fonepoints-backend`.
 *
 * The backend owns it: `POST /api/auth/login` sets an httpOnly `fp_session` cookie, and every
 * later call (including the OMS token request) is made with `credentials: 'include'` so the cookie
 * travels. The portal itself never reads the cookie. This service only remembers who the backend
 * says is signed in, so the guard and the shell can react.
 *
 * This is the portal's login, separate from OMS's own cookie (`oms_at`, on OMS's site), which
 * `OmsBridge` manages through the handshake and the sign-out frame.
 */
@Injectable({ providedIn: 'root' })
export class PortalSession {
  private readonly router = inject(Router);
  private readonly profile = inject(Profile);

  private readonly current = signal<PortalSessionUser | null>(null);
  private checked = false;

  readonly user = computed(() => this.current());

  /**
   * Asks the backend whether the cookie is still good. Once per page load; later calls reuse the
   * answer, so navigating does not hit the backend on every route.
   */
  async restore(): Promise<PortalSessionUser | null> {
    if (this.checked) return this.current();
    try {
      const res = await fetch(`${FONEPOINTS_API_URL}/api/auth/session`, { credentials: 'include' });
      if (res.ok) this.adopt(((await res.json()) as { user: PortalSessionUser }).user);
      else this.current.set(null);
      trace(
        'auth',
        `portal session check: ${res.ok ? 'signed in' : `not signed in (HTTP ${res.status})`}`,
      );
    } catch {
      this.current.set(null);
      trace('auth', '✖ portal session check: could not reach the Fonepoints backend');
    }
    this.checked = true;
    return this.current();
  }

  /** Signs in. Resolves with an error message, or `null` on success. */
  async login(input: LoginInput): Promise<string | null> {
    try {
      const res = await fetch(`${FONEPOINTS_API_URL}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) return `The Fonepoints backend refused the sign-in (HTTP ${res.status}).`;
      this.adopt(((await res.json()) as { user: PortalSessionUser }).user);
      this.checked = true;
      trace('auth', `✔ signed in to the portal as merchant ${this.current()?.merchantId}`);
      return null;
    } catch {
      return `Could not reach the Fonepoints backend at ${FONEPOINTS_API_URL}. Is it running?`;
    }
  }

  /** Ends the portal session on the backend. OMS's own cookie is cleared separately. */
  async logout(): Promise<void> {
    try {
      await fetch(`${FONEPOINTS_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // The cookie expires on its own; the portal still forgets the user below.
    }
    this.current.set(null);
    trace('auth', 'portal session ended');
  }

  /**
   * The backend said there is no session (a 401 on the token request). Forget the user and send
   * them to the login page, coming back to where they were afterwards.
   */
  expired(): void {
    if (!this.current()) return;
    trace('auth', '✖ the portal session has ended: sending the merchant to the login page');
    this.current.set(null);
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  /** Keeps the profile shown in the menu and settings in step with who signed in. */
  private adopt(user: PortalSessionUser): void {
    this.current.set(user);
    this.profile.save({ name: user.name, email: user.email, role: user.role });
  }
}
