import { Component, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NAV_SECTIONS } from './core/nav';
import { FonepointsLogo } from './shared/fonepoints-logo';

/**
 * Fonepoints Business portal shell: sidebar, top bar and the content area that hosts either a
 * portal-native page or an embedded application.
 *
 * The chrome lives here and only here. An embedded app (OMS) renders inside `.content` and brings
 * no sidebar or header of its own, so the merchant sees one set of navigation.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FonepointsLogo],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly sections = NAV_SECTIONS;
  private readonly url = signal('');

  /** Title shown in the top bar, taken from the active sidebar entry. */
  protected readonly activeLabel = computed(() => {
    const path = this.url().split('?')[0].replace(/^\//, '');
    for (const section of this.sections) {
      for (const item of section.items) {
        if (path === item.path || path.startsWith(`${item.path}/`)) return item.label;
      }
    }
    return 'Dashboard';
  });

  constructor(router: Router) {
    this.url.set(router.url);
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.url.set(event.urlAfterRedirects));
  }
}
