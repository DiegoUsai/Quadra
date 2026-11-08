import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleNotifier } from "@/lib/notifier/console";
import { TeamsNotifier } from "@/lib/notifier/teams";
import { creaNotifier } from "@/lib/notifier";
import { esc, messaggioErrore, messaggioNuove, messaggioRiepilogo, messaggioRisoluzione, type AnomaliaNotifica, type Contesto } from "@/lib/notifier/messaggi";

const ctx: Contesto = {
  baseUrl: "https://quadra.example.com",
  linkFoglio: (a) => (a.rigaFoglio ? `https://docs.example.com/foglio#range=${a.rigaFoglio}:${a.rigaFoglio}` : null),
  slackIdDi: (pm) => (pm === "Anna" ? "U123" : null),
};
const an = (id: number, d: Partial<AnomaliaNotifica> = {}): AnomaliaNotifica => ({
  id, regola: "A01", nomeRegola: "Data inizio mancante", severita: "alta", entitaTipo: "contratto", entitaChiave: `CTR_${id}`, foglio: "Contratti Attivi",
  periodoAnno: null, periodoMese: null, valoriJson: {}, rigaFoglio: 10 + id, pm: "Anna", ...d,
});
const testi = (m: { blocchi?: unknown[] }) => JSON.stringify(m.blocchi);

describe("messaggi: contenuto e riservatezza", () => {
  it("un solo messaggio per controllo, con conteggi, link alla riga, menzione del PM e bottone", () => {
    const m = messaggioNuove("C1", [an(1, { severita: "bloccante" }), an(2, { pm: "Bruno" })], ctx);
    expect(m.testo).toBe("2 nuove anomalie da trattare: 1 bloccante · 1 alta");
    const t = testi(m);
    expect(t).toContain("<@U123>");           // PM con utente Slack: menzionato
    expect(t).toContain("PM Bruno");           // PM senza utente Slack: nome in chiaro
    expect(t).toContain("#range=12:12");       // link alla riga
    expect(t).toContain("https://quadra.example.com/anomalie");
    expect(t.indexOf("CTR_1")).toBeLessThan(t.indexOf("CTR_2")); // bloccanti per prime
  });
  it("non riporta importi: solo scostamenti in percentuale", () => {
    const m = messaggioNuove("C1", [an(1, { regola: "C01", nomeRegola: "Canone fuori dal valore tipico", periodoAnno: 2026, periodoMese: 2, valoriJson: { importo: 81800, tipico: 25000, eccedenza: 56800 } })], ctx);
    const t = testi(m);
    expect(t).toContain("+227% sul canone tipico");
    for (const vietato of ["81800", "81.800", "25000", "56800"]) expect(t).not.toContain(vietato);
  });
  it("elenca al massimo 8 anomalie e indica quante mancano", () => {
    const m = messaggioNuove("C1", Array.from({ length: 12 }, (_, i) => an(i + 1)), ctx);
    expect(testi(m)).toContain("…e altre 4.");
    expect((testi(m).match(/Data inizio mancante/g) ?? []).length).toBe(8);
  });
  it("protegge i caratteri speciali di Slack nei valori dello scadenzario", () => {
    expect(esc("A&B <script> x>y")).toBe("A&amp;B &lt;script&gt; x&gt;y");
    expect(testi(messaggioNuove("C1", [an(1, { entitaChiave: "X<@U999>" })], ctx))).not.toContain("<@U999>");
  });
  it("la risoluzione risponde nello stesso thread", () => {
    const m = messaggioRisoluzione("C1", "1700000000.000100", [an(1), an(2)]);
    expect(m.thread).toBe("1700000000.000100");
    expect(m.testo).toContain("Risolte 2");
  });
  it("riepilogo con nuove, risolte, aperte e aperte da più di 7 giorni; errore con link allo storico", () => {
    const r = messaggioRiepilogo("C1", { nuove: [an(1)], risolte: 3, vecchie: [an(2)], aperte: [an(1), an(2)] }, ctx);
    expect(r.testo).toBe("Riepilogo giornaliero delle anomalie: 1 nuove, 3 risolte, 2 da trattare");
    expect(testi(r)).toContain("Aperte da più di 7 giorni");
    expect(testi(messaggioErrore("C1", "Controllo non eseguito", "boom", "https://q"))).toContain("https://q/storico");
  });
});

