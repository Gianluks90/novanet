import { Component, effect, HostListener, inject } from '@angular/core';
import { APP_VERSION } from '../../const/appVersion';
import { AuthService } from '../../services/auth-service';
import { SettingsService } from '../../services/settings-service';
import { FirebaseService } from '../../services/firebase-service';
import { UIButton, UiImageContainer } from '../../ui';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NotificationService } from '../../services/notification-service';
import { Faction } from '../../models/faction';
import { FactionLabelPipe } from "../../pipes/faction-label-pipe";
import { TranslatePipe } from '../../i18n/translate-pipe';
import { I18nService } from '../../i18n/i18n-service';

@Component({
  selector: 'app-home-page',
  imports: [TranslatePipe, UIButton, UiImageContainer, RouterLink, FactionLabelPipe],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  public appVersion = APP_VERSION;
  public firebase = inject(FirebaseService);
  private settings = inject(SettingsService);
  public factions: Faction[] = [];
  private i18n = inject(I18nService);
  public get locale(): string { return this.i18n.lang(); }

  constructor(private authService: AuthService, private notification: NotificationService, private route: ActivatedRoute) {
    this.route.data.subscribe(data => {
      this.factions = data['configs'].factions;
    });
  }

  public openDialog() {
    void this.settings.open();
  }

  /** The same button logs in or out depending on the current session. */
  public toggleSession() {
    if (this.firebase.$user()) {
      void this.authService.signOut();
    } else {
      void this.authService.signIn();
    }
  }
}
