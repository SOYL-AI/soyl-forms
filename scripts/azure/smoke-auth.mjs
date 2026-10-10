const origin = process.env.ENTRA_APP_ORIGIN;
if (!origin) throw new Error("ENTRA_APP_ORIGIN is required");
const proof = await fetch(`${origin}/auth/entra/proof`, { signal: AbortSignal.timeout(60_000) });
if (proof.status !== 200 || proof.headers.get("referrer-policy") !== "no-referrer" ||
    !(await proof.text()).includes("Continue to secure sign-in")) throw new Error("Signed-out proof page or auth privacy headers are not available");
const start = await fetch(`${origin}/auth/entra/start?next=%2Fauth%2Fentra%2Fproof`, {
  redirect: "manual", headers: { "X-Forwarded-Host": "evil.example" }, signal: AbortSignal.timeout(20_000),
});
const target = new URL(start.headers.get("location") ?? origin);
const tenant = process.env.ENTRA_TENANT_ID;
if (start.status !== 307 || target.hostname !== `${tenant}.ciamlogin.com` ||
    target.searchParams.get("redirect_uri") !== `${origin}/auth/entra/callback` ||
    target.searchParams.get("code_challenge_method") !== "S256" ||
    !target.searchParams.get("state") || !target.searchParams.get("nonce") ||
    !start.headers.get("set-cookie")?.includes("HttpOnly")) throw new Error("Live authorization start checks failed");
const cookie = start.headers.get("set-cookie").split(";")[0];
const forged = await fetch(`${origin}/auth/entra/callback?code=fake&state=wrong`, {
  redirect: "manual", headers: { Cookie: cookie }, signal: AbortSignal.timeout(20_000),
});
if (forged.status !== 307 || forged.headers.get("location") !== `${origin}/auth/entra/proof?error=auth`) throw new Error("Forged callback was not rejected");
const crossOrigin = await fetch(`${origin}/auth/entra/logout`, {
  method: "POST", redirect: "manual", headers: { Origin: "https://evil.example" }, signal: AbortSignal.timeout(20_000),
});
if (crossOrigin.status !== 403) throw new Error("Cross-origin sign-out was not rejected");
console.log("Live HTTP proof passed: signed-out page, dedicated Entra/PKCE redirect, HttpOnly transaction cookie, forwarded-host rejection, forged callback and logout CSRF rejection.");
console.log("Interactive provider login, Google and Android acceptance are still pending.");
