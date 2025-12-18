import { Component, input } from '@angular/core';

@Component({
  selector: 'app-ui-button',
  imports: [],
  templateUrl: './ui-button.html',
  styleUrl: './ui-button.scss',
})
export class UIButton {
  public text = input<string>('');
  public icon = input<string>('');
  public disabled = input<boolean>(false);
}
