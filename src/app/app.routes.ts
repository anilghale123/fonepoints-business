import { Routes } from '@angular/router';
import { authGuard } from './core/auth-guard';
import { DashboardPage } from './pages/dashboard/dashboard-page';
import { LoginPage } from './pages/login/login-page';
import { PlaceholderPage } from './pages/placeholder/placeholder-page';

export const routes: Routes = [
  // The only page that works without a portal session.
  { path: 'login', component: LoginPage, title: 'Sign in · Fonepoints Business' },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    component: DashboardPage,
    canActivate: [authGuard],
    title: 'Dashboard · Fonepoints Business',
  },
  {
    // OMS is a separate application, loaded lazily and embedded in an iframe.
    path: 'oms',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/oms/oms-page').then((m) => m.OmsPage),
    title: 'OMS · Fonepoints Business',
  },
  {
    path: 'customers',
    component: PlaceholderPage,
    canActivate: [authGuard],
    data: { title: 'Customers' },
  },
  {
    path: 'payments',
    component: PlaceholderPage,
    canActivate: [authGuard],
    data: { title: 'Payments' },
  },
  {
    path: 'offers',
    component: PlaceholderPage,
    canActivate: [authGuard],
    data: { title: 'Offers' },
  },
  {
    path: 'reports',
    component: PlaceholderPage,
    canActivate: [authGuard],
    data: { title: 'Reports' },
  },
  {
    path: 'settings',
    component: PlaceholderPage,
    canActivate: [authGuard],
    data: { title: 'Settings' },
  },
  { path: '**', redirectTo: 'dashboard' },
];