// La coda di invio è uno stato del modulo: ogni test riparte da un modulo nuovo.
const slack = async (token: string) => { vi.resetModules(); const m = await import("@/lib/notifier/slack"); return new m.SlackNotifier(token); };

describe("SlackNotifier: coda e limite di velocità", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const risposta = (corpo: object, status = 200, header: Record<string, string> = {}) => new Response(JSON.stringify(corpo), { status, headers: header });

  it("invia con il token e restituisce il riferimento del messaggio", async () => {
    const f = vi.fn().mockResolvedValue(risposta({ ok: true, ts: "1.1", channel: "C1" }));
    vi.stubGlobal("fetch", f);
    const p = (await slack("token-finto")).invia({ canale: "C1", testo: "ciao", thread: "0.9" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toEqual({ ok: true, canale: "C1", ts: "1.1" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(init.headers.authorization).toBe("Bearer token-finto");
    expect(JSON.parse(init.body)).toMatchObject({ channel: "C1", text: "ciao", thread_ts: "0.9" });
  });
  it("su 429 aspetta Retry-After e riprova", async () => {
    const f = vi.fn().mockResolvedValueOnce(risposta({ ok: false }, 429, { "retry-after": "3" })).mockResolvedValueOnce(risposta({ ok: true, ts: "2.2", channel: "C1" }));
    vi.stubGlobal("fetch", f);
    const p = (await slack("t")).invia({ canale: "C1", testo: "x" });
    await vi.advanceTimersByTimeAsync(1500);
    expect(f).toHaveBeenCalledTimes(1);          // ancora in attesa del Retry-After
    await vi.advanceTimersByTimeAsync(3500);
    expect((await p).ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("due messaggi ravvicinati vengono distanziati di oltre un secondo", async () => {
    const quando: number[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => { quando.push(Date.now()); return risposta({ ok: true, ts: "3.3", channel: "C1" }); }));
    const n = await slack("t");
    const a = n.invia({ canale: "C1", testo: "1" }), b = n.invia({ canale: "C1", testo: "2" });
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([a, b]);
    expect(quando[1] - quando[0]).toBeGreaterThanOrEqual(1000);
  });
  it("un errore di Slack o di rete non solleva eccezioni e non blocca i messaggi successivi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(risposta({ ok: false, error: "channel_not_found" })).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(risposta({ ok: true, ts: "4.4", channel: "C1" })));
    const n = await slack("t");
    const r = [n.invia({ canale: "X", testo: "1" }), n.invia({ canale: "C1", testo: "2" }), n.invia({ canale: "C1", testo: "3" })];
    await vi.advanceTimersByTimeAsync(10000);
    const [a, b, c] = await Promise.all(r);
    expect(a).toEqual({ ok: false, errore: "slack: channel_not_found" });
    expect(b.ok === false && b.errore).toContain("offline");
    expect(c.ok).toBe(true);
  });
});

describe("scelta del provider", () => {
  afterEach(() => { delete process.env.NOTIFIER; delete process.env.SLACK_BOT_TOKEN; });
  it("senza token si usa la console, con token Slack, Teams solo se richiesto", async () => {
    expect(creaNotifier().nome).toBe("console");
    process.env.SLACK_BOT_TOKEN = "token-finto";
    expect(creaNotifier().nome).toBe("slack");
    process.env.NOTIFIER = "teams";
    expect(creaNotifier().nome).toBe("teams");
    expect(await new TeamsNotifier().invia({ canale: "x", testo: "y" })).toMatchObject({ ok: false });
  });
  it("la console registra i messaggi e restituisce un riferimento", async () => {
    const c = new ConsoleNotifier(), log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const e = await c.invia({ canale: "C", testo: "ciao" });
    log.mockRestore();
    expect(e.ok).toBe(true);
    expect(c.inviati).toHaveLength(1);
  });
});

describe("più PM nella stessa cella", () => {
  it("«Anna/Bruno» menziona Anna e scrive Bruno in chiaro", () => {
    expect(testi(messaggioNuove("C1", [an(1, { pm: "Anna/Bruno" })], ctx))).toContain("PM <@U123> e Bruno");
  });
});
