import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NAV_SECTIONS } from './core/nav';
import { Theme } from './core/theme';
import { FonepointsLogo } from './shared/fonepoints-logo';
import { ProfileMenu } from './shared/profile-menu';
import { SettingsDialog, type SettingsSection } from './shared/settings-dialog';

/**
 * Fonepoints Business portal shell: sidebar, top bar and the content area that hosts either a
 * portal-native page or an embedded application.
 *
 * The chrome lives here and only here. An embedded app (OMS) renders inside `.content` and brings
 * no sidebar or header of its own, so the merchant sees one set of navigation.
 *
 * The same applies to appearance: the portal owns light/dark and the accent for the whole window,
 * and `OmsBridge` forwards the choice into the frame. The top bar therefore has a theme toggle
 * and a profile menu, and the settings dialog is mounted here rather than inside the menu, so
 * closing the menu does not tear the dialog down with it.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FonepointsLogo,
    ProfileMenu,
    SettingsDialog,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly theme = inject(Theme);
  protected readonly sections = NAV_SECTIONS;
  private readonly url = signal('');

  protected readonly settingsOpen = signal(false);
  protected readonly settingsSection = signal<SettingsSection>('profile');

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

  protected openSettings(section: SettingsSection): void {
    this.settingsSection.set(section);
    this.settingsOpen.set(true);
  }

  constructor(router: Router) {
    this.url.set(router.url);
    router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.url.set(event.urlAfterRedirects));
  }
}
