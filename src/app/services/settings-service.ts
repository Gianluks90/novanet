import { inject, Injectable } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { DIALOGS_CONFIG } from '../const/dialogConfig';
import { nrdbDb } from '../db/nrdb-indexed-db';
import { HomeSettingsDialog } from '../components/dialogs/home-settings-dialog/home-settings-dialog';
import { DialogResult } from '../models/DialogResult';
import { I18nService } from '../i18n/i18n-service';
import { FirebaseService } from './firebase-service';
import { NotificationService } from './notification-service';

/** Opens the settings dialog from anywhere (header user menu, home page). */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private dialog = inject(Dialog);
  private firebase = inject(FirebaseService);
  private notification = inject(NotificationService);
  private i18n = inject(I18nService);

  public async open(): Promise<void> {
    // The factions come from the cached reference data, so this works on any page.
    const config = await (await nrdbDb).get('meta', 'cardsConfig');
    const ref = this.dialog.open<DialogResult>(HomeSettingsDialog, {
      ...DIALOGS_CONFIG,
      data: { user: this.firebase.$user(), factions: config?.factions ?? [] },
    });

    ref.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed') {
        this.notification.notify(this.i18n.t('notifications.settingsUpdated'), 'check');
      }
    });
  }
}
