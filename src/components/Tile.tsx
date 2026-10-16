import type { MouseEvent } from "react";
import { Icon } from "./Icon";

interface Props {
  title: string;
  subtitle?: string;
  image?: string;
  href?: string;
  round?: boolean;
  onPlay?: () => void;
  active?: boolean;
}

/** Cover art with a title. Clicking opens it; the round button plays it. */
export function Tile({ title, subtitle, image, href, round, onPlay, active }: Props) {
  const play = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPlay?.();
  };
  const body = (
    <>
      <div className={`cover${round ? " round" : ""}`}>
        {image ? <img src={image} alt="" loading="lazy" /> : <div className="cover-blank" />}
        {onPlay && (
          <button className={`tile-play${active ? " on" : ""}`} onClick={play} aria-label={`Play ${title}`}>
            <Icon name="play" size={22} />
          </button>
        )}
      </div>
      <div className="tile-title" title={title}>{title}</div>
      {subtitle && <div className="tile-sub">{subtitle}</div>}
    </>
  );
  return href ? (
    <a className={`tile${round ? " artist" : ""}`} href={href}>
      {body}
    </a>
  ) : (
    <div className={`tile${round ? " artist" : ""}`} role="button" tabIndex={0} onClick={onPlay} onKeyDown={(e) => e.key === "Enter" && onPlay?.()}>
      {body}
    </div>
  );
}
