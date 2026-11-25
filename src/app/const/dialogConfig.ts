export const DIALOGS_CONFIG = {
    panelClass: 'dialog-container',
    backdropClass: 'dialog-backdrop',
    autofocus: false,
    maxHeight: '60%',
    overflow: 'auto'
}

/**
 * Spread after DIALOGS_CONFIG for a dialog that must not close by clicking the backdrop or with
 * Esc: besides `disableClose` it marks the backdrop, so it keeps the normal cursor instead of the
 * "close" X (see styles.scss).
 */
export const LOCKED_DIALOG = {
    disableClose: true,
    backdropClass: ['dialog-backdrop', 'dialog-backdrop-locked'],
};
