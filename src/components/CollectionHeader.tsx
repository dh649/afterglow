import { useEffect, useState, type ReactNode } from "react";
import { albumColors } from "../lib/color";
import { controls, player } from "../lib/player";
import { useStore } from "../lib/store";
import { Icon } from "./Icon";

interface Props {
  kind: string;
  title: string;
  image?: string;
  round?: boolean;
  meta?: ReactNode;
  description?: string;
  /** Spotify context this header plays, used to show pause when it's already playing. */
  contextUri?: string;
  onPlay: () => void;
  onShuffle?: () => void;
  extra?: ReactNode;
}

export function CollectionHeader({ kind, title, image, round, meta, description, contextUri, onPlay, onShuffle, extra }: Props) {
  const [glow, setGlow] = useState<string>();
  const playingHere = useStore(player, (s) => !!contextUri && s.contextUri === contextUri && !s.paused);

  useEffect(() => {
    let live = true;
    albumColors(image).then((c) => live && setGlow(c.glow));
    return () => {
      live = false;
    };
  }, [image]);

  return (
    <header className="collection-head" style={glow ? ({ "--head-glow": glow } as React.CSSProperties) : undefined}>
      <div className={`collection-cover${round ? " round" : ""}`}>
        {image ? <img src={image} alt="" /> : <div className="cover-blank" />}
      </div>
      <div className="collection-info">
        <span className="collection-kind">{kind}</span>
        <h1 className={title.length > 28 ? "long" : undefined}>{title}</h1>
        {description && <p className="collection-desc">{description}</p>}
        {meta && <div className="collection-meta">{meta}</div>}
        <div className="collection-actions">
          <button className="play-big" onClick={playingHere ? controls.toggle : onPlay} aria-label={playingHere ? "Pause" : `Play ${title}`}>
            <Icon name={playingHere ? "pause" : "play"} size={26} />
          </button>
          {onShuffle && (
            <button className="pill-btn" onClick={onShuffle}>
              <Icon name="shuffle" size={16} /> Shuffle
            </button>
          )}
          {extra}
        </div>
      </div>
    </header>
  );
}

export function HeaderSkeleton() {
  return (
    <header className="collection-head" aria-hidden="true">
      <div className="collection-cover skeleton" />
      <div className="collection-info">
        <div className="skeleton line" style={{ width: 80 }} />
        <div className="skeleton line big" />
        <div className="skeleton line short" />
      </div>
    </header>
  );
}

export function totalDuration(ms: number) {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} hr ${min % 60} min` : `${min} min`;
}
