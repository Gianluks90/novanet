import { Component, HostListener, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './components/header/header';
import { UnsupportedPage } from './pages/unsupported-page/unsupported-page';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, UnsupportedPage],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('novanet');
  protected isUnsupported = false;

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
