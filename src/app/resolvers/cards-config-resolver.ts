import { ResolveFn } from '@angular/router';
import { from, forkJoin, map } from 'rxjs';

export const cardsConfigResolver: ResolveFn<any> = () => {
  const baseUrl = 'https://netrunnerdb.com/api/2.0/public/';
  const apis = ['cycles', 'factions', 'packs', 'sides', 'types'];

  const requests = apis.reduce((acc, api) => {
    acc[api] = from(
      fetch(`${baseUrl}${api}`).then(res => {
        if (!res.ok) {
          throw new Error(`Fetch failed for ${api}: ${res.status}`);
        }
        return res.json();
      })
    );
    return acc;
  }, {} as Record<string, any>);

  return forkJoin(requests);
};
