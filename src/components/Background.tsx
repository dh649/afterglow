import { useEffect, useRef } from "react";
import { player } from "../lib/player";
import { settings } from "../lib/settings";
import { useStore } from "../lib/store";

/**
 * Album art redrawn as slowly rotating, overlapping layers on a tiny canvas,
 * blurred inside the canvas, then stretched to fill the screen. Cheap to run, and it looks like the cover
 * has melted into the room.
 */
function AlbumCanvas({ image, blur, animate }: { image?: string; blur: number; animate: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layers = useRef<{ img: HTMLImageElement; born: number }[]>([]);
  const blurRef = useRef(blur);
  blurRef.current = blur;

  // Load each new cover and crossfade it in over the previous one.
  useEffect(() => {
    if (!image) return;
    const img = new Image();
    img.onload = () => {
      layers.current = [...layers.current.slice(-1), { img, born: performance.now() }];
    };
    img.src = image;
  }, [image]);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const resize = () => {
      const scale = 0.12; // render small; the browser smooths it when stretched
      c.width = Math.max(64, Math.round(innerWidth * scale));
      c.height = Math.max(40, Math.round(innerHeight * scale));
    };
    resize();
    addEventListener("resize", resize);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const moving = animate && !reduced;
    let raf = 0;
    let last = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return; // about 30fps is plenty for something this slow
      last = now;
      const t = moving ? now / 1000 : 12;
      const { width: w, height: h } = c;
      const size = Math.max(w, h);
      ctx.filter = "none";
      ctx.fillStyle = "#07080c";
      ctx.fillRect(0, 0, w, h);
      // Blur and saturate inside the tiny canvas. Doing it in CSS on the
      // full-screen element was the single biggest cause of choppiness.
      ctx.filter = `blur(${(Math.max(blurRef.current, 12) * 0.12) / 3}px) saturate(1.5)`;

      for (const { img, born } of layers.current) {
        const fade = Math.min(1, (now - born) / 1400);
        // Four copies of the cover, each turning and drifting at its own pace.
        const passes = [
          { x: 0.3, y: 0.35, s: 1.25, r: t * 0.05, a: 1 },
          { x: 0.75, y: 0.6, s: 1.05, r: -t * 0.07 + 2, a: 0.75 },
          { x: 0.5 + Math.sin(t * 0.13) * 0.18, y: 0.2 + Math.cos(t * 0.11) * 0.12, s: 0.8, r: t * 0.09 + 4, a: 0.6 },
          { x: 0.15 + Math.cos(t * 0.08) * 0.1, y: 0.85, s: 0.9, r: -t * 0.04 + 1, a: 0.55 },
        ];
        for (const p of passes) {
          ctx.save();
          ctx.globalAlpha = p.a * fade;
          ctx.translate(p.x * w, p.y * h);
          ctx.rotate(p.r);
          const d = size * p.s;
          ctx.drawImage(img, -d / 2, -d / 2, d, d);
          ctx.restore();
        }
      }
      if (!moving && layers.current.every(({ born }) => now - born > 1400)) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
    };
  }, [animate, image, blur]);

  return <canvas ref={canvas} className="bg-canvas" aria-hidden="true" />;
}

export function Background() {
  const image = useStore(player, (s) => s.track?.album.image);
  const { background, wallpaper, blur, dim, motion } = useStore(settings, (s) => s);

  return (
    <div className="bg" aria-hidden="true">
      {background === "album" && <AlbumCanvas image={image} blur={blur} animate={motion} />}
      {background === "wallpaper" && wallpaper && (
        <div className="bg-wallpaper" style={{ backgroundImage: `url(${wallpaper})`, filter: `blur(${blur}px)` }} />
      )}
      {(background === "plain" || (background === "wallpaper" && !wallpaper)) && <div className="bg-plain" />}
      <div className="bg-dim" style={{ opacity: dim }} />
      <div className="bg-grain" />
    </div>
  );
}
