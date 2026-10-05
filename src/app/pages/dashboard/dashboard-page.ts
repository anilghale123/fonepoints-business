import { Component } from '@angular/core';

/** Portal-native page. Exists so the shell has somewhere to land and OMS is clearly one area
 * of a wider portal rather than the whole app. */
@Component({
  selector: 'fp-dashboard-page',
  styles: [
    `
      :host {
        display: block;
        padding: 20px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 14px;
        margin-bottom: 18px;
      }

      .tile {
        padding: 16px;
        background: var(--fp-surface);
        border: 1px solid var(--fp-border);
        border-radius: var(--fp-radius);
      }

      .tile p {
        margin: 0 0 6px;
        font-size: 12px;
        color: var(--fp-fg-secondary);
      }

      .tile strong {
        font-size: 22px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      .panel {
        padding: 18px;
        background: var(--fp-surface);
        border: 1px solid var(--fp-border);
        border-radius: var(--fp-radius);
      }

      .panel h2 {
        font-size: 14px;
        margin-bottom: 6px;
      }

      .panel p {
        margin: 0;
        color: var(--fp-fg-secondary);
      }
    `,
  ],
  template: `
    <div class="grid">
      @for (tile of tiles; track tile.label) {
        <div class="tile">
          <p>{{ tile.label }}</p>
          <strong>{{ tile.value }}</strong>
        </div>
      }
    </div>

    <div class="panel">
      <h2>Order management</h2>
      <p>Open <strong>OMS</strong> in the sidebar to see and fulfil your Fonepoints orders.</p>
    </div>
  `,
})
export class DashboardPage {
  protected readonly tiles = [
    { label: 'Orders today', value: '18' },
    { label: 'Awaiting fulfilment', value: '7' },
    { label: 'Points redeemed', value: '12,480' },
    { label: 'Settlement due', value: 'Rs 48,200' },
  ];
}
