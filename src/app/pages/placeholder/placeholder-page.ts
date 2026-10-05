import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Stands in for the portal areas that are not part of this integration spike. */
@Component({
  selector: 'fp-placeholder-page',
  styles: [
    `
      :host {
        display: grid;
        place-content: center;
        height: 100%;
        padding: 24px;
        text-align: center;
      }

      h2 {
        font-size: 16px;
        margin-bottom: 6px;
      }

      p {
        margin: 0;
        color: var(--fp-fg-secondary);
      }
    `,
  ],
  template: `
    <div>
      <h2>{{ title }}</h2>
      <p>This area of the portal is not part of the OMS integration spike.</p>
    </div>
  `,
})
export class PlaceholderPage {
  protected readonly title =
    (inject(ActivatedRoute).snapshot.data['title'] as string | undefined) ?? 'Coming soon';
}
