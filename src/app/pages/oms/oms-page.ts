import { Component, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { OMS_EMBED_URL, OMS_ORIGIN } from '../../core/config';

/**
 * OMS, embedded.
 *
 * OMS is a separate Next.js application. This page gives it the portal's whole content area and
 * nothing else — no card, no padding, no heading — because OMS draws its own page header and
 * table inside the frame. The portal supplies the sidebar and top bar; OMS's `/embed/*` surface
 * deliberately renders neither.
 *
 * Angular blocks an iframe `src` it considers untrusted, so the URL is passed through
 * `DomSanitizer`. That is safe here because the origin is our own configuration constant, never
 * user input.
 */
@Component({
  selector: 'fp-oms-page',
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .frame-wrap {
        position: relative;
        height: 100%;
      }

      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
      }

      .state {
        position: absolute;
        inset: 0;
        display: grid;
        place-content: center;
        gap: 10px;
        justify-items: center;
        padding: 24px;
        text-align: center;
        background: var(--fp-bg);
      }

      .spinner {
        width: 26px;
        height: 26px;
        border: 2.5px solid var(--fp-border);
        border-top-color: var(--fp-brand);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .state p {
        margin: 0;
        color: var(--fp-fg-secondary);
      }

      .state code {
        font-size: 12px;
        color: var(--fp-fg-tertiary);
      }

      .retry {
        margin-top: 4px;
        padding: 7px 14px;
        border: 0;
        border-radius: 8px;
        background: var(--fp-brand);
        color: #fff;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }

      .retry:hover {
        background: var(--fp-brand-hover);
      }
    `,
  ],
  template: `
    <div class="frame-wrap">
      <iframe
        [src]="src"
        title="Order Management System"
        (load)="onLoad()"
        referrerpolicy="origin"
      ></iframe>

      @if (!loaded()) {
        <div class="state">
          <div class="spinner"></div>
          <p>Loading OMS…</p>
          <code>{{ omsOrigin }}</code>
        </div>
      }

      @if (failed()) {
        <div class="state">
          <p><strong>OMS could not be loaded.</strong></p>
          <p>Check that it is running and that this origin is allowed to embed it.</p>
          <code>{{ omsOrigin }}</code>
          <button class="retry" type="button" (click)="reload()">Try again</button>
        </div>
      }
    </div>
  `,
})
export class OmsPage {
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly omsOrigin = OMS_ORIGIN;
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected src: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(OMS_EMBED_URL);

  /** A refused frame never fires `load`, so a timeout is the only signal the browser gives us. */
  private timeout = setTimeout(() => {
    if (!this.loaded()) this.failed.set(true);
  }, 12000);

  protected onLoad(): void {
    clearTimeout(this.timeout);
    this.loaded.set(true);
    this.failed.set(false);
  }

  protected reload(): void {
    this.failed.set(false);
    this.loaded.set(false);
    // Changing the reference makes Angular re-create the iframe.
    this.src = this.sanitizer.bypassSecurityTrustResourceUrl(`${OMS_EMBED_URL}?r=${Date.now()}`);
    this.timeout = setTimeout(() => {
      if (!this.loaded()) this.failed.set(true);
    }, 12000);
  }
}
