import { Component, input } from '@angular/core';
import { UIDiagonalLine } from '../ui-diagonal-line/ui-diagonal-line';

@Component({
  selector: 'app-ui-dialog-container',
  imports: [UIDiagonalLine],
  templateUrl: './ui-dialog-container.html',
  styleUrl: './ui-dialog-container.scss'
})
export class UiDialogContainer {
  public dialogTitle = input<string>('Dialog Title');
}
