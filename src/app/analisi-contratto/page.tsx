import { and, eq, inArray, sql } from "drizzle-orm";
import Form from "next/form";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { cgdProgetto, rigaCorrente } from "@/db/schema";
import { analizza, datiScadenzario, unisciMensili, type Blocco } from "@/lib/cgd/analisi";
import { confronta, eur } from "@/lib/cgd/confronto";
import { creaCgdSource } from "@/lib/cgd";
import type { Dati } from "@/lib/regole/tipi";
import Barra from "../Barra";
import "../anomalie/anomalie.css";

export const dynamic = "force-dynamic";
const cella: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13, verticalAlign: "top" };
const num: React.CSSProperties = { ...cella, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const muto: React.CSSProperties = { color: "var(--color-fg-muted)" };
const squadra: React.CSSProperties = { fontWeight: 700, background: "var(--color-panel)" };
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const segno = (n: number | null) => { if (n === null) return "—"; const r = Math.round(n); return `${r > 0 ? "+" : r < 0 ? "−" : ""}${eur(Math.abs(r))}`; }; // il segno segue la cifra mostrata: -0,3 € è "0 €"
const data = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

function Tabella({ titolo, nota, blocco, extra }: { titolo: string; nota: string; blocco: Blocco; extra?: { titolo: string; valori: (string | number | null)[] } }) {
  return (
    <section style={{ margin: "24px 0" }}>
      <h2 style={{ fontSize: 18, margin: "0 0 2px" }}>{titolo}</h2>
      <p style={{ ...muto, margin: "0 0 8px" }}>{nota}</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>{["Mese", "Scadenzario", "HUB", "Differenza", ...(extra ? [extra.titolo] : []), "Esito"].map((h, i) => <th key={h} scope="col" style={i === 0 || h === "Esito" ? cella : num}>{h}</th>)}</tr></thead>
          <tbody>
            {blocco.mesi.map((m, i) => {
              const evidenzia = m.esito !== "ok" && m.esito !== "nessun dato HUB";
              return (
                <tr key={m.mese} style={evidenzia ? squadra : undefined}>
                  <td style={cella}>{MESI[i]}</td><td style={num}>{eur(m.scadenzario)}</td><td style={num}>{eur(m.hub)}</td><td style={num}>{segno(m.differenza)}</td>
                  {extra && <td style={num}>{extra.valori[i] ?? "—"}</td>}
                  <td style={cella}>{m.esito === "ok" ? <span style={muto}>ok</span> : m.esito}</td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700 }}>
              <td style={cella}>Totale anno</td><td style={num}>{eur(blocco.totScadenzario)}</td><td style={num}>{eur(blocco.totHub)}</td><td style={num}>{segno(blocco.totDifferenza)}</td>
              {extra && <td style={num} />}<td style={cella}>{blocco.squadrati ? `${blocco.squadrati} ${blocco.squadrati === 1 ? "mese" : "mesi"} da verificare${blocco.totDifferenza !== null && Math.abs(blocco.totDifferenza) <= 1 ? ": il totale dell'anno coincide, cambia solo il mese di competenza" : ""}` : <span style={muto}>ok</span>}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AnalisiContratto({ searchParams }: { searchParams: Promise<{ ctr?: string; anno?: string }> }) {
  const q = await searchParams;
  const sess = await auth();
  const ruolo = sess?.user?.ruolo ?? (authSaltata() ? "admin" : null);
  if (ruolo !== "admin" && ruolo !== "editor")
    return (<><Barra corrente="/analisi-contratto" /><main className="pagina"><h1>Analisi contratto</h1><p style={muto}>Questa pagina legge l&apos;HUB con il token dell&apos;amministratore: è riservata a Editor e Admin.</p></main></>);

  const oggi = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const annoCorrente = oggi.getFullYear();
  const anno = /^\d{4}$/.test(q.anno ?? "") && +q.anno! >= 2023 && +q.anno! <= annoCorrente + 1 ? +q.anno! : annoCorrente;
  const db = getDb();
  const [righeDb, progettiDb] = await Promise.all([db.select().from(rigaCorrente).where(eq(rigaCorrente.foglio, "Contratti Attivi")), db.select().from(cgdProgetto)]);
  const contratti = righeDb.map((r) => ({ chiave: r.chiave, rigaFoglio: r.rigaFoglio, d: r.dati as Dati }));
  const progetti = progettiDb.map((p) => ({ id: p.id, nome: p.nome, ctr: p.ctr, importo: p.importo === null ? null : Number(p.importo), inizio: p.inizio, fine: p.fine, bloccato: p.bloccato }));
  const agganciati = confronta(contratti, progetti).righe.filter((r) => r.hub);
  const scelto = agganciati.find((r) => r.ctr === q.ctr);

  let errore: string | null = null, risultato: { analisi: ReturnType<typeof analizza>; scad: ReturnType<typeof datiScadenzario>; hub: ReturnType<typeof unisciMensili> } | null = null;
  if (scelto) {
    try {
      const source = creaCgdSource();
      const [mensili, mov] = await Promise.all([
        Promise.all(scelto.hub!.ids.map((id) => source.analisiProgetto(id, anno))),
        db.select().from(rigaCorrente).where(and(eq(rigaCorrente.foglio, "Costi/Ricavi"), inArray(sql`${rigaCorrente.dati}->>'id_contratto'`, scelto.contratti))),
      ]);
      const scad = datiScadenzario(mov.map((r) => ({ chiave: r.chiave, rigaFoglio: r.rigaFoglio, d: r.dati as Dati })), scelto.contratti, anno);
      const hub = unisciMensili(mensili);
      risultato = { analisi: analizza(scad, hub), scad, hub };
    } catch (e) {
      errore = (e instanceof Error ? e.message : String(e)).slice(0, 200); // il messaggio non contiene importi (vedi getHub)
    }
  }

  return (
    <>
      <Barra corrente="/analisi-contratto" />
      <main className="pagina">
        <h1>Analisi contratto</h1>
        <p className="sottotitolo">Costi e ricavi di un contratto, mese per mese: scadenzario (foglio Costi/Ricavi) contro HUB. Le squadrature sono evidenziate. I dati dell&apos;HUB si leggono al momento (qualche secondo).</p>

        {!progetti.length ? <p>Nessun progetto dell&apos;HUB letto: apri <a href="/quadratura">Quadratura HUB</a> e premi «Aggiorna dall&apos;HUB ora».</p> : (
          <Form action="/analisi-contratto" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "0 0 8px" }}>
            <label style={{ flex: "1 1 22rem" }}>Contratto<br />
              <select name="ctr" defaultValue={scelto?.ctr ?? ""} className="campo" style={{ width: "100%" }} required>
                <option value="">Scegli un contratto…</option>
                {agganciati.map((r) => <option key={r.ctr} value={r.ctr}>CTR{r.ctr} · {r.contratti.join(", ")} · {r.hub!.nome}</option>)}
              </select></label>
            <label>Anno<br />
              <select name="anno" defaultValue={String(anno)} className="campo">
                {Array.from({ length: annoCorrente - 2023 + 2 }, (_, i) => annoCorrente + 1 - i).map((a) => <option key={a} value={a}>{a}</option>)}
              </select></label>
            <button type="submit" className="btn primary">Analizza</button>
          </Form>
        )}
        <p style={{ ...muto, margin: "0 0 16px" }}>Sono selezionabili i contratti agganciati all&apos;HUB sul codice CTR ({agganciati.length}); gli altri non hanno un progetto visibile sull&apos;HUB.</p>

        {q.ctr && !scelto && progetti.length > 0 && <p role="alert" style={{ fontWeight: 600 }}>Contratto non trovato tra quelli agganciati all&apos;HUB.</p>}
        {errore && <p role="alert" style={{ color: "var(--color-danger, #b3261e)", fontWeight: 600 }}>Lettura dell&apos;HUB non riuscita: {errore}</p>}

        {scelto && risultato && (<>
          <h2 style={{ fontSize: 20, margin: "8px 0 2px" }}>CTR{scelto.ctr} · {scelto.contratti.join(", ")} · {anno}</h2>
          <p style={{ ...muto, margin: "0 0 12px" }}>
            Progetto HUB: {scelto.hub!.nome}. Contratto: importo {eur(scelto.importo)} sullo scadenzario, {eur(scelto.hub!.importo)} sull&apos;HUB; dal {data(scelto.inizio)} al {data(scelto.fine)} (HUB: {data(scelto.hub!.inizio)} - {data(scelto.hub!.fine)}).
            {(scelto.diff.importo || scelto.diff.inizio || scelto.diff.fine) && <strong> Il contratto ha differenze anche nei dati generali: vedi Quadratura HUB.</strong>}
          </p>

          <div className="conteggi" role="group" aria-label="Sintesi delle squadrature">
            <div><span className="n">{risultato.analisi.mesiSquadrati}</span><span className="et">mesi da verificare su 12</span></div>
            <div><span className="n">{segno(risultato.analisi.ricavi.totDifferenza)}</span><span className="et">ricavi, anno</span></div>
            <div><span className="n">{segno(risultato.analisi.personale.totDifferenza)}</span><span className="et">personale, anno</span></div>
            <div><span className="n">{segno(risultato.analisi.altriCosti.totDifferenza)}</span><span className="et">altri costi, anno</span></div>
          </div>

          <Tabella titolo="Ricavi" nota="Scadenzario: righe Ricavo di Costi/Ricavi. HUB: «lic» del controllo di gestione (il lavorato, non il fatturato). Differenza = scadenzario meno HUB." blocco={risultato.analisi.ricavi}
            extra={{ titolo: "Mese sull'HUB", valori: risultato.hub.statoMese.map((x) => (x ? x.toLowerCase() : null)) }} />
          <Tabella titolo="Costi del personale" nota="Scadenzario: righe di costo «Costi del personale» (con segno positivo). HUB: reporting delle ore per costo orario. Differenza = scadenzario meno HUB." blocco={risultato.analisi.personale}
            extra={{ titolo: "Ore HUB", valori: risultato.hub.personale ? risultato.hub.personale.ore.map((o) => Math.round(o * 10) / 10) : [] }} />
          <Tabella titolo="Altri costi" nota="Scadenzario: le altre righe di costo (con segno positivo). HUB: costi aggiuntivi del progetto (importo per quantità, per mese della data). Differenza = scadenzario meno HUB." blocco={risultato.analisi.altriCosti} />

          <details style={{ margin: "16px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Righe dello scadenzario ({risultato.scad.righe.length})</summary>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
                <thead><tr>{["Mese", "Tipo", "Voce", "Servizio", "Cliente / fornitore", "Id Contratto", "Importo", "Definitivo", "Riga"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
                <tbody>{risultato.scad.righe.map((r, i) => (
                  <tr key={i}><td style={cella}>{r.mese}</td><td style={cella}>{r.tipo}</td><td style={cella}>{r.specVoce}</td><td style={cella}>{r.tipoServizio}</td><td style={cella}>{r.controparte}</td><td style={cella}>{r.idContratto}</td><td style={num}>{eur(r.importo)}</td><td style={cella}>{r.definitivo}</td><td style={cella}>{r.rigaFoglio ?? ""}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>
          <details style={{ margin: "16px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Costi aggiuntivi dell&apos;HUB ({risultato.hub.righeAltriCosti.length})</summary>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
                <thead><tr>{["Data", "Tipo", "Descrizione", "Importo"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
                <tbody>{risultato.hub.righeAltriCosti.map((r, i) => <tr key={i}><td style={cella}>{data(r.data)}</td><td style={cella}>{r.tipo ?? "—"}</td><td style={cella}>{r.descrizione}</td><td style={num}>{eur(r.importo)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </>)}
      </main>
    </>
  );
}
