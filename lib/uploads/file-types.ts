/** Content sniffing is independent of browser-reported MIME/extension. */
export function matchesFileType(bytes: Uint8Array, mime: string): boolean {
  const starts = (...signature: number[]) => signature.every((n, i) => bytes[i] === n);
  const ascii = (start: number, length: number) => new TextDecoder().decode(bytes.slice(start, start + length));
  switch (mime) {
    case "image/png": return starts(137, 80, 78, 71, 13, 10, 26, 10);
    case "image/jpeg": return starts(255, 216, 255);
    case "image/gif": return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "image/heic":
    case "image/heif": return ascii(4, 4) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8, 4));
    case "application/pdf": return ascii(0, 5) === "%PDF-";
    case "application/msword": return starts(208, 207, 17, 224, 161, 177, 26, 225);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return starts(80, 75, 3, 4);
    case "text/plain":
    case "text/csv":
    case "text/markdown": {
      if (bytes.includes(0)) return false;
      try { new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true }); return true; }
      catch { return false; }
    }
    default: return false;
  }
}
