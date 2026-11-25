import { Component, computed, inject } from '@angular/core';
import { CardTranslationService } from '../../../services/card-translation-service';
import { NotificationService } from '../../../services/notification-service';
import { I18nService, Lang, SUPPORTED_LANGS } from '../../../i18n/i18n-service';
import { SegmentedOption, UIButton, UiDialogContainer, UiField, UiSegmented, UiToggle } from '../../../ui';
import { ThemeService } from '../../../services/theme-service';
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
import { CardBackService } from '../../../services/card-back-service';
import { CardBackPicker } from '../../card-back-picker/card-back-picker';

@Component({
  selector: 'app-home-settings-dialog',
  imports: [TranslatePipe, UiDialogContainer, UIButton, UiField, UiSegmented, UiToggle, CardBackPicker, FormsModule, ReactiveFormsModule, FactionLabelPipe],
  templateUrl: './home-settings-dialog.html',
  styleUrl: './home-settings-dialog.scss',
})
export class HomeSettingsDialog {
  public appVersion = APP_VERSION;
  public dialogRef = inject<DialogRef<DialogResult,HomeSettingsDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { user: NovaUser | null, factions: Faction[] };
  public form: FormGroup;
  public translations = inject(CardTranslationService);
  public theme = inject(ThemeService);
  private notification = inject(NotificationService);
  public i18n = inject(I18nService);
  public cardBacks = inject(CardBackService);
  public readonly backSides = ['runner', 'corp'] as const;

  constructor(private fb: FormBuilder, private userService: UserService) {
    this.form = this.fb.group({
      nickname: [this.data.user?.nickname],
      customPhotoURL: [this.data.user?.customPhotoURL],
      customBackgroundURL: [this.data.user?.customBackgroundURL],
      favoriteFaction: [this.data.user?.favoriteFaction || ''],
    })
  }

  public readonly languageOptions: SegmentedOption[] = SUPPORTED_LANGS.map(code => ({ value: code, label: `language.${code}` as const }));

  public readonly themeOptions: SegmentedOption[] = [
    { value: 'light', label: 'homeSettingsDialog.themeLight', icon: 'light_mode' },
    { value: 'dark', label: 'homeSettingsDialog.themeDark', icon: 'dark_mode' },
  ];

  public setLang(lang: string) {
    this.i18n.setLang(lang as Lang);
  }

  public setTheme(theme: string) {
    this.theme.setTheme(theme as 'light' | 'dark');
  }

  /** The accent colors of the current theme, as segments. The choice is applied and saved right away. */
  public accentOptions = computed<SegmentedOption[]>(() =>
    this.theme.accentPresets().map(p => ({ value: p.id, label: p.label, color: p.color })));

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
