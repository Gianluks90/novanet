import { Component, effect, HostListener, inject } from '@angular/core';
import { APP_VERSION } from '../../const/appVersion';
import { FirebaseService } from '../../services/firebase-service';
import { UiImageContainer } from '../../ui';
import { ActivatedRoute } from '@angular/router';
import { NotificationService } from '../../services/notification-service';
import { Faction } from '../../models/faction';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { I18nService } from '../../i18n/i18n-service';

@Component({
  selector: 'app-home-page',
  imports: [TranslatePipe, UiImageContainer],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  public appVersion = APP_VERSION;
  public firebase = inject(FirebaseService);
  public factions: Faction[] = [];
  private i18n = inject(I18nService);
  public get locale(): string { return this.i18n.lang(); }

  constructor(private notification: NotificationService, private route: ActivatedRoute) {
    this.route.data.subscribe(data => {
      this.factions = data['configs'].factions;
    });
  }
}
