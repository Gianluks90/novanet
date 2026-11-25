import { Component, inject } from '@angular/core';
import { ThemeService } from '../../services/theme-service';

/**
 * Design lab (`#/design-lab`, not linked): the HUD kit of `styles/_hud.scss` on a few samples, to
 * judge the look in the browser before it is applied to the app. Texts are English on purpose.
 */
@Component({
  selector: 'app-design-lab-page',
  templateUrl: './design-lab-page.html',
  styleUrl: './design-lab-page.scss',
})
export class DesignLabPage {
  public theme = inject(ThemeService);

  public readonly tiles = ['30001', '30060', '30011'];
}
