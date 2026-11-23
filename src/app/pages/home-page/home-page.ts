import { Component, effect, HostListener, inject } from '@angular/core';
import { APP_VERSION } from '../../const/appVersion';
import { AuthService } from '../../services/auth-service';
import { FirebaseService } from '../../services/firebase-service';
import { UIButton, UIDiagonalLine, UiImageContainer } from '../../ui';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../models/DialogResult';
import { HomeSettingsDialog } from '../../components/dialogs/home-settings-dialog/home-settings-dialog';
import { DIALOGS_CONFIG } from '../../const/dialogConfig';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NotificationService } from '../../services/notification-service';
import { Faction } from '../../models/faction';
import { FactionLabelPipe } from "../../pipes/faction-label-pipe";
import { TranslatePipe } from '../../i18n/translate-pipe';
import { I18nService } from '../../i18n/i18n-service';

@Component({
  selector: 'app-home-page',
  imports: [TranslatePipe, UIDiagonalLine, UIButton, UiImageContainer, RouterLink, FactionLabelPipe],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  public appVersion = APP_VERSION;
  public firebase = inject(FirebaseService);
  private dialog = inject(Dialog);
  private dialogRef: DialogRef<DialogResult, any> | null = null;
  public factions: Faction[] = [];
  private i18n = inject(I18nService);
  public get locale(): string { return this.i18n.lang(); }

  constructor(private authService: AuthService, private notification: NotificationService, private route: ActivatedRoute) {
    this.route.data.subscribe(data => {
      this.factions = data['configs'].factions;
    });
  }

  public openDialog() {
    this.dialogRef = this.dialog.open<DialogResult>(HomeSettingsDialog, {
      ...DIALOGS_CONFIG,
      data: { user: this.firebase.$user(), factions: this.factions },
    });

    this.dialogRef.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed') {
        this.notification.notify(this.i18n.t('notifications.settingsUpdated'), 'check')
      }
    });
  }

  /** The same button logs in or out depending on the current session. */
  public async toggleSession() {
    try {
      if (this.firebase.$user()) {
        await this.authService.logout();
      } else {
        await this.authService.loginWithGoogle();
      }
    } catch (err) {
      console.error('Authentication error:', err);
      this.notification.notify(this.i18n.t('notifications.authError'), 'dangerous');
    }
  }
}
