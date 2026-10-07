import { Injectable, computed, effect, signal } from '@angular/core';

/**
 * Portal appearance: light/dark mode and the interactive accent.
 *
 * The portal owns the appearance for itself **and** for the applications it embeds. OMS follows
 * whatever is set here, pushed over the `host.theme` message (see `OmsBridge`), because a
 * merchant switching to dark in the portal expects the whole window to follow — not just the
 * chrome around a still-light iframe.
 *
 * Accent ids are OMS's `APPEARANCE_THEMES` ids, unchanged, so the value can be forwarded as-is
 * and OMS needs no translation table. OMS ignores an accent it does not recognise, which is what
 * lets the two apps deploy independently.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

/** What actually reaches the DOM. "system" is resolved before it is applied or forwarded. */
export type ResolvedMode = 'light' | 'dark';

export interface Accent {
  /** Must match an OMS `APPEARANCE_THEMES` id. */
  id: string;
  label: string;
}

/**
 * The accents offered in the portal.
 *
 * OMS ships nineteen; these eight are the visibly distinct span of them, which is what a theme
 * picker needs. Adding another is one entry here plus one `[data-accent]` rule in `styles.scss`
 * — nothing in OMS changes, because it already knows every id.
 */
export const ACCENTS: readonly Accent[] = [
  { id: 'fonepoints', label: 'Fonepoints' },
  { id: 'violet-blue', label: 'Violet Blue' },
  { id: 'blue', label: 'Blue' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'amber', label: 'Amber' },
  { id: 'purple', label: 'Purple' },
  { id: 'rose', label: 'Rose' },
  { id: 'gray', label: 'Gray' },
];

export const MODES: readonly { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

/** Default accent is the brand red, so the portal looks the same until someone changes it. */
const DEFAULT: Appearance = { mode: 'light', accent: 'fonepoints' };

const STORAGE_KEY = 'fp-appearance';

interface Appearance {
  mode: ThemeMode;
  accent: string;
}

const MODE_IDS = new Set<string>(MODES.map((mode) => mode.id));
const ACCENT_IDS = new Set<string>(ACCENTS.map((accent) => accent.id));

function read(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const value = JSON.parse(raw) as Partial<Appearance>;
    return {
      mode: value.mode && MODE_IDS.has(value.mode) ? value.mode : DEFAULT.mode,
      accent: value.accent && ACCENT_IDS.has(value.accent) ? value.accent : DEFAULT.accent,
    };
  } catch {
    // Private mode, blocked storage, or hand-edited JSON. The default is always usable.
    return DEFAULT;
  }
}

@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly stored = read();

  readonly mode = signal<ThemeMode>(this.stored.mode);
  readonly accent = signal<string>(this.stored.accent);

  /** Tracks the OS preference, so "system" reacts without a reload. */
  private readonly systemDark = signal(
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  );

  /** The mode after "system" is resolved. This is what the DOM and OMS both receive. */
  readonly resolved = computed<ResolvedMode>(() => {
    const mode = this.mode();
    if (mode === 'system') return this.systemDark() ? 'dark' : 'light';
    return mode;
  });

  readonly accents = ACCENTS;
  readonly modes = MODES;

  constructor() {
    if (typeof matchMedia === 'function') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) =>
        this.systemDark.set(event.matches),
      );
    }

    effect(() => {
      const root = document.documentElement;
      root.dataset['mode'] = this.resolved();
      root.dataset['accent'] = this.accent();

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ mode: this.mode(), accent: this.accent() } satisfies Appearance),
        );
      } catch {
        // Not worth failing a theme change over. The appearance still applies for this session.
      }
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
  }

  setAccent(accent: string): void {
    this.accent.set(accent);
  }

  /** Flips light and dark, turning "system" into whichever it currently resolves to. */
  toggle(): void {
    this.mode.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  /** Back to light and the brand accent. */
  reset(): void {
    this.mode.set(DEFAULT.mode);
    this.accent.set(DEFAULT.accent);
  }

  label(accentId: string): string {
    return ACCENTS.find((accent) => accent.id === accentId)?.label ?? accentId;
  }
}
