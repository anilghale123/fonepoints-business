import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalSession } from '../../core/portal-session';
import { FonepointsLogo } from '../../shared/fonepoints-logo';

/**
 * The portal's login. Free: any name and email signs in and nothing is checked — there is no
 * Fonepoints identity provider behind it yet. The one field that matters is the merchant id, which
 * names whose OMS orders the merchant sees; it defaults to the development merchant.
 *
 * Signing in makes the backend set the portal's `fp_session` cookie. Everything after that — the
 * route guard, the OMS token request — rides on it.
 */
@Component({
  selector: 'fp-login-page',
  imports: [FormsModule, FonepointsLogo],
  styles: [
    `
      :host {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 24px;
        background: var(--fp-bg);
      }

      .card {
        width: 100%;
        max-width: 380px;
        padding: 28px;
        border: 1px solid var(--fp-border);
        border-radius: 14px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 20px;
      }

      .brand span {
        color: var(--fp-fg-secondary);
        font-size: 14px;
      }

      h1 {
        margin: 0 0 4px;
        font-size: 20px;
        color: var(--fp-fg);
      }

      .lead {
        margin: 0 0 20px;
        color: var(--fp-fg-secondary);
        font-size: 13px;
      }

      label {
        display: block;
        margin-bottom: 14px;
        color: var(--fp-fg);
        font-size: 13px;
        font-weight: 500;
      }

      input {
        display: block;
        width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        padding: 9px 11px;
        border: 1px solid var(--fp-border);
        border-radius: 8px;
        background: transparent;
        color: var(--fp-fg);
        font: inherit;
      }

      input:focus-visible {
        outline: 2px solid var(--fp-accent);
        outline-offset: 1px;
      }

      .hint {
        display: block;
        margin-top: 4px;
        color: var(--fp-fg-tertiary);
        font-size: 12px;
        font-weight: 400;
      }

      .error {
        margin: 0 0 14px;
        padding: 9px 11px;
        border: 1px solid var(--fp-border);
        border-radius: 8px;
        color: var(--fp-fg);
        font-size: 13px;
      }

      button {
        width: 100%;
        padding: 10px 14px;
        border: 0;
        border-radius: 8px;
        background: var(--fp-accent);
        color: var(--fp-accent-fg);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
      }

      button:hover:not(:disabled) {
        background: var(--fp-accent-hover);
      }

      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
    `,
  ],
  template: `
    <form class="card" (ngSubmit)="submit()">
      <div class="brand">
        <fp-logo [height]="20" />
        <span>Business</span>
      </div>
      <h1>Sign in</h1>
      <p class="lead">Any name and email works. Nothing is checked.</p>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      <label>
        Name
        <input name="name" [(ngModel)]="name" autocomplete="name" placeholder="Hamro Mobile" />
      </label>
      <label>
        Email
        <input
          name="email"
          [(ngModel)]="email"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
        />
      </label>
      <label>
        Merchant ID
        <input name="merchantId" [(ngModel)]="merchantId" autocomplete="off" placeholder="M-1029" />
        <span class="hint">Your Providhy merchant id. It decides whose OMS orders you see.</span>
      </label>

      <button type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
    </form>
  `,
})
export class LoginPage {
  private readonly session = inject(PortalSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected name = '';
  protected email = '';
  protected merchantId = 'M-1029';

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const failure = await this.session.login({
      name: this.name,
      email: this.email,
      merchantId: this.merchantId,
    });
    this.busy.set(false);
    if (failure) {
      this.error.set(failure);
      return;
    }
    // Back to where the guard sent them from, if that is a page inside the portal.
    const back = this.route.snapshot.queryParamMap.get('returnUrl');
    const inPortal = back && back.startsWith('/') && !back.startsWith('//');
    void this.router.navigateByUrl(inPortal ? back : '/dashboard');
  }
}
