import { Component, HostListener } from '@angular/core';
import { UIDiagonalLineComponent } from '../../ui/ui-diagonal-line/ui-diagonal-line.component';
import { UIButton } from '../../ui/ui-button/ui-button';
import { APP_VERSION } from '../../../const/appVersion';

@Component({
  selector: 'app-home-page',
  imports: [UIDiagonalLineComponent, UIButton],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  public appVersion = APP_VERSION;
}
