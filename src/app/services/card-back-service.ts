import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { CardBackCatalog, CardBackDef, PreferredBacks } from '../models/card-back';
import { I18nService } from '../i18n/i18n-service';
import { resolveCardBack } from '../utils/card-back';
import { FirebaseService } from './firebase-service';
import { UserService } from './user-service';

const STORAGE_KEY = 'cardBacks';
const CATALOG_URL = 'images/card-back/catalog.json';
const IMAGE_DIR = './images/card-back/';

type Side = 'runner' | 'corp';

/**
 * The card backs: the catalog (`public/images/card-back/catalog.json`), which one to show and
 * the preloading of the images.
 *
 * Which back is shown (`resolve`): the one chosen for the deck > the player's preferred one for
 * that side > the catalog's default for the side. The player's preference is kept on this device
 * (localStorage) and, when signed in, in the profile (`cardBacks`), which wins over the device
 * like the accent color does.
 */
@Injectable({ providedIn: 'root' })
export class CardBackService {
  private i18n = inject(I18nService);
  private firebase = inject(FirebaseService);
  private userService = inject(UserService);

  /** `null` until the catalog has loaded (or if it could not): users of this service fall back to the plain back. */
  public readonly catalog = signal<CardBackCatalog | null>(null);

  private readonly device = signal<PreferredBacks>(CardBackService.loadDevice());
  /** The player's preferred back per side: the profile over this device. */
  public readonly preferred = computed<PreferredBacks>(() => ({ ...this.device(), ...(this.firebase.$user()?.cardBacks ?? {}) }));

  /** Images already requested, kept so the browser doesn't drop them from its cache. */
  private preloaded = new Map<string, HTMLImageElement>();

  constructor() {
    void this.loadCatalog();

    // the backs that will be needed first: the ones in use (the deck's own come when a deck opens)
    effect(() => {
      const catalog = this.catalog();
      if (!catalog) return;
      for (const side of ['runner', 'corp'] as const) {
        const back = resolveCardBack(catalog, side, null, this.preferred());
        if (back) this.preload(back);
      }
    });
  }

  private static loadDevice(): PreferredBacks {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
    } catch {
      return {};
    }
  }

  private async loadCatalog(): Promise<void> {
    try {
      // revalidated on every load (it is tiny): a cached old catalog would hide new backs
      const res = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const catalog: CardBackCatalog = await res.json();
      this.catalog.set(catalog);
      // the rest, when the browser has nothing better to do
      const rest = () => catalog.backs.forEach(b => this.preload(b));
      if ('requestIdleCallback' in window) window.requestIdleCallback(rest); else setTimeout(rest, 2000);
    } catch (err) {
      console.error('[card backs] could not load the catalog', err);
    }
  }

  private preload(back: CardBackDef): void {
    const url = this.url(back);
    if (this.preloaded.has(url)) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    this.preloaded.set(url, image);
  }

  // ---- reading ---------------------------------------------------------------

  /** The backs of a side, in catalog order. */
  public backs(side: Side): CardBackDef[] {
    return this.catalog()?.backs.filter(b => b.side === side) ?? [];
  }

  /** The back to show for a side: the deck's choice (id, if any), else the player's, else the default. */
  public resolve(side: Side, deckBack?: string | null): CardBackDef | null {
    const catalog = this.catalog();
    return catalog ? resolveCardBack(catalog, side, deckBack, this.preferred()) : null;
  }

  public url(back: CardBackDef): string {
    return IMAGE_DIR + back.file;
  }

  /** Name in the current language (English if there is none). */
  public name(back: CardBackDef): string {
    return back.names[this.i18n.lang()] ?? back.names['en'] ?? back.id;
  }

  // ---- the player's preference ------------------------------------------------

  /** Id of the back the player gets for a side when a deck doesn't choose one. */
  public preferredId(side: Side): string | null {
    return this.resolve(side)?.id ?? null;
  }

  /** Picks the preferred back of a side: applied at once, kept on this device and in the profile. */
  public setPreferred(side: Side, id: string): void {
    const choice: PreferredBacks = { ...this.preferred(), [side]: id };
    this.device.set(choice);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
    } catch { /* storage unavailable: the choice just won't survive a reload */ }
    const uid = this.firebase.$user()?.uid;
    if (uid) {
      this.userService.updateUserInfo(uid, { cardBacks: choice })
        .catch(err => console.error('Error saving the card backs:', err));
    }
  }
}
