import { Component, input } from '@angular/core';

@Component({
  selector: 'app-ui-dialog-container',
  templateUrl: './ui-dialog-container.html',
  styleUrl: './ui-dialog-container.scss'
})
export class UiDialogContainer {
  public dialogTitle = input<string>('Dialog Title');
}
