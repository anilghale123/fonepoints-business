import {
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { OMS_ORIGIN } from '../../core/config';
import { trace } from '../../core/debug-log';
import { OmsBridge } from '../../core/oms-bridge';
import { OmsSkeleton } from './oms-skeleton';

/** How long the skeleton takes to fade into the loaded frame; keep in step with `.cover`. */
const REVEAL_MS = 160;

/**
 * OMS, embedded, and kept alive.
 *
 * OMS is a separate Next.js application. The frame gets the portal's whole content area and
 * nothing else — no card, no padding, no heading — because OMS draws its own page header and
 * table inside it. The portal supplies the sidebar and top bar; OMS's `/embed/*` surface
 * deliberately renders neither.
 *
 * **It lives in the shell, not in the `/oms` route.** The shell creates it the first time the
 * merchant opens OMS and keeps it while they visit other portal pages: it is only hidden
 * (`visible` false), so coming back costs no reload, no boot and no session check, and the merchant
 * is in the same OMS session, with its data already in memory; OMS reopens on its order queue, like
 * any portal section opened from the sidebar. The switch to the queue happens as the merchant
 * *leaves* (`leave()`), while the frame is hidden, so there is nothing to see on return.
 * `OmsFrameKeeper` decides when it exists:
 * it is destroyed on sign-out, when the portal session ends, and when a different merchant is
 * signed in, so a frame never outlives the merchant whose orders it holds. When the merchant comes
 * back, OMS is told (`host.visible`) and refreshes what went stale while it was hidden.
 *
 * Hidden with `visibility: hidden` rather than `display: none`: the frame keeps its size, so OMS's
 * layout does not change under it, and it is still out of the accessibility tree, unfocusable and
 * not painted.
 *
 * Angular blocks an iframe `src` it considers untrusted, so the URL is passed through
 * `DomSanitizer`. That is safe here because the origin is our own configuration constant, never
 * user input.
 *
 * The frame is registered with `OmsBridge` for as long as it exists. That is what gives the bridge
 * something to talk to: it answers OMS's `oms.ready` with the current theme, and pushes every later
 * change, hidden or not. The URL carries the theme as a fragment too, as a pre-paint hint, so OMS
 * does not flash light inside a dark portal before the first message lands.
 *
 * Until the frame loads, it is covered by OMS's own loading screen (`OmsSkeleton`) rather than a
 * spinner, which fades out into the frame, by then painting that same skeleton. The merchant sees
 * one loading state from the click to the orders.
 */
@Component({
  selector: 'fp-oms-frame',
  imports: [OmsSkeleton],
  host: { '[class.hidden]': '!visible()' },
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
      }

      :host(.hidden) {
        visibility: hidden;
        pointer-events: none;
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

      .cover {
        position: absolute;
        inset: 0;
        transition: opacity 160ms ease-out;
      }

      .cover.leaving {
        opacity: 0;
        pointer-events: none;
      }

      /* Pinned to the top: left at its static place, under the full-height frame, it overflowed
         the page by a pixel, and the scrollbar that caused narrowed the frame. */
      .sr-only {
        position: absolute;
        top: 0;
        left: 0;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
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
        background: var(--fp-accent);
        color: var(--fp-accent-fg);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }

      .retry:hover {
        background: var(--fp-accent-hover);
      }
    `,
  ],
  template: `
    <div class="frame-wrap">
      <iframe
        #frame
        [src]="src"
        title="Order Management System"
        (load)="onLoad()"
        referrerpolicy="origin"
      ></iframe>

      @if (covered()) {
        <fp-oms-skeleton class="cover" [class.leaving]="loaded()" />
        <p class="sr-only" role="status">Loading OMS…</p>
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
export class OmsFrame implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly bridge = inject(OmsBridge);

  /** OMS is the page on screen. False while the merchant is on another portal page. */
  readonly visible = input(true);

  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  /** Whether the frame was on screen at the last change, to tell "shown again" from the first show. */
  private wasVisible = true;

  protected readonly omsOrigin = OMS_ORIGIN;
  protected readonly loaded = signal(false);
  /** The skeleton is on screen: until the frame loads, then for the length of the fade. */
  protected readonly covered = signal(true);
  protected readonly failed = signal(false);
  private revealTimer: ReturnType<typeof setTimeout> | undefined;
  protected src: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    this.bridge.embedUrl(),
  );

  constructor() {
    trace('page', `step 1 · merchant opened OMS; framing ${OMS_ORIGIN} (no token in the URL)`);
    // Re-registers whenever the element identity changes, which `reload()` deliberately causes.
    effect(() => this.bridge.register(this.frame()?.nativeElement ?? null));

    // Leaving OMS: send it to its queue while it is hidden. Back on OMS after other portal pages:
    // nothing in the frame was refetched meanwhile.
    effect(() => {
      const visible = this.visible();
      if (!visible && this.wasVisible) this.bridge.leave();
      if (visible && !this.wasVisible) this.bridge.showAgain();
      this.wasVisible = visible;
    });
  }

  ngOnDestroy(): void {
    // The frame is discarded (sign-out, another merchant), so the bridge must stop treating it as
    // connected — otherwise a later theme change would post into a detached window.
    this.bridge.register(null);
    clearTimeout(this.timeout);
    clearTimeout(this.revealTimer);
  }

  /** A refused frame never fires `load`, so a timeout is the only signal the browser gives us. */
  private timeout = setTimeout(() => {
    if (!this.loaded()) {
      trace(
        'page',
        '✖ step 3 · OMS did not load within 12 s: blocked by frame-ancestors, or not running',
      );
      this.failed.set(true);
    }
  }, 12000);

  protected onLoad(): void {
    // The browser fires `load` for the frame's initial about:blank document the moment Angular
    // inserts it, before OMS has even been requested. Counting that one hid the skeleton at once
    // and cancelled the timeout, so only OMS's own document counts.
    if (this.showsInitialBlank()) return;
    trace('page', 'step 3–4 · the OMS frame loaded (the browser allowed the framing)');
    clearTimeout(this.timeout);
    this.loaded.set(true);
    this.failed.set(false);
    // The frame is already painting the same skeleton, so fade into it rather than cut.
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => this.covered.set(false), REVEAL_MS);
  }

  /**
   * Whether the frame still holds its initial about:blank document. That one is same-origin, so
   * its location is readable; OMS's document is cross-origin, and reading it throws.
   */
  private showsInitialBlank(): boolean {
    try {
      return this.frame()?.nativeElement.contentWindow?.location.href === 'about:blank';
    } catch {
      return false;
    }
  }

  protected reload(): void {
    this.failed.set(false);
    this.loaded.set(false);
    this.covered.set(true);
    clearTimeout(this.revealTimer);
    // Changing the reference makes Angular re-create the iframe.
    this.src = this.sanitizer.bypassSecurityTrustResourceUrl(this.bridge.embedUrl(true));
    this.timeout = setTimeout(() => {
      if (!this.loaded()) this.failed.set(true);
    }, 12000);
  }
}
