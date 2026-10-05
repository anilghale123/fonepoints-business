import { Routes } from '@angular/router';
import { DashboardPage } from './pages/dashboard/dashboard-page';
import { PlaceholderPage } from './pages/placeholder/placeholder-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: DashboardPage, title: 'Dashboard · Fonepoints Business' },
  {
    // OMS is a separate application, loaded lazily and embedded in an iframe.
    path: 'oms',
    loadComponent: () => import('./pages/oms/oms-page').then((m) => m.OmsPage),
    title: 'OMS · Fonepoints Business',
  },
  { path: 'customers', component: PlaceholderPage, data: { title: 'Customers' } },
  { path: 'payments', component: PlaceholderPage, data: { title: 'Payments' } },
  { path: 'offers', component: PlaceholderPage, data: { title: 'Offers' } },
  { path: 'reports', component: PlaceholderPage, data: { title: 'Reports' } },
  { path: 'settings', component: PlaceholderPage, data: { title: 'Settings' } },
  { path: '**', redirectTo: 'dashboard' },
];
