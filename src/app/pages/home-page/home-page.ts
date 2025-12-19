import { Component, HostListener, inject } from '@angular/core';
import { APP_VERSION } from '../../const/appVersion';
import { AuthService } from '../../services/auth-service';
import { FirebaseService } from '../../services/firebase-service';
import { UIButton, UIDiagonalLine, UiImageContainer } from '../../ui';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DialogResult } from '../../models/DialogResult';
import { HomeSettingsDialog } from '../../components/dialogs/home-settings-dialog/home-settings-dialog';
import { DIALOGS_CONFIG } from '../../const/dialogConfig';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-page',
  imports: [UIDiagonalLine, UIButton, UiImageContainer, RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  public appVersion = APP_VERSION;
  public firebase = inject(FirebaseService);
  private dialog = inject(Dialog);
  private dialogRef: DialogRef<DialogResult, any> | null = null;
  
  constructor(private authService: AuthService) {}

  public openDialog() {
    this.dialogRef = this.dialog.open<DialogResult>(HomeSettingsDialog, {
      ...DIALOGS_CONFIG,
      data: { user: this.firebase.$user() },
    });

    this.dialogRef.closed.subscribe((result: DialogResult | undefined) => {
      if (result?.status === 'confirmed') {
        // TODO: notification of success
      }
    });
  }

  public loginRegister() {
    this.authService.loginWithGoogle();
  }
}
