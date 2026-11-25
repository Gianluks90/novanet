import { ACCENT_PRESETS } from '../../const/accent-colors';
import { Component, inject, signal } from '@angular/core';
import { ViewportService } from '../../services/viewport-service';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { UIButton, UiBadge, UiField, UiIconButton, UiSegmented, UiStepper, UiToggle, SegmentedOption } from '../../ui';

/**
 * Living style guide, reachable at `#/design-system` (not linked from the UI).
 * It shows every token and shared component in the current theme: check it in both
 * light and dark whenever the design system changes. Texts here are intentionally English-only.
 */
@Component({
  selector: 'app-design-system-page',
  imports: [UIButton, UiBadge, UiField, UiIconButton, UiSegmented, UiStepper, UiToggle, CdkMenuTrigger, CdkMenu, CdkMenuItem],
  templateUrl: './design-system-page.html',
  styleUrl: './design-system-page.scss',
})
export class DesignSystemPage {
  public viewport = inject(ViewportService);
  public colors = [
    { token: '--accent-color', note: 'Signature color: borders, active states, links' },
    { token: '--fg-color', note: 'Text' },
    { token: '--fg-color-muted', note: 'Secondary text' },
    { token: '--bg-color', note: 'Page / control background' },
    { token: '--bg-container-color', note: 'Panels' },
    { token: '--bg-color-muted', note: 'Disabled surfaces' },
    { token: '--success-color', note: 'Positive status' },
    { token: '--warn-color', note: 'Warning' },
    { token: '--error-color', note: 'Error / destructive' },
  ];

  public spacing = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6'];
  public radii = ['--radius-none', '--radius-sm', '--radius-md', '--radius-pill'];
  /** The type scale: roles (one value per layout), not raw sizes. Shown in the order of size. */
  public fontSizes = ['--font-size-hero', '--font-size-heading', '--font-size-lead', '--font-size-body', '--font-size-secondary', '--font-size-label'];

  public segmentedOptions: SegmentedOption[] = [
    { value: 'mine', label: 'decksListPage.viewPersonal' },
    { value: 'public', label: 'decksListPage.viewPublic' },
  ];
  public iconSegmentedOptions: SegmentedOption[] = [
    { value: 'private', label: 'deckBuilderPage.visibilityPrivate', icon: 'lock' },
    { value: 'shared', label: 'deckBuilderPage.visibilityShared', icon: 'link' },
    { value: 'public', label: 'deckBuilderPage.visibilityPublic', icon: 'public' },
  ];

  public segment = signal('mine');
  public visibility = signal('private');
  public swatchOptions: SegmentedOption[] = ACCENT_PRESETS.map(p => ({ value: p.id, label: p.label, color: p.color }));
  public swatch = signal('cyan');
  public copies = signal(1);
  public toggle = signal(false);
  public activeIcon = signal(false);
  public lastMenuAction = signal('—');
}
