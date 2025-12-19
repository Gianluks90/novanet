import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        title: 'Home - NovaNet',
        loadComponent: () => import('./pages/home-page/home-page').then(m => m.HomePage),
    },
    {
        path: '**',
        redirectTo: '',
    }
];
