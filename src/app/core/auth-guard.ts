import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { PortalSession } from './portal-session';

/**
 * Every page but the login needs a portal session. Without one the merchant is sent to `/login`,
 * and returned to the page they asked for afterwards.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(PortalSession);
  const router = inject(Router);
  if (await session.restore()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
