import { Timestamp } from "firebase/firestore";

export interface NovaUser {
  uid: string;
  createdAt: Timestamp;
  displayName: string;
  email: string;
  photoURL: string;
  customPhotoURL?: string;
  customBackgroundURL?: string;
  /** Accent preset id chosen for each theme (see const/accent-colors.ts). */
  accentColors?: { light?: string; dark?: string };
  nickname?: string;
  favoriteCaption?: {
    [lang: string]: string;
  };
  favoriteFaction?: string;
  role?: string;
}