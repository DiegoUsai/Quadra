import { createSign } from "node:crypto";
import type { Cella } from "./valori";

// Lettura in sola lettura di Drive e Sheets con il service account (specifiche 4.1, 6.1). Nessuna dipendenza esterna:
// firma JWT con node:crypto. Il token vale un'ora e si riusa finché non scade.
type Account = { client_email: string; private_key: string; token_uri: string };
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly";
let cache: { token: string; scade: number } | null = null;

const b64 = (x: string) => Buffer.from(x).toString("base64url");

async function token(): Promise<string> {
  if (cache && cache.scade > Date.now() + 60_000) return cache.token;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON non impostata");
  const sa = JSON.parse(raw) as Account;
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat: now, exp: now + 3600 }));
  const firma = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key, "base64url");
  const r = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${firma}` }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!j.access_token) throw new Error("token Google non ottenuto: " + (j.error ?? r.status));
  cache = { token: j.access_token, scade: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cache.token;
}

// Backoff esponenziale su 429 e 5xx (specifiche 6.1 punto 3).
async function get<T>(url: string, tentativi = 5): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { authorization: "Bearer " + (await token()) } });
    if (r.ok) return (await r.json()) as T;
    if ((r.status === 429 || r.status >= 500) && i < tentativi) {
      await new Promise((ok) => setTimeout(ok, Math.min(30_000, 500 * 2 ** i) + Math.random() * 250));
      continue;
    }
    throw new Error(`Google API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

export type MetaDrive = { name: string; modifiedTime: string; version: string; lastModifyingUser?: { displayName?: string } };

export const metaFile = (id: string) =>
  get<MetaDrive>(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,modifiedTime,version,lastModifyingUser(displayName)&supportsAllDrives=true`);

// Una sola richiesta per tutti i fogli. Importi come numeri, date come testo gg/mm/aaaa.
export async function leggiFogli(id: string, fogli: string[]): Promise<Record<string, Cella[][]>> {
  const q = fogli.map((f) => "ranges=" + encodeURIComponent(f)).join("&");
  const j = await get<{ valueRanges: { range: string; values?: Cella[][] }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  return Object.fromEntries(fogli.map((f, i) => [f, j.valueRanges[i]?.values ?? []]));
}
