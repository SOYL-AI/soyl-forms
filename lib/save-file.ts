import { isNativeApp } from "@/lib/native";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Save a file the user asked for. On the web this is a normal download; the
 * Android WebView ignores downloads, so in the app the file is written to the
 * cache and handed to the share sheet (Save to Files, Drive, WhatsApp, …).
 */
export async function saveFile(fileName: string, blob: Blob): Promise<void> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const { uri } = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title: fileName, files: [uri] });
    } catch {
      /* the user closed the share sheet */
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
