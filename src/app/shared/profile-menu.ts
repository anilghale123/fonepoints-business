import { Component, ElementRef, inject, output, signal } from '@angular/core';
import { Profile } from '../core/profile';
import { Theme } from '../core/theme';
import type { SettingsSection } from './settings-dialog';

/**
 * The avatar in the top bar and the menu behind it.
 *
 * Mirrors the user menu in OMS — the identity row, Profile, Settings, Switch theme, Sign out —
 * so the two apps present the same affordances in the same order. "Switch theme" flips light and
 * dark straight from the menu; the full picker lives in Settings → Appearance.
 *
 * Sign out is disabled: authentication is deferred, so there is no session to end
 * (`auth.md`). It is shown rather than hidden, because its absence would read as missing rather
 * than pending.
 */
@Component({
  selector: 'fp-profile-menu',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  styles: [
    `
      :host {
        position: relative;
        display: block;
      }

      .trigger {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: var(--fp-accent-soft);
        color: var(--fp-accent);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }

      .menu {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 40;
        width: 264px;
        padding: 6px;
        border: 1px solid var(--fp-border);
        border-radius: 12px;
        background: var(--fp-surface-raised);
        box-shadow: var(--fp-overlay-shadow);
      }

      .identity {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:hover {
          background: var(--fp-bg);
        }
      }

      .identity .avatar-sm {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--fp-accent-soft);
        color: var(--fp-accent);
        font-size: 11px;
        font-weight: 600;
      }

      .identity .text {
        min-width: 0;
      }

      .identity .who {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .identity .name {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .role {
        flex-shrink: 0;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--fp-bg);
        color: var(--fp-fg-secondary);
        font-size: 11px;
        font-weight: 500;
      }

      .identity .email {
        font-size: 12px;
        color: var(--fp-fg-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      hr {
        height: 1px;
        margin: 6px 4px;
        border: 0;
        background: var(--fp-border);
      }

      .item {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 8px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--fp-fg);
        font: inherit;
        text-align: left;
        cursor: pointer;

        svg {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          color: var(--fp-fg-secondary);
        }

        &:hover:not(:disabled) {
          background: var(--fp-bg);
        }

        &:disabled {
          color: var(--fp-fg-tertiary);
          cursor: default;

          svg {
            color: var(--fp-fg-tertiary);
          }
        }
      }

      .shortcut {
        margin-left: auto;
        color: var(--fp-fg-tertiary);
        font-size: 11px;
        letter-spacing: 0.02em;
      }
    `,
  ],
  template: `
    <button
      class="trigger"
      type="button"
      aria-label="User menu"
      aria-haspopup="menu"
      [attr.aria-expanded]="openState()"
      (click)="toggle()"
    >
      {{ profile.initials() }}
    </button>

    @if (openState()) {
      <div class="menu" role="menu">
        <button class="identity" type="button" role="menuitem" (click)="pick('profile')">
          <span class="avatar-sm">{{ profile.initials() }}</span>
          <span class="text">
            <span class="who">
              <span class="name">{{ profile.user().name }}</span>
              <span class="role">{{ profile.user().role }}</span>
            </span>
            <span class="email">{{ profile.user().email }}</span>
          </span>
        </button>

        <hr />

        <button class="item" type="button" role="menuitem" (click)="pick('profile')">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M19 20v-1.5a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4V20M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Profile
        </button>

        <button class="item" type="button" role="menuitem" (click)="pick('appearance')">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Settings
        </button>

        <button class="item" type="button" role="menuitem" (click)="switchTheme()">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3v1.5M12 19.5V21M4.2 4.2l1.1 1.1M18.7 18.7l1.1 1.1M3 12h1.5M19.5 12H21M4.2 19.8l1.1-1.1M18.7 5.3l1.1-1.1M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Switch theme
          <span class="shortcut">{{ theme.resolved() === 'dark' ? 'to light' : 'to dark' }}</span>
        </button>

        <hr />

        <button class="item" type="button" role="menuitem" disabled>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 17l5-5-5-5M20 12H9M12 20H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Sign out
        </button>
      </div>
    }
  `,
})
export class ProfileMenu {
  protected readonly profile = inject(Profile);
  protected readonly theme = inject(Theme);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Which settings section to open. The dialog itself is owned by the shell. */
  readonly openSettings = output<SettingsSection>();

  protected readonly openState = signal(false);

  protected toggle(): void {
    this.openState.update((open) => !open);
  }

  protected close(): void {
    this.openState.set(false);
  }

  protected pick(section: SettingsSection): void {
    this.close();
    this.openSettings.emit(section);
  }

  protected switchTheme(): void {
    this.theme.toggle();
    this.close();
  }

  /**
   * Closes on a click anywhere outside.
   *
   * The trigger's own click also reaches the document, so a click on it would toggle open and
   * then immediately close. Containment is checked rather than stopping propagation, because
   * swallowing the event would break any other document-level listener.
   */
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.openState()) return;
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) this.close();
  }
}
