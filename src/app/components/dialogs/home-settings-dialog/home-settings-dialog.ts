import { Component, inject } from '@angular/core';
import { UIButton, UiDialogContainer } from '../../../ui';
import { APP_VERSION } from '../../../const/appVersion';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../../models/DialogResult';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { UserService } from '../../../services/user-service';
import { getAuth } from 'firebase/auth';
import { NovaUser } from '../../../models/NovaUser';
import { CdkObserveContent } from "@angular/cdk/observers";
import { AdminService } from '../../../services/admin-service';
import { Faction } from '../../../models/faction';
import { FactionLabelPipe } from "../../../pipes/faction-label-pipe";

@Component({
  selector: 'app-home-settings-dialog',
  imports: [UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule, FactionLabelPipe],
  templateUrl: './home-settings-dialog.html',
  styleUrl: './home-settings-dialog.scss',
})
export class HomeSettingsDialog {
  public appVersion = APP_VERSION;
  public dialogRef = inject<DialogRef<DialogResult,HomeSettingsDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { user: NovaUser | null, factions: Faction[] };
  public form: FormGroup;

  constructor(private fb: FormBuilder, private userService: UserService, private adminService: AdminService) {
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

  // ADMIN CONSOLE

  // Lancia un singolo comando da AdminService
  public fix() {
    this.adminService.updateEveryTranslationModel().then(() => {
      console.log('Translation models updated successfully.');
    }).catch((error) => {
      console.error('Error updating translation models:', error);
    });
  }
}
