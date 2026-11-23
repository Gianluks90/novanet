import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { UIButton, UiBadge } from '../../ui';
import { FirebaseService } from '../../services/firebase-service';
import { AuthService } from '../../services/auth-service';
import { SettingsService } from '../../services/settings-service';
import { NotificationService } from '../../services/notification-service';
import { I18nService, Lang } from '../../i18n/i18n-service';
import { TranslatePipe } from '../../i18n/translate-pipe';

/** Top bar: home logo, main navigation, language, theme and account menu. */
@Component({
  selector: 'app-header',
  imports: [TranslatePipe, RouterLink, RouterLinkActive, CdkMenuTrigger, CdkMenu, CdkMenuItem, ThemeToggle, UIButton, UiBadge],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  public firebase = inject(FirebaseService);
  private i18n = inject(I18nService);
  private auth = inject(AuthService);
  private settings = inject(SettingsService);
  private notification = inject(NotificationService);

  public readonly languages: Array<{ code: Lang; label: string }> = [
    { code: 'en', label: 'English' },
    { code: 'it', label: 'Italiano' },
  ];

  public get locale(): Lang { return this.i18n.lang(); }

  public get userName(): string {
    const user = this.firebase.$user();
    return user?.nickname || user?.displayName || user?.email || '';
  }

  public get avatarUrl(): string | null {
    const user = this.firebase.$user();
    return user?.customPhotoURL || user?.photoURL || null;
  }

  public setLang(lang: Lang) {
    this.i18n.setLang(lang);
  }

  public openSettings() {
    void this.settings.open();
  }

  public async signIn() {
    await this.run(() => this.auth.loginWithGoogle());
  }

  public async signOut() {
    await this.run(() => this.auth.logout());
  }

  private async run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (err) {
      console.error('Authentication error:', err);
      this.notification.notify(this.i18n.t('notifications.authError'), 'dangerous');
    }
  }
}
