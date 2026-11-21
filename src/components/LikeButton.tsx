import { useEffect, useRef, useState } from "react";
import { spotify } from "../lib/spotify";
import { freshness, invalidate, library } from "../lib/hooks";
import { useStore } from "../lib/store";
import { Icon } from "./Icon";
import { toast } from "./Toast";

/** Heart for songs and albums, or a Follow pill for artists. */
export function LikeButton({ uri, label, follow, size = 20 }: { uri?: string; label: string; follow?: boolean; size?: number }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const tick = useStore(freshness, (f) => f.tick);
  const lastUri = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Blank the heart only for a new song; a background re-check keeps it shown.
    if (lastUri.current !== uri) setSaved(null);
    lastUri.current = uri;
    if (!uri) return;
    let live = true;
    spotify
      .isSaved([uri])
      .then((r) => live && setSaved(!!r?.[0]))
      .catch(() => live && setSaved(false));
    return () => {
      live = false;
    };
  }, [uri, tick]);

  if (!uri) return null;

  const flip = async () => {
    const next = !saved;
    setSaved(next);
    try {
      await (next ? spotify.save([uri]) : spotify.unsave([uri]));
      if (label === "song") invalidate("liked");
      if (label === "album") library.set((l) => ({ v: l.v + 1 }));
      toast(follow ? (next ? "Following" : "Unfollowed") : next ? `Saved ${label} to your library` : `Removed ${label} from your library`);
    } catch (e) {
      setSaved(!next);
      toast(`Couldn't update your library: ${(e as Error).message}`);
    }
  };

  if (follow)
    return (
      <button className={`pill-btn${saved ? " on" : ""}`} onClick={flip} disabled={saved === null}>
        {saved ? "Following" : "Follow"}
      </button>
    );

  return (
    <button
      className={`icon-btn like${saved ? " on" : ""}`}
      onClick={flip}
      disabled={saved === null}
      aria-pressed={!!saved}
      aria-label={saved ? `Remove ${label} from library` : `Save ${label} to library`}
      title={saved ? "Saved" : "Save"}
    >
      <Icon name="heart" size={size} />
    </button>
  );
}
