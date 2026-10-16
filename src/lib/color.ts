/**
 * Pulls a usable accent color out of album art. Spotify's image CDN allows
 * cross-origin reads; if it ever doesn't, we keep the default accent.
 */

const DEFAULT = { accent: "#ff8fa3", glow: "#5b3fd1" };
const cache = new Map<string, Promise<typeof DEFAULT>>();

function hsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s, l };
}

const css = (h: number, s: number, l: number) => `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;

export function albumColors(url: string | undefined): Promise<typeof DEFAULT> {
  if (!url) return Promise.resolve(DEFAULT);
  let p = cache.get(url);
  if (p) return p;
  p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, 24, 24);
        const px = ctx.getImageData(0, 0, 24, 24).data;
        // Bucket hues, weighting colorful mid-tone pixels most.
        const buckets = new Array(12).fill(0).map(() => ({ w: 0, s: 0, l: 0 }));
        let darkest = { h: 260, s: 0.5, l: 1 };
        for (let i = 0; i < px.length; i += 4) {
          const c2 = hsl(px[i], px[i + 1], px[i + 2]);
          const w = c2.s * (1 - Math.abs(c2.l - 0.5) * 1.6);
          if (w > 0) {
            const b = buckets[Math.floor(c2.h / 30) % 12];
            b.w += w; b.s += c2.s * w; b.l += c2.l * w;
          }
          if (c2.s > 0.25 && c2.l < darkest.l && c2.l > 0.08) darkest = c2;
        }
        const top = buckets.map((b, i) => ({ ...b, i })).sort((a, b) => b.w - a.w)[0];
        if (!top || top.w < 2) return resolve({ accent: "#e8e6f0", glow: css(darkest.h, darkest.s * 0.6, 0.25) });
        const h = top.i * 30 + 15;
        const s = Math.min(1, top.s / top.w + 0.15);
        resolve({ accent: css(h, Math.max(s, 0.55), 0.72), glow: css(h, s, 0.32) });
      } catch {
        resolve(DEFAULT);
      }
    };
    img.onerror = () => resolve(DEFAULT);
    img.src = url;
  });
  cache.set(url, p);
  return p;
}
