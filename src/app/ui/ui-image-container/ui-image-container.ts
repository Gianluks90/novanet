import { Component, input } from '@angular/core';

@Component({
  selector: 'app-ui-image-container',
  imports: [],
  templateUrl: './ui-image-container.html',
  styleUrl: './ui-image-container.scss'
})
export class UiImageContainer {
  public width = input<number | string>('100%');
  public height = input<number | string>('100%');
  // public faceId = input<string | null>(null);
  public url = input<string | null>(null);
  public notAvailable = input<boolean>(false);
}
