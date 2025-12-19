import { Timestamp } from "firebase/firestore";

export interface NovaUser {
  uid: string;
  createdAt: Timestamp;
  displayName: string;
  email: string;
  photoURL: string;
  customPhotoURL?: string;
  customAccentColor?: string;
  nickname?: string;
}