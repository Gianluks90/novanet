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

@Component({
  selector: 'app-home-settings-dialog',
  imports: [UiDialogContainer, UIButton, FormsModule, ReactiveFormsModule],
  templateUrl: './home-settings-dialog.html',
  styleUrl: './home-settings-dialog.scss',
})
export class HomeSettingsDialog {
  public appVersion = APP_VERSION;
  public dialogRef = inject<DialogRef<DialogResult,HomeSettingsDialog>>(DialogRef);
  public data = inject(DIALOG_DATA) as { user: NovaUser | null };
  public form: FormGroup;

  constructor(private fb: FormBuilder, private userService: UserService) {
    this.form = this.fb.group({
      nickname: [this.data.user?.nickname],
      customPhotoURL: [this.data.user?.customPhotoURL],
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
}
