import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkMenu, CdkMenuTrigger } from '@angular/cdk/menu';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { UiDialogContainer, UIButton } from '../../../ui';
import { DialogResult } from '../../../models/DialogResult';
import { Card } from '../../../models/card';
import { NrIconsPipe } from '../../../pipes/nr-icons-pipe';
import { TranslatePipe } from '../../../i18n/translate-pipe';
import { I18nService } from '../../../i18n/i18n-service';
import { CardTranslationService } from '../../../services/card-translation-service';
import { NotificationService } from '../../../services/notification-service';

/**
 * Lets the user write (or edit) their own translation of a card for the current language.
 * It is stored locally and takes precedence over the official translation files.
 */
@Component({
  selector: 'app-personal-translation-dialog',
  imports: [TranslatePipe, UiDialogContainer, UIButton, ReactiveFormsModule, NrIconsPipe, CdkMenuTrigger, CdkMenu],
  templateUrl: './personal-translation-dialog.html',
  styleUrl: './personal-translation-dialog.scss',
})
export class PersonalTranslationDialog {
  public dialogRef = inject<DialogRef<DialogResult, PersonalTranslationDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { card: Card };
  private translations = inject(CardTranslationService);
  private notification = inject(NotificationService);
  public i18n = inject(I18nService);
  public form: FormGroup;
  public hasPersonal: boolean;

  constructor(private fb: FormBuilder) {
    const card = this.data.card;
    // Start from what is shown today: personal > official > English original.
    const current = this.translations.translation(card.id);
    this.hasPersonal = !!this.translations.userTranslation(card.id);

    this.form = this.fb.group({
      title: [current?.title || card.title, Validators.required],
      text: [current?.text || card.text || ''],
      flavor: [current?.flavor || card.flavor || ''],
    });
  }

  public async save() {
    if (!this.form.valid) return;
    await this.translations.saveUserTranslation(this.data.card.id, this.form.value);
    this.notification.notify(this.i18n.t('notifications.personalTranslationSaved'), 'check');
    this.dialogRef.close({ status: 'confirmed' });
  }

  public async remove() {
    await this.translations.removeUserTranslation(this.data.card.id);
    this.notification.notify(this.i18n.t('notifications.personalTranslationRemoved'), 'check');
    this.dialogRef.close({ status: 'confirmed' });
  }

  public insert(snippet: string) {
    const control = this.form.get('text')!;
    control.setValue((control.value || '') + snippet);
    control.markAsDirty();
  }
}
