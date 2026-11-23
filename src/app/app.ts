import { ChangeDetectorRef, Component, effect, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Header } from './components/header/header';
import { UnsupportedPage } from './pages/unsupported-page/unsupported-page';
import { initializeApp } from 'firebase/app';
import { FIREBASE_CONFIG } from './environment/firebaseConfig';
import { FirebaseService } from './services/firebase-service';
import { getFirestore } from 'firebase/firestore';
import { NotificationService } from './services/notification-service';
import { I18nService } from './i18n/i18n-service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, UnsupportedPage],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected isUnsupported = false;
  private i18n = inject(I18nService);
  public get locale(): string { return this.i18n.lang(); }
  public backgroundImageUrl: string | null = null;

  constructor(private firebaseService: FirebaseService, private router: Router, private notification: NotificationService, private cd: ChangeDetectorRef) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        if (event.url.includes('cards')) {
          this.notification.notify(this.i18n.t('notifications.cardsLoading'), 'cards_stack')
        }
      }
      if (event instanceof NavigationEnd) {
        if (event.url.includes('cards')) {
          this.notification.notify(this.i18n.t('notifications.cardsLoaded'), 'cards_stack', 5000);
        }
      }
    });

    effect(() => {
      if (this.firebaseService.$user()) {
        this.backgroundImageUrl = this.firebaseService.$user()!.customBackgroundURL || null;
        this.cd.detectChanges();
      }
    });
  }

  ngOnInit() {
    this.checkScreenSize();
  }
  
  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize() {
    this.isUnsupported = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
  }
}
