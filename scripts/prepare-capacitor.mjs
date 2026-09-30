// Builds the Capacitor web dir (capacitor-www/) from capacitor/www-template/,
// filling in the app's start URL. Run before `cap sync` (see npm run cap:sync).
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { appUrl, startPath } = JSON.parse(readFileSync("capacitor.app.json", "utf8"));
const base = (process.env.CAP_SERVER_URL ?? appUrl).replace(/\/+$/, "");
const startUrl = `${base}${startPath}`;

rmSync("capacitor-www", { recursive: true, force: true });
mkdirSync("capacitor-www");
for (const file of readdirSync("capacitor/www-template")) {
  const src = join("capacitor/www-template", file);
  if (file.endsWith(".html")) {
    writeFileSync(join("capacitor-www", file), readFileSync(src, "utf8").replaceAll("{{START_URL}}", startUrl));
  } else {
    cpSync(src, join("capacitor-www", file));
  }
}
console.log(`capacitor-www ready (start URL ${startUrl})`);
