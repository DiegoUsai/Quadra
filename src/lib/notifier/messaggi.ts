import { dove, scostamento, type AnomaliaDescrivibile } from "@/lib/regole/descrivi";
import type { Messaggio } from "./tipi";

// Costruzione dei messaggi Slack in Block Kit (specifiche 10.3). Funzioni pure.
// Riservatezza: i messaggi riportano id, mese e scostamenti in percentuale, MAI importi: i dettagli si leggono in Quadra.
export type AnomaliaNotifica = AnomaliaDescrivibile & {
  id: number; nomeRegola: string; severita: string; rigaFoglio: number | null; pm: string | null; creataIl?: Date;
};
export type Contesto = {
  baseUrl: string;
  linkFoglio: (a: AnomaliaNotifica) => string | null;
  slackIdDi: (pm: string) => string | null;
};

const MAX_ELENCO = 8;
const SEV_ORDINE = ["bloccante", "alta", "media", "info"];
const SEV_ETICHETTA: Record<string, [string, string]> = { bloccante: ["bloccante", "bloccanti"], alta: ["alta", "alte"], media: ["media", "medie"], info: ["info", "info"] };

// Slack interpreta &, < e > nel testo: i valori dello scadenzario vanno protetti.
export const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function conteggi(righe: { severita: string }[]): string {
  return SEV_ORDINE.map((s) => [s, righe.filter((r) => r.severita === s).length] as const).filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${SEV_ETICHETTA[s][n === 1 ? 0 : 1]}`).join(" · ");
}
const ordina = <T extends { severita: string; id: number }>(l: T[]) => [...l].sort((a, b) => SEV_ORDINE.indexOf(a.severita) - SEV_ORDINE.indexOf(b.severita) || a.id - b.id);

function riga(a: AnomaliaNotifica, c: Contesto): string {
  const d = dove(a), sc = scostamento(a), link = c.linkFoglio(a);
  // La colonna PM può contenere più persone ("Vale/Giulia"): si menzionano tutte, ciascuna se ha un utente Slack.
  const pm = a.pm ? a.pm.split("/").map((p) => p.trim()).filter(Boolean).map((p) => (c.slackIdDi(p) ? `<@${c.slackIdDi(p)}>` : esc(p))).join(" e ") : null;
  const tag = a.severita === "bloccante" ? ":no_entry: " : a.severita === "alta" ? ":warning: " : "";
  return `${tag}*${esc(a.nomeRegola)}* (${a.regola}) · ${esc(d.principale)}${d.dettaglio ? " · " + esc(d.dettaglio) : ""}${sc ? " · " + sc : ""}`
    + (link || pm ? `\n${link ? `<${link}|Apri la riga${a.rigaFoglio ? " " + a.rigaFoglio : ""} nel foglio>` : ""}${link && pm ? " · " : ""}${pm ? "PM " + pm : ""}` : "");
}
const bottone = (testo: string, url: string) => ({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: testo }, url, action_id: "apri_quadra" }] });
const sezione = (testo: string) => ({ type: "section", text: { type: "mrkdwn", text: testo } });
const intestazione = (testo: string) => ({ type: "header", text: { type: "plain_text", text: testo.slice(0, 150) } });

// Un messaggio per controllo, non uno per anomalia (specifiche 10.2).
export function messaggioNuove(canale: string, nuove: AnomaliaNotifica[], c: Contesto): Messaggio {
  const ord = ordina(nuove), titolo = `${nuove.length} ${nuove.length === 1 ? "nuova anomalia" : "nuove anomalie"} da trattare`;
  const blocchi: unknown[] = [intestazione(titolo), sezione(conteggi(nuove))];
  for (const a of ord.slice(0, MAX_ELENCO)) blocchi.push(sezione(riga(a, c)));
  if (ord.length > MAX_ELENCO) blocchi.push(sezione(`…e altre ${ord.length - MAX_ELENCO}.`));
  blocchi.push(bottone("Apri in Quadra", `${c.baseUrl}/anomalie?stato=da_trattare`));
  return { canale, testo: `${titolo}: ${conteggi(nuove)}`, blocchi };
}

export function messaggioRisoluzione(canale: string, thread: string, risolte: AnomaliaNotifica[]): Messaggio {
  const righe = ordina(risolte).slice(0, 10).map((a) => `• ${esc(a.nomeRegola)} (${a.regola}) · ${esc(dove(a).principale)}`).join("\n");
  const testo = `:white_check_mark: ${risolte.length === 1 ? "Risolta" : `Risolte ${risolte.length}`} dopo l'ultimo controllo:\n${righe}${risolte.length > 10 ? `\n…e altre ${risolte.length - 10}.` : ""}`;
  return { canale, thread, testo, blocchi: [sezione(testo)] };
}

export type DatiRiepilogo = { nuove: AnomaliaNotifica[]; risolte: number; vecchie: AnomaliaNotifica[]; aperte: AnomaliaNotifica[] };
export function messaggioRiepilogo(canale: string, d: DatiRiepilogo, c: Contesto): Messaggio {
  const titolo = "Riepilogo giornaliero delle anomalie";
  const blocchi: unknown[] = [intestazione(titolo),
    sezione(`*Nuove dall'ultimo riepilogo:* ${d.nuove.length ? conteggi(d.nuove) : "nessuna"}\n*Risolte:* ${d.risolte}\n*Ancora da trattare:* ${d.aperte.length ? conteggi(d.aperte) : "nessuna"}`)];
  if (d.vecchie.length) {
    blocchi.push(sezione(`*Aperte da più di 7 giorni:* ${d.vecchie.length}`));
    for (const a of ordina(d.vecchie).slice(0, MAX_ELENCO)) blocchi.push(sezione(riga(a, c)));
    if (d.vecchie.length > MAX_ELENCO) blocchi.push(sezione(`…e altre ${d.vecchie.length - MAX_ELENCO}.`));
  }
  blocchi.push(bottone("Apri in Quadra", `${c.baseUrl}/anomalie`));
  return { canale, testo: `${titolo}: ${d.nuove.length} nuove, ${d.risolte} risolte, ${d.aperte.length} da trattare`, blocchi };
}

export function messaggioErrore(canale: string, titolo: string, dettaglio: string, baseUrl: string): Messaggio {
  const testo = `:rotating_light: ${titolo}\n${esc(dettaglio).slice(0, 600)}`;
  return { canale, testo, blocchi: [sezione(testo), bottone("Apri import e storico", `${baseUrl}/storico`)] };
}
