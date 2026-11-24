import { Component, ElementRef, effect, inject, input } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate-pipe';
import { TranslationKey } from '../../i18n/en';

/**
 * A form field: label, the control (projected: an `input`, `select` or `textarea`) and, below it,
 * an error or a hint. The control must have the id given in `forId`. The field wires the control
 * to its message (`aria-describedby`) and marks it `aria-invalid` while there is an error, so the
 * caller only decides when to show the error.
 *
 *   <app-ui-field label="authDialog.email" forId="email" [error]="invalid ? 'authDialog.errorEmailInvalid' : null">
 *     <input type="email" id="email" formControlName="email">
 *   </app-ui-field>
 *
 * Anything with the attribute `field-extra` (e.g. a "forgot password" link) goes next to the label.
 */
@Component({
  selector: 'app-ui-field',
  imports: [TranslatePipe],
  templateUrl: './ui-field.html',
  styleUrl: './ui-field.scss',
})
export class UiField {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Translation key of the label. */
  public label = input.required<TranslationKey>();
  /** Id of the projected control. */
  public forId = input.required<string>();
  public hint = input<TranslationKey | null>(null);
  /** Translation key of the error; `null` when the field is fine. */
  public error = input<TranslationKey | null>(null);

  constructor() {
    effect(() => {
      const control = this.host.nativeElement.querySelector('input, select, textarea');
      if (!control) return;
      const message = this.error() ? `${this.forId()}-error` : this.hint() ? `${this.forId()}-hint` : null;
      if (message) control.setAttribute('aria-describedby', message); else control.removeAttribute('aria-describedby');
      if (this.error()) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
    });
  }
}
