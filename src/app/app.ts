import { Component, HostListener, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Header } from './components/header/header';
import { UnsupportedPage } from './pages/unsupported-page/unsupported-page';
import { initializeApp } from 'firebase/app';
import { FIREBASE_CONFIG } from './environment/firebaseConfig';
import { FirebaseService } from './services/firebase-service';
import { getFirestore } from 'firebase/firestore';
import { LoadingPage } from './pages/loading-page/loading-page';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, UnsupportedPage],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  // protected readonly title = signal('novanet');
  public title: string = '';
  protected isUnsupported = false;
  // protected loadingRoot = false;

  constructor(private firebaseService: FirebaseService, private router: Router) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        // this.loadingRoot = true;
      }
      if (event instanceof NavigationEnd) {
        // this.loadingRoot = false;
        this.title = window?.location?.pathname?.split('/')?.filter(part => part.length > 0)[0] || 'home';
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
