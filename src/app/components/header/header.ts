import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { UiBadge } from '../../ui';
import { FirebaseService } from '../../services/firebase-service';
import { AuthService } from '../../services/auth-service';
import { SettingsService } from '../../services/settings-service';
import { TranslatePipe } from '../../i18n/translate-pipe';

/** Top bar: home logo, main navigation, settings and account menu. */
@Component({
  selector: 'app-header',
  imports: [TranslatePipe, RouterLink, RouterLinkActive, CdkMenuTrigger, CdkMenu, CdkMenuItem, UiBadge],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  public firebase = inject(FirebaseService);
  private auth = inject(AuthService);
  private settings = inject(SettingsService);

  public get userName(): string {
    const user = this.firebase.$user();
    return user?.nickname || user?.displayName || user?.email || '';
  }

  public get avatarUrl(): string | null {
    const user = this.firebase.$user();
    return user?.customPhotoURL || user?.photoURL || null;
  }

  public openSettings() {
    void this.settings.open();
  }

  /** Signed in with an email that was not verified yet. */
  public get unverified(): boolean {
    const info = this.auth.info();
    return !!info && !info.emailVerified;
  }

  public openAccount() {
    this.auth.openAccount();
  }

  public signIn() {
    void this.auth.signIn();
  }

  public signOut() {
    void this.auth.signOut();
  }
}
