import { Component, HostListener, inject } from '@angular/core';
import { UIDiagonalLine } from '../../ui/ui-diagonal-line/ui-diagonal-line';
import { UIButton } from '../../ui/ui-button/ui-button';
import { APP_VERSION } from '../../const/appVersion';
import { AuthService } from '../../services/auth-service';
import { FirebaseService } from '../../services/firebase-service';
import { UiImageContainer } from '../../ui/ui-image-container/ui-image-container';

@Component({
  selector: 'app-home-page',
  imports: [UIDiagonalLine, UIButton, UiImageContainer],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  public appVersion = APP_VERSION;
  public firebase = inject(FirebaseService);

  constructor(private authService: AuthService) {}

  public loginRegister() {
    this.authService.loginWithGoogle();
  }
}
