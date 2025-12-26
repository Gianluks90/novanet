import { Component, inject, input } from '@angular/core';
import { UIDiagonalLine } from '../ui-diagonal-line/ui-diagonal-line';
import { FirebaseService } from '../../services/firebase-service';

@Component({
  selector: 'app-ui-dialog-container',
  imports: [UIDiagonalLine],
  templateUrl: './ui-dialog-container.html',
  styleUrl: './ui-dialog-container.scss'
})
export class UiDialogContainer {
  public dialogTitle = input<string>('Dialog Title');
  public firebase = inject(FirebaseService);
}
