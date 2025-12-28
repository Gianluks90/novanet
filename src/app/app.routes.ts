import { Routes } from '@angular/router';
import { nrdbResolver } from './resolvers/nrdb-resolver';
import { cardsConfigResolver } from './resolvers/cards-config-resolver';

export const routes: Routes = [
    {
        path: '',
        title: 'Home - NovaNet',
        loadComponent: () => import('./pages/home-page/home-page').then(m => m.HomePage),
        resolve: {
            configs: cardsConfigResolver
        }
    },
    {
        path: 'cards',
        title: 'Cards - NovaNet',
        loadComponent: () => import('./pages/cards-page/cards-page').then(m => m.CardsPage),
        resolve: {
            nrdb: nrdbResolver,
            configs: cardsConfigResolver
        }
    },
    {
        path: '**',
        redirectTo: '',
    }
];
