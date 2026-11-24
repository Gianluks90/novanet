import { Component } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate-pipe';

@Component({
  selector: 'app-unsupported-page',
  imports: [TranslatePipe],
  templateUrl: './unsupported-page.html',
  styleUrl: './unsupported-page.scss',
})
export class UnsupportedPage {

}
