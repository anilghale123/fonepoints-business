import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { trace } from './debug-log';
import { PortalSession, type PortalSessionUser } from './portal-session';

/**
 * Keeps the OMS frame alive between visits, for one merchant only.
 *
 * Opening OMS used to build a new iframe every time: OMS downloaded, booted and fetched its orders
 * again on each click. Now the shell creates the frame (`OmsFrame`) the first time the merchant
 * opens OMS and keeps it while they visit other portal pages; the `/oms` route only shows it
 * (`OmsPage` calls `show()` and `hide()`).
 *
 * **A kept frame holds one merchant's orders in memory, so it never outlives that merchant.** It
 * belongs to whoever was signed in when it was created, and it is destroyed the moment that stops
 * being true:
 *
 * - **sign-out** — `discard()`, called first thing by the profile menu;
 * - **the portal session ending** — the user becomes `null` (`PortalSession.expired()`);
 * - **another merchant signing in** — the user no longer matches the frame's owner.
 *
 * The next merchant then gets a fresh frame, and a fresh OMS session, when they open OMS. Merchants
 * who never open OMS never load it.
 */
@Injectable({ providedIn: 'root' })
export class OmsFrameKeeper {
  private readonly session = inject(PortalSession);

  /** The merchant the frame belongs to; `null` when there is no frame. */
  private readonly owner = signal<PortalSessionUser | null>(null);

  private readonly onScreen = signal(false);

  /** The frame exists, and belongs to the merchant signed in now. */
  readonly kept = computed(() => {
    const owner = this.owner();
    const user = this.session.user();
    return owner !== null && user !== null && sameMerchant(owner, user);
  });

  /** OMS is the page on screen. */
  readonly visible = this.onScreen.asReadonly();

  constructor() {
    // `kept` already turns false the instant the user changes; this forgets the owner too, so
    // the same merchant signing in again does not bring the old frame back before they open OMS.
    effect(() => {
      const user = this.session.user();
      const owner = untracked(this.owner);
      if (owner && (!user || !sameMerchant(owner, user))) {
        trace('page', 'the merchant changed or signed out: discarding the kept OMS frame');
        this.owner.set(null);
      }
    });
  }

  /** The merchant opened OMS: create the frame if this merchant has none, and show it. */
  show(): void {
    const user = this.session.user();
    if (!user) return;
    if (!this.kept()) {
      trace('page', 'OMS opened: creating the OMS frame and keeping it for this merchant');
      this.owner.set(user);
    } else {
      trace('page', 'OMS opened again: showing the kept frame (no reload)');
    }
    this.onScreen.set(true);
  }

  /** The merchant went to another portal page: hide the frame, keep it. */
  hide(): void {
    this.onScreen.set(false);
  }

  /** Destroys the frame and what OMS holds in it. Sign-out calls this before anything else. */
  discard(): void {
    if (this.owner()) trace('page', 'discarding the kept OMS frame');
    this.owner.set(null);
    this.onScreen.set(false);
  }
}

/** The same signed-in merchant: same Providhy merchant id and same portal account. */
function sameMerchant(a: PortalSessionUser, b: PortalSessionUser): boolean {
  return a.merchantId === b.merchantId && a.email === b.email;
}
