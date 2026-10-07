import { Injectable, computed, effect, signal } from '@angular/core';

/**
 * The signed-in portal user.
 *
 * Dummy data, like everything else in this prototype: there is no authentication yet, so this
 * stands in for the Fonepoints session. The defaults deliberately match OMS's own placeholder
 * profile, so the same person appears on both sides of the iframe.
 *
 * When authentication lands this is replaced by the portal session, and the user it describes is
 * also what the OMS handoff token will carry (`auth.md` section 5) — at which point OMS stops
 * keeping a profile of its own.
 */

export interface PortalUser {
  name: string;
  email: string;
  role: string;
}

/** Offered in the profile form. Same list as OMS, so the role reads the same in both apps. */
export const ROLES: readonly string[] = ['Merchant', 'Owner', 'Staff'];

const DEFAULT: PortalUser = {
  name: 'Merchant User',
  email: 'merchant@fonepoints.local',
  role: 'Merchant',
};

const STORAGE_KEY = 'fp-profile';

function read(): PortalUser {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const value = JSON.parse(raw) as Partial<PortalUser>;
    return {
      name: typeof value.name === 'string' && value.name ? value.name : DEFAULT.name,
      email: typeof value.email === 'string' && value.email ? value.email : DEFAULT.email,
      role: typeof value.role === 'string' && value.role ? value.role : DEFAULT.role,
    };
  } catch {
    return DEFAULT;
  }
}

@Injectable({ providedIn: 'root' })
export class Profile {
  readonly user = signal<PortalUser>(read());

  readonly roles = ROLES;

  /** Up to two letters from the name, for the avatar. */
  readonly initials = computed(() => {
    const parts = this.user().name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return this.user().email.slice(0, 1).toUpperCase() || '?';
    return parts
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('');
  });

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.user()));
      } catch {
        // Storage can be blocked. The edit still applies for this session.
      }
    });
  }

  save(user: PortalUser): void {
    this.user.set(user);
  }
}
