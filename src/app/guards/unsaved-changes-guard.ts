import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialog } from '../components/dialogs/confirm-dialog/confirm-dialog';
import { DIALOGS_CONFIG, LOCKED_DIALOG } from '../const/dialogConfig';
import { DialogResult } from '../models/DialogResult';

/** Implemented by pages that can hold edits the user hasn't saved yet. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Asks for confirmation before leaving a page with unsaved changes (router navigation).
 * Closing/reloading the tab is covered by the page itself with a `beforeunload` handler.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = async (component) => {
  if (!component.hasUnsavedChanges()) return true;

  const ref = inject(Dialog).open<DialogResult>(ConfirmDialog, {
    ...DIALOGS_CONFIG,
    ...LOCKED_DIALOG,
    data: {
      title: 'unsavedChanges.title',
      message: 'unsavedChanges.message',
      confirmLabel: 'unsavedChanges.leave',
    },
  });

  const result = await firstValueFrom(ref.closed);
  return result?.status === 'confirmed';
};
