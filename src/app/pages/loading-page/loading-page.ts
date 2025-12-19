import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-loading-page',
  imports: [],
  templateUrl: './loading-page.html',
  styleUrl: './loading-page.scss',
})
export class LoadingPage {
  public progress = 0;

  constructor(private router: Router) { }

  ngOnInit() {
    const interval = setInterval(() => {
      this.progress += Math.random() * 8;
      if (this.progress >= 90) clearInterval(interval);
    }, 120);

    setTimeout(() => {
      this.progress = 100;
      this.router.navigate(['/cards']);
    }, 2000);
  }
}
