import { Component } from '@angular/core';

/** OMS's queue columns: the header label's width, and whether OMS centres the column. */
interface SkeletonColumn {
  label: number;
  centered?: boolean;
}

/**
 * OMS's Order Queue in its loading state, drawn by the portal while the OMS frame loads.
 *
 * The first thing OMS paints inside the frame is that same loading state (`OrderScreenSkeleton`
 * in frontend-oms: the page title, the toolbar, the table header and five skeleton rows), and the
 * queue keeps it until its orders arrive. This copy matches it block for block — same page
 * padding, title row, card (filling the frame's height, as OMS's does since 2026-10-14), toolbar,
 * header row, row height and column widths — so when the frame takes over, nothing moves: the
 * merchant sees one loading screen, not a spinner, then a different skeleton, then the table.
 *
 * Every number here was measured from OMS in a browser (2026-10-13) at frame widths 375–1500.
 * If OMS's queue layout changes (a column, the toolbar, the padding), re-measure and update this.
 *
 * - **Colours** are OMS's own surface tokens (`src/app/globals.css` in frontend-oms), not the
 *   portal's: the two dark themes differ, and the skeleton must match what replaces it.
 * - **Breakpoints** are container queries on this element, which is exactly as wide as the
 *   iframe, so they flip where OMS's media queries flip inside the frame (Tailwind `sm` 640,
 *   `xl` 1280, and the widths where OMS's header labels wrap: 676 and 712).
 * - **Columns**: from 712px OMS's table shares its width in proportion to each column's
 *   one-line width (Actions is fixed at 128px), which is what the `fr` values reproduce. Below
 *   that the labels wrap and the columns settle at their narrowest, with the spare width going to
 *   Actions (under 676px) or the first column (676–711px).
 */
@Component({
  selector: 'fp-oms-skeleton',
  host: { 'aria-hidden': 'true' },
  styles: [
    `
      :host {
        /* OMS's light surface tokens. */
        --oms-bg: oklch(1 0 0);
        --oms-fill1: oklch(0.976 0.001 264.547);
        --oms-fill2: oklch(0.953 0.002 264.544);
        --oms-border: oklch(0.906 0.005 264.535);

        display: block;
        height: 100%;
        overflow: hidden;
        /* No padding here: the queries must see the iframe's width, not a padded one. */
        container-type: inline-size;
        background: var(--oms-fill1);
      }

      /* OMS follows the portal's mode (host.theme), so the portal's mode picks OMS's dark set. */
      :host-context([data-mode='dark']) {
        --oms-bg: oklch(0.144 0.003 264.025);
        --oms-fill1: oklch(0.19 0.005 264.456);
        --oms-fill2: oklch(0.234 0.007 264.437);
        --oms-border: oklch(0.275 0.009 264.424);
      }

      /* OMS's content area is the frame's height, and the queue card fills what the title leaves. */
      .page {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        height: 100%;
        padding: 16px;
      }

      .block {
        border-radius: 4px;
        background: var(--oms-fill2);
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      @keyframes pulse {
        50% {
          opacity: 0.5;
        }
      }

      .title {
        display: flex;
        align-items: center;
        height: 24px;
      }

      .title .block {
        width: 90px;
        height: 16px;
      }

      .card {
        flex: 1;
        min-height: 320px;
        margin-top: 12px;
        overflow: hidden;
        border: 1px solid var(--oms-border);
        border-radius: 12px;
        background: var(--oms-bg);
      }

      .toolbar {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--oms-border);
      }

      .toolbar .block {
        width: 100%;
        height: 32px;
        border-radius: 6px;
      }

      /* Narrowest: every column at its wrapped width and the table scrolls; until 676px any spare
         width goes to Actions. */
      .head,
      .row {
        display: grid;
        min-width: 567.4px;
        grid-template-columns: 60.6px 85.3px 73.3px 60px 77.7px 64.8px 74px minmax(71.8px, 1fr);
      }

      .head {
        height: 77px;
        border-bottom: 1px solid var(--oms-border);
        background: var(--oms-fill1);
      }

      .row:not(:last-child) {
        border-bottom: 1px solid var(--oms-border);
      }

      .cell {
        display: flex;
        align-items: center;
        min-width: 0;
        padding: 8px 12px;
      }

      .cell.centered {
        justify-content: center;
      }

      .head .block {
        max-width: 100%;
        height: 12px;
      }

      .row .block {
        width: 100%;
        height: 16px;
      }

      @container (min-width: 640px) {
        .toolbar .tabs {
          width: 486px;
          max-width: 100%;
        }

        .toolbar .search {
          width: 320px;
        }
      }

      @container (min-width: 676px) {
        .head,
        .row {
          grid-template-columns: minmax(0, 1fr) 85.3px 73.3px 60px 77.7px 64.8px 74px 128px;
        }

        .head {
          height: 57px;
        }
      }

      @container (min-width: 712px) {
        .head,
        .row {
          grid-template-columns: 113.8fr 85.5fr 73.5fr 60.1fr 77.8fr 64.9fr 74.3fr 128px;
        }

        .head {
          height: 37px;
        }
      }

      @container (min-width: 1280px) {
        .toolbar {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .block {
          animation: none;
        }
      }
    `,
  ],
  template: `
    <div class="page">
      <div class="title"><div class="block"></div></div>
      <div class="card">
        <div class="toolbar">
          <div class="block tabs"></div>
          <div class="block search"></div>
        </div>
        <div class="head">
          @for (column of columns; track $index) {
            <div class="cell" [class.centered]="column.centered">
              <div class="block" [style.width.px]="column.label"></div>
            </div>
          }
        </div>
        @for (row of rows; track row) {
          <div class="row">
            @for (column of columns; track $index) {
              <div class="cell"><div class="block"></div></div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class OmsSkeleton {
  /** OMS Order ID, Customer, Product, Value, Location, Status, Created, Actions. */
  protected readonly columns: SkeletonColumn[] = [
    { label: 90 },
    { label: 62 },
    { label: 50 },
    { label: 36 },
    { label: 54 },
    { label: 41 },
    { label: 50 },
    { label: 48, centered: true },
  ];

  /** OMS shows five skeleton rows while the queue loads. */
  protected readonly rows = [0, 1, 2, 3, 4];
}
