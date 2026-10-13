import { isDevMode } from '@angular/core';

/**
 * Trace logging for the OMS handoff, for testing it end to end.
 *
 * One line per thing that happens, prefixed `[Portal:<scope>]` so a test run can be filtered by
 * typing `[Portal` into the browser console, and tagged with the step number from the flow
 * document (`OMS-Fonepoints-Flow.docx`) wherever there is one. The OMS side prints the same way
 * with `[OMS:…]`, so both halves of one handshake read side by side.
 *
 * **It never prints a credential.** Anything under a key that looks like a token, key, cookie or
 * password is replaced with `<redacted, N chars>` before it is logged, and call sites log lengths
 * and outcomes rather than values.
 *
 * On in a development build, or in any build when `localStorage["portal:debug"] === "1"` (set it
 * in the DevTools console and reload). Off otherwise, so a merchant's console stays empty.
 */

export type TraceScope = 'bridge' | 'auth' | 'page' | 'signout';

const FLAG_KEY = 'portal:debug';
const SECRET_KEY = /token|authorization|api[-_]?key|password|secret|cookie|voucher/i;

function enabled(): boolean {
  if (isDevMode()) return true;
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/** A copy of `value` that is safe to log: credential-looking keys keep only their length. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SECRET_KEY.test(key)
        ? typeof entry === 'string'
          ? `<redacted, ${entry.length} chars>`
          : '<redacted>'
        : redact(entry, depth + 1),
    ]),
  );
}

/** One trace line, when tracing is on. `data` is redacted first. */
export function trace(scope: TraceScope, message: string, data?: unknown): void {
  if (!enabled()) return;
  const line = `[Portal:${scope}] ${new Date().toISOString().slice(11, 23)} ${message}`;
  if (data === undefined) console.log(line);
  else console.log(line, redact(data));
}
