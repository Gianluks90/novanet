import { Component, input, output } from '@angular/core';

/**
 * Quantity stepper: `−  3  +`. It only emits; the parent owns the value and decides the limits
 * (`min`, `max`; `max` null = no upper limit). Both labels are required (accessible names and
 * tooltips), pass them already translated.
 */
@Component({
  selector: 'app-ui-stepper',
  templateUrl: './ui-stepper.html',
  styleUrl: './ui-stepper.scss',
})
export class UiStepper {
  public value = input.required<number>();
  public min = input<number>(0);
  public max = input<number | null>(null);
  public decreaseLabel = input.required<string>();
  public increaseLabel = input.required<string>();
  public disabled = input<boolean>(false);

  public decrease = output<void>();
  public increase = output<void>();

  public get canDecrease(): boolean {
    return !this.disabled() && this.value() > this.min();
  }

  public get canIncrease(): boolean {
    const max = this.max();
    return !this.disabled() && (max === null || this.value() < max);
  }
}
