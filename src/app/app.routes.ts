import { Routes } from '@angular/router';
import { nrdbResolver } from './resolvers/nrdb-resolver';
import { cardsConfigResolver } from './resolvers/cards-config-resolver';
import { deckResolver } from './resolvers/deck-resolver';
import { unsavedChangesGuard } from './guards/unsaved-changes-guard';

export const routes: Routes = [
    {
        path: '',
        title: 'routeTitle.home',
        loadComponent: () => import('./pages/home-page/home-page').then(m => m.HomePage),
        data: { responsive: true },
        resolve: {
            nrdb: nrdbResolver,
            configs: cardsConfigResolver
        }
    },
    {
        path: 'cards',
        title: 'routeTitle.cards',
        loadComponent: () => import('./pages/cards-page/cards-page').then(m => m.CardsPage),
        data: { responsive: true },
        resolve: {
            nrdb: nrdbResolver,
            configs: cardsConfigResolver
        }
    },
    {
        path: 'decks',
        title: 'routeTitle.decks',
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
                title: 'routeTitle.decksList',
                loadComponent: () => import('./pages/decks-page/decks-list-page/decks-list-page').then(m => m.DecksListPage),
                data: { responsive: true },
            },
            {
                path: 'builder/:id',
                title: 'routeTitle.deckBuilder',
                loadComponent: () => import('./pages/decks-page/deck-builder-page/deck-builder-page').then(m => m.DeckBuilderPage),
                canDeactivate: [unsavedChangesGuard],
                data: { responsive: true },
                resolve: {
                    deck: deckResolver,
                }
            }
        ]
    },
    {
        path: 'design-lab',
        title: 'Design Lab', // developer page, not translated
        loadComponent: () => import('./pages/design-lab-page/design-lab-page').then(m => m.DesignLabPage),
        data: { responsive: true },
    },
    {
        path: 'design-system',
        title: 'Design System', // developer page, not translated
        loadComponent: () => import('./pages/design-system-page/design-system-page').then(m => m.DesignSystemPage),
    },
    {
        path: '**',
        redirectTo: '',
    }
];
