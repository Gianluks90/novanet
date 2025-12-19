export interface DialogResult {
    status: 'confirmed' | 'cancelled';
    data?: any
}