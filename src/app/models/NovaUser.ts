import { Timestamp } from "firebase/firestore";

export interface NovaUser {
  uid: string;
  createdAt: Timestamp;
  displayName: string;
  email: string;
  photoURL: string;
  customPhotoURL?: string;
  customBackgroundURL?: string;
  customAccentColor?: string;
  nickname?: string;
  favoriteCaption?: {
    [lang: string]: string;
  };
  favoriteFaction?: string;
  role?: string;
}