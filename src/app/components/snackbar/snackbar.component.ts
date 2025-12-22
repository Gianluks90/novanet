import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-snackbar',
  imports: [],
  templateUrl: './snackbar.component.html',
  styleUrl: './snackbar.component.scss'
})
export class SnackbarComponent {
  @Input() message = '';
  @Input() icon: 'check' | 'dangerous' | 'warning' | 'info' | 'cards_stack' = 'info';
}
