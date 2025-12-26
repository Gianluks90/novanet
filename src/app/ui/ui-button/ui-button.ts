import { Component, input } from '@angular/core';
import { NrIconsPipe } from '../../pipes/nr-icons-pipe';

@Component({
  selector: 'app-ui-button',
  imports: [NrIconsPipe],
  templateUrl: './ui-button.html',
  styleUrl: './ui-button.scss',
})
export class UIButton {
  public text = input<string>('');
  public icon = input<string>('');
  public pipeIcon = input<string>('');
  public disabled = input<boolean>(false);
  public size = input<'normal' | 'small'>('normal');
}
