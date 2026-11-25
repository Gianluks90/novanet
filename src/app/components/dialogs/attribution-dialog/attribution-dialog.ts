import { Component } from '@angular/core';
import { UiDialogContainer } from '../../../ui';
import { TranslatePipe } from '../../../i18n/translate-pipe';

/** Credits for the card images, the data and the community translations. */
@Component({
  selector: 'app-attribution-dialog',
  imports: [TranslatePipe, UiDialogContainer],
  templateUrl: './attribution-dialog.html',
  styleUrl: './attribution-dialog.scss',
})
export class AttributionDialog {}
