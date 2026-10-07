import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OmsBridge } from '../core/oms-bridge';
import { Profile, type PortalUser } from '../core/profile';
import { Theme } from '../core/theme';

/** Which pane of the dialog is showing. */
export type SettingsSection = 'profile' | 'appearance';

/**
 * Profile and Appearance in one dialog with a section list, the same shape as the settings
 * dialog in OMS — so the merchant meets one pattern on both sides of the iframe.
 *
 * Appearance is portal-wide: the mode and accent chosen here style this chrome and are forwarded
 * to the embedded OMS over the host channel. The status line under the accent grid reports
 * whether OMS is listening and when the theme last went out, so the integration can be checked
 * without opening devtools.
 *
 * Built on the native `<dialog>` element, which brings the backdrop, Escape-to-close and focus
 * containment with no library.
 */
@Component({
  selector: 'fp-settings-dialog',
  imports: [FormsModule],
  styles: [
    `
      dialog {
        width: min(720px, calc(100vw - 32px));
        padding: 0;
        border: 1px solid var(--fp-border);
        border-radius: 14px;
        background: var(--fp-surface);
        color: var(--fp-fg);
        box-shadow: var(--fp-overlay-shadow);
        overflow: hidden;
      }

      dialog::backdrop {
        background: rgb(8 12 20 / 48%);
      }

      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--fp-border);
      }

      .head h2 {
        font-size: 15px;
      }

      .head p {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--fp-fg-secondary);
      }

      .close {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        border: 1px solid var(--fp-border);
        border-radius: 8px;
        background: var(--fp-surface);
        color: var(--fp-fg-secondary);
        cursor: pointer;

        svg {
          width: 16px;
          height: 16px;
        }

        &:hover {
          background: var(--fp-bg);
          color: var(--fp-fg);
        }
      }

      .body {
        display: grid;
        grid-template-columns: 176px 1fr;
        min-height: 340px;
      }

      .sections {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px;
        border-right: 1px solid var(--fp-border);
        background: var(--fp-bg);
      }

      .section-button {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 8px 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--fp-fg-secondary);
        font: inherit;
        font-weight: 500;
        text-align: left;
        cursor: pointer;

        svg {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        &:hover {
          background: var(--fp-surface);
          color: var(--fp-fg);
        }

        &.active {
          background: var(--fp-accent-soft);
          color: var(--fp-accent);
        }
      }

      .panel {
        padding: 18px;
      }

      .panel h3 {
        font-size: 13px;
      }

      .hint {
        margin: 2px 0 12px;
        font-size: 12px;
        color: var(--fp-fg-secondary);
      }

      .identity {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 18px;
      }

      .avatar-lg {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--fp-accent-soft);
        color: var(--fp-accent);
        font-size: 17px;
        font-weight: 600;
      }

      .identity p {
        margin: 0;
      }

      .identity .who {
        font-weight: 600;
      }

      .identity .what {
        font-size: 12px;
        color: var(--fp-fg-secondary);
      }

      .field {
        margin-bottom: 14px;
      }

      .field label {
        display: block;
        margin-bottom: 5px;
        font-size: 12px;
        font-weight: 500;
        color: var(--fp-fg-secondary);
      }

      .field input,
      .field select {
        width: 100%;
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--fp-border);
        border-radius: 8px;
        background: var(--fp-surface);
        color: var(--fp-fg);
        font: inherit;
      }

      .modes {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 20px;
      }

      .mode {
        padding: 10px;
        border: 1px solid var(--fp-border);
        border-radius: 10px;
        background: var(--fp-surface);
        color: var(--fp-fg);
        font: inherit;
        font-weight: 500;
        cursor: pointer;

        &:hover {
          border-color: var(--fp-accent);
        }

        &.active {
          border-color: var(--fp-accent);
          background: var(--fp-accent-soft);
          color: var(--fp-accent);
        }
      }

      .accents {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
      }

      .accent {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 8px 9px;
        border: 1px solid var(--fp-border);
        border-radius: 10px;
        background: var(--fp-surface);
        color: var(--fp-fg);
        font: inherit;
        font-size: 12px;
        text-align: left;
        cursor: pointer;

        &:hover {
          border-color: var(--fp-accent);
        }

        &.active {
          border-color: var(--fp-accent);
          background: var(--fp-accent-soft);
        }
      }

      /* The swatch carries data-accent itself, so it paints with that accent's own token
         rather than a colour this component would have to keep a copy of. */
      .swatch {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--fp-accent);
      }

      .link-status {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 20px;
        padding: 10px 12px;
        border: 1px solid var(--fp-border);
        border-radius: 10px;
        background: var(--fp-bg);
        font-size: 12px;
        color: var(--fp-fg-secondary);
      }

      .dot {
        width: 8px;
        height: 8px;
        flex-shrink: 0;
        border-radius: 50%;
        background: var(--fp-fg-tertiary);

        &.live {
          background: oklch(0.633 0.17 148.732);
        }
      }

      .foot {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 18px;
        border-top: 1px solid var(--fp-border);
        background: var(--fp-bg);
      }

      .button {
        height: 34px;
        padding: 0 14px;
        border: 1px solid var(--fp-border);
        border-radius: 8px;
        background: var(--fp-surface);
        color: var(--fp-fg);
        font: inherit;
        font-weight: 500;
        cursor: pointer;

        &:hover {
          background: var(--fp-bg);
        }

        &.primary {
          border-color: transparent;
          background: var(--fp-accent);
          color: var(--fp-accent-fg);

          &:hover {
            background: var(--fp-accent-hover);
          }
        }
      }
    `,
  ],
  template: `
    <dialog #dlg (close)="closed.emit()" (click)="onBackdropClick($event)">
      <div class="head">
        <div>
          <h2>Settings</h2>
          <p>Your profile, and how the portal looks.</p>
        </div>
        <button class="close" type="button" aria-label="Close" (click)="dlg.close()">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="body">
        <div class="sections">
          <button
            class="section-button"
            type="button"
            [class.active]="section() === 'profile'"
            (click)="section.set('profile')"
          >
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
          <button
            class="section-button"
            type="button"
            [class.active]="section() === 'appearance'"
            (click)="section.set('appearance')"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5S13 18 13 17c0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3ZM7.5 10.5h.01M11 7.5h.01M15.5 8.5h.01"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Appearance
          </button>
        </div>

        <div class="panel">
          @if (section() === 'profile') {
            <div class="identity">
              <div class="avatar-lg">{{ profile.initials() }}</div>
              <div>
                <p class="who">{{ profile.user().name }}</p>
                <p class="what">{{ profile.user().role }} · {{ profile.user().email }}</p>
              </div>
            </div>

            <div class="field">
              <label for="fp-name">Name</label>
              <input id="fp-name" type="text" [(ngModel)]="draftName" autocomplete="off" />
            </div>
            <div class="field">
              <label for="fp-email">Email</label>
              <input id="fp-email" type="email" [(ngModel)]="draftEmail" autocomplete="off" />
            </div>
            <div class="field">
              <label for="fp-role">Role</label>
              <select id="fp-role" [(ngModel)]="draftRole">
                @for (role of profile.roles; track role) {
                  <option [value]="role">{{ role }}</option>
                }
              </select>
            </div>
          } @else {
            <h3>Mode</h3>
            <p class="hint">Applies to the portal and to the embedded OMS.</p>
            <div class="modes">
              @for (mode of theme.modes; track mode.id) {
                <button
                  class="mode"
                  type="button"
                  [class.active]="theme.mode() === mode.id"
                  (click)="theme.setMode(mode.id)"
                >
                  {{ mode.label }}
                </button>
              }
            </div>

            <h3>Accent</h3>
            <p class="hint">Forwarded to OMS, which maps the id to the same colour.</p>
            <div class="accents">
              @for (accent of theme.accents; track accent.id) {
                <button
                  class="accent"
                  type="button"
                  [class.active]="theme.accent() === accent.id"
                  (click)="theme.setAccent(accent.id)"
                >
                  <span class="swatch" [attr.data-accent]="accent.id"></span>
                  {{ accent.label }}
                </button>
              }
            </div>

            <p class="link-status">
              <span class="dot" [class.live]="bridge.connected()"></span>
              <span>{{ linkStatus() }}</span>
            </p>

            <p class="link-status">
              <span class="dot" [class.live]="bridge.authState() === 'accepted'"></span>
              <span>{{ authStatus() }}</span>
            </p>
          }
        </div>
      </div>

      <div class="foot">
        @if (section() === 'profile') {
          <button class="button" type="button" (click)="dlg.close()">Cancel</button>
          <button class="button primary" type="button" (click)="saveProfile(); dlg.close()">
            Save changes
          </button>
        } @else {
          <button class="button" type="button" (click)="resetAppearance()">Reset</button>
          <button class="button primary" type="button" (click)="dlg.close()">Done</button>
        }
      </div>
    </dialog>
  `,
})
export class SettingsDialog {
  protected readonly theme = inject(Theme);
  protected readonly profile = inject(Profile);
  protected readonly bridge = inject(OmsBridge);

