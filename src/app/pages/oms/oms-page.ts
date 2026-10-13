import { Component, OnDestroy, inject } from '@angular/core';
import { OmsFrameKeeper } from '../../core/oms-frame-keeper';

/**
 * The `/oms` route. It draws nothing itself: OMS lives in a frame the shell keeps alive between
 * visits (`OmsFrame`, created and destroyed by `OmsFrameKeeper`), and this route only decides when
 * that frame is on screen — shown while the merchant is here, hidden when they leave.
 */
@Component({
  selector: 'fp-oms-page',
  template: '',
})
export class OmsPage implements OnDestroy {
  private readonly keeper = inject(OmsFrameKeeper);

  constructor() {
    this.keeper.show();
  }

  ngOnDestroy(): void {
    this.keeper.hide();
  }
}
