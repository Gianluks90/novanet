import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UIButton } from '../../ui';
import { TranslatePipe } from '../../i18n/translate-pipe';

@Component({
  selector: 'app-unsupported-page',
  imports: [TranslatePipe, UIButton, RouterLink],
  templateUrl: './unsupported-page.html',
  styleUrl: './unsupported-page.scss',
})
export class UnsupportedPage {

}
