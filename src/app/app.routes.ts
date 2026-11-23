import { Routes } from '@angular/router';
import { nrdbResolver } from './resolvers/nrdb-resolver';
import { cardsConfigResolver } from './resolvers/cards-config-resolver';
import { deckResolver } from './resolvers/deck-resolver';

export const routes: Routes = [
    {
        path: '',
        title: 'Home - NovaNet',
        loadComponent: () => import('./pages/home-page/home-page').then(m => m.HomePage),
        resolve: {
            nrdb: nrdbResolver,
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
        path: 'decks',
        title: 'Decks - NovaNet',
        loadComponent: () => import('./pages/decks-page/decks-page').then(m => m.DecksPage),
        resolve: {
            nrdb: nrdbResolver,
            configs: cardsConfigResolver
        },
        children: [
            {
                path: '', // Serve a fare il redirect a /list
                pathMatch: 'full',
                redirectTo: 'list'
            },
            {
                path: 'list',
                title: 'Decks List - NovaNet',
                loadComponent: () => import('./pages/decks-page/decks-list-page/decks-list-page').then(m => m.DecksListPage),
            },
            {
                path: 'builder/:id',
                title: 'Deck Builder - NovaNet',
                loadComponent: () => import('./pages/decks-page/deck-builder-page/deck-builder-page').then(m => m.DeckBuilderPage),
                resolve: {
                    deck: deckResolver,
                }
            }
        ]
    },
    {
        path: 'design-system',
        title: 'Design System - NovaNet',
        loadComponent: () => import('./pages/design-system-page/design-system-page').then(m => m.DesignSystemPage),
    },
    {
        path: '**',
        redirectTo: '',
    }
];
