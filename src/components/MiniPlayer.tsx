import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createStore, useStore } from "../lib/store";
import { controls, player } from "../lib/player";
import { Icon } from "./Icon";
import { Timeline } from "./PlayerBar";

/**
 * Floating mini player that stays above other windows, using Chrome's
 * Document Picture-in-Picture. Hidden in browsers that don't support it.
 */

interface DocPip {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}
const docPip = (window as unknown as { documentPictureInPicture?: DocPip }).documentPictureInPicture;

const pip = createStore<{ win: Window | null }>({ win: null });

function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
      target.head.appendChild(style);
    } catch {
      // Cross-origin sheets (Google Fonts) can't be read; link them instead.
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
  // Carry over the live accent color variables.
  target.documentElement.setAttribute("style", document.documentElement.getAttribute("style") ?? "");
}

export async function toggleMiniPlayer() {
  const open = pip.get().win;
  if (open) return open.close();
  if (!docPip) return;
  const win = await docPip.requestWindow({ width: 340, height: 132 });
  copyStyles(win.document);
  win.document.title = "Afterglow";
  win.addEventListener("pagehide", () => pip.set({ win: null }));
  pip.set({ win });
}

export function MiniPlayerButton() {
  const open = useStore(pip, (s) => !!s.win);
  if (!docPip) return null;
  return (
    <button className={`icon-btn${open ? " on" : ""}`} onClick={toggleMiniPlayer} aria-label="Floating mini player" title="Floating mini player">
      <Icon name="pip" size={18} />
    </button>
  );
}

function Mini() {
  const track = useStore(player, (s) => s.track);
  const paused = useStore(player, (s) => s.paused);
  return (
    <div className="mini">
      {track?.album.image && <img className="mini-bg" src={track.album.image} alt="" />}
      <div className="mini-row">
        {track?.album.imageSmall && <img className="mini-cover" src={track.album.imageSmall} alt="" />}
        <div className="mini-text">
          <strong>{track?.name ?? "Nothing playing"}</strong>
          <span>{track?.artists.map((a) => a.name).join(", ")}</span>
        </div>
      </div>
      <div className="mini-controls">
        <button className="icon-btn" onClick={controls.prev} aria-label="Previous">
          <Icon name="prev" size={20} />
        </button>
        <button className="play-btn" onClick={controls.toggle} aria-label={paused ? "Play" : "Pause"}>
          <Icon name={paused ? "play" : "pause"} size={20} />
        </button>
        <button className="icon-btn" onClick={controls.next} aria-label="Next">
          <Icon name="next" size={20} />
        </button>
      </div>
      <Timeline compact />
    </div>
  );
}

export function MiniPlayerPortal() {
  const win = useStore(pip, (s) => s.win);
  // Keep the accent color in sync while the window is open.
  const accent = useStore(player, (s) => s.track?.album.image);
  useEffect(() => {
    if (win) setTimeout(() => win.document.documentElement.setAttribute("style", document.documentElement.getAttribute("style") ?? ""), 300);
  }, [win, accent]);
  return win ? createPortal(<Mini />, win.document.body) : null;
}
