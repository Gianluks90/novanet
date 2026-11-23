import { Component, signal } from '@angular/core';
import { UIButton, UiBadge, UiIconButton, UiSegmented, UiToggle, SegmentedOption } from '../../ui';

/**
 * Living style guide, reachable at `#/design-system` (not linked from the UI).
 * It shows every token and shared component in the current theme: check it in both
 * light and dark whenever the design system changes. Texts here are intentionally English-only.
 */
@Component({
  selector: 'app-design-system-page',
  imports: [UIButton, UiBadge, UiIconButton, UiSegmented, UiToggle],
  templateUrl: './design-system-page.html',
  styleUrl: './design-system-page.scss',
})
export class DesignSystemPage {
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
  public fontSizes = ['--font-size-xs', '--font-size-sm', '--font-size-md', '--font-size-lg', '--font-size-xl', '--font-size-2xl'];

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
  public toggle = signal(false);
  public activeIcon = signal(false);
}
