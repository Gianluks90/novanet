import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, input } from '@angular/core';

/**
 * Slight 3D tilt (plus a moving glare) that follows the pointer over the host element.
 *
 * It only sets CSS custom properties on the host (`--tilt-x`, `--tilt-y`, `--tilt-scale`,
 * `--glare-x`, `--glare-y`, `--glare-opacity`) and toggles the `tilting` class; the host's CSS
 * decides how they are used. Listeners run outside Angular's zone (no change detection per
 * mouse move) and nothing is attached on touch screens or with `prefers-reduced-motion`.
 */
@Directive({
  selector: '[appCardTilt]',
})
export class CardTiltDirective implements OnInit, OnDestroy {
  /** Maximum rotation, in degrees. */
  public maxTilt = input(10);

  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private zone = inject(NgZone);
  private rect: DOMRect | null = null;
  private frame = 0;
  private last: { x: number; y: number } | null = null;
  private teardown: Array<() => void> = [];

  ngOnInit() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.listen('pointerenter', () => {
        this.rect = this.host.getBoundingClientRect();
        this.host.classList.add('tilting');
        this.host.style.setProperty('--tilt-scale', '1.05');
        this.host.style.setProperty('--glare-opacity', '1');
      });

      this.listen('pointermove', (e: Event) => {
        const p = e as PointerEvent;
        this.last = { x: p.clientX, y: p.clientY };
        if (!this.frame) this.frame = requestAnimationFrame(() => this.update());
      });

      this.listen('pointerleave', () => this.reset());
    });
  }

  ngOnDestroy() {
    this.reset();
    this.teardown.forEach(off => off());
    this.teardown = [];
  }

  private listen(type: string, handler: (e: Event) => void) {
    this.host.addEventListener(type, handler);
    this.teardown.push(() => this.host.removeEventListener(type, handler));
  }

  private update() {
    this.frame = 0;
    if (!this.rect || !this.last) return;
    const x = Math.min(1, Math.max(0, (this.last.x - this.rect.left) / this.rect.width));
    const y = Math.min(1, Math.max(0, (this.last.y - this.rect.top) / this.rect.height));
    const max = this.maxTilt();
    const style = this.host.style;
    style.setProperty('--tilt-y', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    style.setProperty('--tilt-x', `${(-(y - 0.5) * 2 * max).toFixed(2)}deg`);
    style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
    style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
  }

  private reset() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.rect = null;
    this.last = null;
    this.host.classList.remove('tilting');
    const style = this.host.style;
    ['--tilt-x', '--tilt-y', '--tilt-scale', '--glare-x', '--glare-y', '--glare-opacity']
      .forEach(prop => style.removeProperty(prop));
  }
}
