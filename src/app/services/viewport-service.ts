import { Injectable, signal } from '@angular/core';
import { MOBILE_MAX_WIDTH } from '../const/viewport';

/**
 * Which of the two layouts is active. Styles should use the `mobile` / `desktop` mixins of
 * `styles/_breakpoints.scss`; use this only when the template itself must differ.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly query = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
  /** True in the mobile layout (width <= `MOBILE_MAX_WIDTH`). */
  public readonly isMobile = signal(this.query.matches);

  constructor() {
    this.query.addEventListener('change', (e) => this.isMobile.set(e.matches));
  }
}
