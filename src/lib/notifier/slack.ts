import type { Esito, Messaggio, Notifier } from "./tipi";

// Slack accetta circa un messaggio al secondo per canale: i messaggi si accodano e si distanziano; su 429 si attende
// l'intestazione Retry-After e si riprova (specifiche 10.2). Nessuna dipendenza esterna: una chiamata a chat.postMessage.
const PAUSA_MS = 1100;
let coda: Promise<unknown> = Promise.resolve();
let ultimoInvio = 0;
const dormi = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function inCoda<T>(fn: () => Promise<T>): Promise<T> {
  const p = coda.then(async () => {
    await dormi(Math.max(0, ultimoInvio + PAUSA_MS - Date.now()));
    try { return await fn(); } finally { ultimoInvio = Date.now(); }
  });
  coda = p.catch(() => undefined); // un errore non blocca i messaggi successivi
  return p;
}

export class SlackNotifier implements Notifier {
  readonly nome = "slack";
  constructor(private token: string, private tentativi = 4) {}

  invia(m: Messaggio): Promise<Esito> {
    return inCoda(async () => {
      for (let i = 0; ; i++) {
        let r: Response;
        try {
          r = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({ channel: m.canale, text: m.testo, blocks: m.blocchi, thread_ts: m.thread, unfurl_links: false, unfurl_media: false }),
          });
        } catch (e) { return { ok: false, errore: "rete: " + (e instanceof Error ? e.message : String(e)) } as Esito; }
        if (r.status === 429 && i < this.tentativi) {
          await dormi((Number(r.headers.get("retry-after")) || 2) * 1000 + 250);
          continue;
        }
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ts?: string; channel?: string; error?: string };
        return j.ok && j.ts ? { ok: true, canale: j.channel ?? m.canale, ts: j.ts } : { ok: false, errore: `slack: ${j.error ?? r.status}` };
      }
    });
  }
}
