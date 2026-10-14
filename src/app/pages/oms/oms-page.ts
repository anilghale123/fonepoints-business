import { Component, OnDestroy, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { trace } from '../../core/debug-log';
import { OmsBridge, omsPathForOrder, orderForOmsPath } from '../../core/oms-bridge';
import { OmsFrameKeeper } from '../../core/oms-frame-keeper';

/**
 * The `/oms` route. It draws nothing itself: OMS lives in a frame the shell keeps alive between
 * visits (`OmsFrame`, created and destroyed by `OmsFrameKeeper`), and this route only decides when
 * that frame is on screen — shown while the merchant is here, hidden when they leave.
 *
 * It also keeps the portal's URL in step with the screen open inside OMS: `/oms` on the order
 * queue, `/oms?order={id}` on an order. OMS reports each move (`oms.route.changed`), and the URL is
 * replaced rather than pushed, so the back button is not left stepping through orders. Because the
 * order is in the URL, refreshing the page reopens it: a new frame starts on the screen the URL
 * names (`OmsFrameKeeper.show`).
 */
@Component({
  selector: 'fp-oms-page',
  template: '',
})
export class OmsPage implements OnDestroy {
  private readonly keeper = inject(OmsFrameKeeper);
  private readonly bridge = inject(OmsBridge);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    const path = omsPathForOrder(this.route.snapshot.queryParamMap.get('order'));

    // A frame kept from an earlier visit is on its queue (it was sent there on leaving). The URL
    // names an order only when the merchant came back with the browser's back button: open it.
    if (this.keeper.kept() && path !== this.bridge.omsPath()) this.bridge.openPath(path);
    this.keeper.show(path);

    // While this page is on screen, the URL follows OMS. Moves OMS makes while hidden (back to the
    // queue on leaving) never reach the URL, because this page no longer exists then.
    effect(() => {
      const omsPath = this.bridge.omsPath();
      if (!omsPath) return;
      const order = orderForOmsPath(omsPath);
      if (order === this.route.snapshot.queryParamMap.get('order')) return;
      trace('page', `OMS is on ${omsPath}: the portal URL follows`);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { order },
        replaceUrl: true,
      });
    });
  }

  ngOnDestroy(): void {
    this.keeper.hide();
  }
}
