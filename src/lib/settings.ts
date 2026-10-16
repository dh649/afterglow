import { createStore, readLocal, writeLocal } from "./store";

export type BackgroundMode = "album" | "wallpaper" | "plain";
export type LyricsSize = "small" | "medium" | "large";

export interface Settings {
  background: BackgroundMode;
  wallpaper: string | null; // downscaled data URL
  blur: number; // px, 0-80
  dim: number; // 0-0.9
  glass: number; // panel opacity 0-0.8
  motion: boolean; // animate the album background
  albumAccent: boolean; // tint buttons with the album color
  lyricsSize: LyricsSize;
  lyricsOffsetMs: number;
  lastfmKey: string;
  lyricsRelay: string; // optional personal relay for LRCLIB search
  doubleClick: "play" | "queue";
}

const KEY = "afterglow.settings";

export const defaults: Settings = {
  background: "album",
  wallpaper: null,
  blur: 40,
  dim: 0.35,
  glass: 0.28,
  motion: true,
  albumAccent: true,
  lyricsSize: "medium",
  lyricsOffsetMs: 0,
  lastfmKey: "",
  lyricsRelay: "",
  doubleClick: "play",
};

export const settings = createStore<Settings>(readLocal(KEY, defaults));
settings.subscribe(() => writeLocal(KEY, settings.get()));

/** Shrinks an uploaded image so it fits comfortably in local storage. */
export function downscaleImage(file: File, max = 1920): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("That file isn't an image this browser can read."));
    img.src = url;
  });
}
