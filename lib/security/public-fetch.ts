import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

const denied = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) denied.addSubnet(address, prefix, "ipv4");
denied.addSubnet("2001::", 23, "ipv6");
denied.addSubnet("2001:db8::", 32, "ipv6");
denied.addSubnet("2002::", 16, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, "ipv4");
  if (family === 6) return globalV6.check(address, "ipv6") && !denied.check(address, "ipv6");
  return false;
}

export function parsePublicUrl(raw: string): URL {
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      host === "localhost" || /\.(local|internal|localhost)$/.test(host) ||
      (isIP(host) !== 0 && !isPublicAddress(host))) {
    throw new Error("A public HTTPS address is required.");
  }
  return url;
}

async function resolveAddress(url: URL) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS timeout.")), 4000); }),
    ]);
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new Error("Private or reserved destinations aren't allowed.");
    }
    return addresses[0]!;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function validatePublicUrl(raw: string): Promise<URL> {
  const url = parsePublicUrl(raw);
  await resolveAddress(url);
  return url;
}

/** Resolve once and connect to that exact IP, preserving TLS hostname verification.
 * Every redirect gets a fresh validation. No proxy, cookies or auth forwarding.
 */
export async function publicFetch(raw: string, options: {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  maxBytes?: number;
  timeoutMs?: number;
  redirects?: number;
} = {}): Promise<Response> {
  const url = parsePublicUrl(raw);
  const address = await resolveAddress(url);
  const response = await new Promise<Response>((resolve, reject) => {
    const req = request({
      hostname: address.address,
      family: address.family,
      servername: isIP(url.hostname.replace(/^\[|\]$/g, "")) ? undefined : url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method ?? "GET",
      headers: { ...options.headers, host: url.host },
      agent: false,
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > (options.maxBytes ?? 1_500_000)) {
          req.destroy(new Error("Response exceeds the allowed size."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = res.statusCode ?? 502;
        resolve(new Response([204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks)), { status, headers }));
      });
    });
    req.on("error", reject);
    req.end(options.body);
  });
  const remaining = options.redirects ?? 0;
  const location = response.headers.get("location");
  if (remaining > 0 && [301, 302, 303, 307, 308].includes(response.status) && location) {
    // Brand extraction uses GET. Never redirect POST bodies or secrets.
    if (options.method === "POST") throw new Error("Webhook redirects aren't followed.");
    return publicFetch(new URL(location, url).toString(), { ...options, redirects: remaining - 1 });
  }
  return response;
}