  /** Opening, and which section opens, are both driven from the parent. */
  readonly open = input(false);
  readonly initialSection = input<SettingsSection>('profile');
  readonly closed = output<void>();

  protected readonly section = signal<SettingsSection>('profile');

  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dlg');

  /**
   * Profile edits are drafted, so Cancel really cancels.
   *
   * Appearance is applied live instead, with no Save: a theme you cannot see until you commit it
   * is not a theme picker. Reset puts both back to the defaults.
   */
  protected draftName = '';
  protected draftEmail = '';
  protected draftRole = '';

  protected readonly linkStatus = computed(() => {
    if (!this.bridge.connected()) return 'OMS is not open — the theme is sent when it loads.';
    const at = this.bridge.lastSentAt();
    if (!at) return 'OMS is connected.';
    return `OMS is connected — theme sent at ${at.toLocaleTimeString()}.`;
  });

  /**
   * The token handoff, in words.
   *
   * It is shown next to the theme line because they are two halves of the same channel: if the
   * theme arrived and the token did not, the problem is the Fonepoints backend or the OMS API key,
   * not the iframe. That distinction is the one worth being able to make without devtools.
   */
  protected readonly authStatus = computed(() => {
    switch (this.bridge.authState()) {
      case 'accepted':
        return 'OMS accepted the access token.';
      case 'sent':
        return 'Access token sent — waiting for OMS to confirm.';
      case 'rejected':
        return this.bridge.authFailure() ?? 'OMS could not use the access token.';
      default:
        return 'No access token sent yet — one is issued when OMS opens.';
    }
  });

  constructor() {
    effect(() => {
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) return;

      if (this.open()) {
        this.section.set(this.initialSection());
        const user = this.profile.user();
        this.draftName = user.name;
        this.draftEmail = user.email;
        this.draftRole = user.role;
        if (!dialog.open) dialog.showModal();
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  protected saveProfile(): void {
    this.profile.save({
      name: this.draftName.trim() || 'Merchant User',
      email: this.draftEmail.trim(),
      role: this.draftRole,
    } satisfies PortalUser);
  }

  protected resetAppearance(): void {
    this.theme.reset();
  }

  /** The native backdrop belongs to the dialog element, so a click on it lands on the dialog. */
  protected onBackdropClick(event: MouseEvent): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog && event.target === dialog) dialog.close();
  }
}
