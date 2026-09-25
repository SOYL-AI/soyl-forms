"use client";

import { extractHexColors, normalizeHex } from "@/lib/forms/color";

/**
 * Browser-side dominant-colour extraction for uploaded logos. Draws the
 * image onto a small canvas, buckets pixels to 4 bits per channel, and
 * returns the most frequent opaque colours (hex) — most frequent first.
 * SVGs are parsed for literal fills instead, so vector logos work too.
 */
export async function extractImagePalette(file: File, max = 8): Promise<string[]> {
  if (file.type === "image/svg+xml") {
    const text = await file.text();
    const named = extractHexColors(text);
    const rgb = [...text.matchAll(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g)].map(
      (m) =>
        `#${[m[1], m[2], m[3]]
          .map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0"))
          .join("")}`,
    );
    return [...new Set([...named, ...rgb])].slice(0, max);
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image."));
      el.src = url;
    });
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] ?? 0;
      if (a < 128) continue;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const cur = buckets.get(key);
      if (cur) {
        cur.count += 1;
        cur.r += r;
        cur.g += g;
        cur.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
    const ranked = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .map((c) => {
        const n = c.count;
        return normalizeHex(
          `#${[c.r / n, c.g / n, c.b / n]
            .map((v) => Math.round(v).toString(16).padStart(2, "0"))
            .join("")}`,
        );
      })
      .filter((c): c is string => Boolean(c));
    return [...new Set(ranked)].slice(0, max);
  } finally {
    URL.revokeObjectURL(url);
  }
}
