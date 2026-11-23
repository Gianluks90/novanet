import { Component, inject } from '@angular/core';
import { CardTranslationService } from '../../../services/card-translation-service';
import { NotificationService } from '../../../services/notification-service';
import { I18nService } from '../../../i18n/i18n-service';
import { UIButton, UiDialogContainer } from '../../../ui';
import { APP_VERSION } from '../../../const/appVersion';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UserService } from '../../../services/user-service';
import { getAuth } from 'firebase/auth';
import { NovaUser } from '../../../models/NovaUser';
import { CdkObserveContent } from "@angular/cdk/observers";
import { Faction } from '../../../models/faction';
import { FactionLabelPipe } from "../../../pipes/faction-label-pipe";
import { TranslatePipe } from '../../../i18n/translate-pipe';

@Component({
  selector: 'app-home-settings-dialog',
  imports: [TranslatePipe, UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule, FactionLabelPipe],
  templateUrl: './home-settings-dialog.html',
  styleUrl: './home-settings-dialog.scss',
})
export class HomeSettingsDialog {
  public appVersion = APP_VERSION;
  public dialogRef = inject<DialogRef<DialogResult,HomeSettingsDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { user: NovaUser | null, factions: Faction[] };
  public form: FormGroup;
  public translations = inject(CardTranslationService);
  private notification = inject(NotificationService);
  private i18n = inject(I18nService);

  constructor(private fb: FormBuilder, private userService: UserService) {
    this.form = this.fb.group({
      nickname: [this.data.user?.nickname],
      customPhotoURL: [this.data.user?.customPhotoURL],
      customBackgroundURL: [this.data.user?.customBackgroundURL],
      favoriteFaction: [this.data.user?.favoriteFaction || ''],
      customAccentColor: [this.data.user?.customAccentColor || '#FCF552'],
    })
  }

  public resetColor() {
    this.form.patchValue({ customAccentColor: '#FCF552' });
    this.form.markAsDirty();
  }

  public onSubmit() {
    if (this.form.valid) {
      this.userService.updateUserInfo(getAuth().currentUser!.uid, this.form.value).then(() => {
        this.dialogRef.close({ status: 'confirmed' });
      }).catch((error) => {
        console.error('Error updating user info:', error);
      });
    }
  }

  // PERSONAL TRANSLATIONS

  public exportTranslations() {
    const blob = new Blob([this.translations.exportUserTranslations()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'novanet-translations.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  public async importTranslations(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const count = await this.translations.importUserTranslations(await file.text());
      this.notification.notify(this.i18n.t('notifications.translationsImported', [count]), 'check');
    } catch {
      this.notification.notify(this.i18n.t('notifications.translationsImportError'), 'dangerous');
    } finally {
      input.value = '';
    }
  }
}
