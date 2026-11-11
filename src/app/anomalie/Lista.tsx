import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { anomalia } from "@/db/schema";
import { auth, authSaltata } from "@/auth";
import { REGOLE } from "@/lib/regole/indice";
import { rimedioDi } from "@/lib/regole/rimedi";
import { dove } from "@/lib/regole/descrivi";
import { gidFogli } from "@/lib/scadenzario/google";
import Barra from "../Barra";
import { prendiInCarico, riconosci, risolvi } from "./azioni";
import "./anomalie.css";

const SEVERITA = ["bloccante", "alta", "media", "info"] as const;
const STATI = ["aperta", "in_carico", "riaperta", "riconosciuta", "risolta"] as const;
const ETICHETTA: Record<string, string> = { bloccante: "Bloccante", alta: "Alta", media: "Media", info: "Info", in_carico: "In carico", riconosciuta: "Riconosciuta", da_trattare: "Da trattare" };
const nome = (v: string) => ETICHETTA[v] ?? v.charAt(0).toUpperCase() + v.slice(1);
const REGOLA = new Map(REGOLE.map((r) => [r.codice, r]));

export type Filtri = { severita?: string; regola?: string; stato?: string; pm?: string; q?: string };
type Riga = typeof anomalia.$inferSelect;

const Segno = ({ v }: { v: string }) => <span className={`sev-segno sev-${v}`} aria-hidden="true" />;

// Una sola lista per due sezioni: Consuntivo (tutte le regole tranne D07) e Budget (solo D07, il promemoria del residuo da mettere a budget).
export default async function Lista({ searchParams, ambito }: { searchParams: Promise<Filtri>; ambito: "consuntivo" | "budget" }) {
  const f = await searchParams;
  const base = ambito === "budget" ? "/budget/da-mettere" : "/anomalie";
  const ambitoSql = ambito === "budget" ? sql`${anomalia.regola} = 'D07'` : sql`${anomalia.regola} <> 'D07'`;
  const regole = REGOLE.filter((r) => (ambito === "budget") === (r.codice === "D07"));
  const s = await auth();
  const puoAgire = ["admin", "editor"].includes(s?.user?.ruolo ?? "") || authSaltata();
  const db = getDb();
  // Per impostazione predefinita si vedono le anomalie da trattare: le risolte si cercano con il filtro di stato.
  const stato = f.stato ?? "da_trattare";
  const dovrei: SQL[] = [ambitoSql];
  if (stato === "da_trattare") dovrei.push(sql`${anomalia.stato} in ('aperta','in_carico','riaperta')`);
  else if (stato !== "tutte") dovrei.push(eq(anomalia.stato, stato));
  if (f.severita) dovrei.push(eq(anomalia.severita, f.severita));
  if (f.regola) dovrei.push(f.regola.length === 1 ? sql`${anomalia.regola} like ${f.regola + "%"}` : eq(anomalia.regola, f.regola));
  if (f.pm) dovrei.push(eq(anomalia.pm, f.pm));
  if (f.q) dovrei.push(or(ilike(anomalia.entitaChiave, `%${f.q}%`), ilike(anomalia.messaggio, `%${f.q}%`))!);

  const idFoglio = process.env.SCADENZARIO_SPREADSHEET_ID;
  const [righe, conteggi, pm, gid] = await Promise.all([
    db.select().from(anomalia).where(and(...dovrei)).orderBy(sql`case ${anomalia.severita} when 'bloccante' then 0 when 'alta' then 1 when 'media' then 2 else 3 end`, desc(anomalia.id)).limit(200),
    db.select({ severita: anomalia.severita, n: sql<number>`count(*)::int` }).from(anomalia).where(and(ambitoSql, sql`${anomalia.stato} in ('aperta','in_carico','riaperta')`)).groupBy(anomalia.severita),
    db.selectDistinct({ pm: anomalia.pm }).from(anomalia).where(ambitoSql).orderBy(anomalia.pm),
    idFoglio ? gidFogli(idFoglio).catch(() => null) : Promise.resolve(null),
  ]);
  const n = (sev: string) => conteggi.find((c) => c.severita === sev)?.n ?? 0;
  const href = (p: Partial<Filtri>) => `${base}?` + new URLSearchParams(Object.entries({ ...f, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  // Link che apre il foglio sulla riga dell'anomalia, già selezionata.
  const linkFoglio = (a: Riga) => idFoglio && gid && a.foglio && a.rigaFoglio && gid[a.foglio] !== undefined
    ? `https://docs.google.com/spreadsheets/d/${idFoglio}/edit#gid=${gid[a.foglio]}&range=${a.rigaFoglio}:${a.rigaFoglio}` : null;
  const vista = (v: string, et: string) => <a href={href({ stato: v })} aria-current={stato === v ? "true" : undefined}>{et}</a>;

  return (
    <>
      <Barra corrente={base} />
      <main className="pagina">
        <h1>{ambito === "budget" ? "Da mettere a budget" : "Anomalie"}</h1>
        <p className="sottotitolo">{ambito === "budget"
          ? "Progetti non chiusi con residuo da lavorare: valuta se vanno nel budget dell'anno prossimo. Quando hai deciso usa «Riconosci» con un motivo (messo a budget, escluso): la segnalazione si spegne e riparte con il budget successivo."
          : "Le anomalie da trattare, per gravità. La correzione si fa sul foglio: «Apri nel foglio» porta alla riga."}</p>

        <div className="conteggi" role="group" aria-label={ambito === "budget" ? "Segnalazioni da trattare per gravità" : "Anomalie da trattare per gravità"}>
          {SEVERITA.map((v) => (
            <div key={v}><span className="n">{n(v)}</span><span className="et"><Segno v={v} />{nome(v)}</span></div>
          ))}
        </div>

        <form method="get" className="filtri">
          <label>Severità
            <select name="severita" defaultValue={f.severita ?? ""} className="campo"><option value="">Tutte</option>
              {SEVERITA.map((v) => <option key={v} value={v}>{nome(v)}</option>)}</select></label>
          <label>Stato
            <select name="stato" defaultValue={stato} className="campo">
              {["da_trattare", ...STATI, "tutte"].map((v) => <option key={v} value={v}>{nome(v)}</option>)}</select></label>
          {ambito === "consuntivo" && (
            <label className="largo">Tipo di anomalia
              <select name="regola" defaultValue={f.regola ?? ""} className="campo"><option value="">Tutte</option>
                {["A", "B", "C", "D", "G", "H", "K"].map((g) => <option key={g} value={g}>Tutto il gruppo {g}</option>)}
                {regole.map((r) => <option key={r.codice} value={r.codice}>{r.nome} ({r.codice})</option>)}</select></label>
          )}
          <label>PM
            <select name="pm" defaultValue={f.pm ?? ""} className="campo"><option value="">Tutti</option>
              {pm.filter((x) => x.pm).map((x) => <option key={x.pm} value={x.pm!}>{x.pm}</option>)}</select></label>
          <label>{ambito === "budget" ? "Cerca progetto" : "Cerca contratto"}
            <input name="q" defaultValue={f.q ?? ""} className="campo" /></label>
          <div className="comandi">
            <button type="submit" className="btn primary">Filtra</button>
            <a href={base} className="btn">Azzera</a>
          </div>
        </form>

        <p className="viste">
          <span>{righe.length === 200 ? "Mostrate le prime 200 per gravità." : `${righe.length} anomalie.`}</span>
          {vista("da_trattare", "Da trattare")}{vista("riconosciuta", "Riconosciute")}{vista("risolta", "Risolte")}
        </p>

        {righe.length === 0 ? <p className="vuoto">Nessuna anomalia con questi filtri.</p> : (
          <table className="tab-anom">
            <thead><tr>{["Severità", "Anomalia e come risolverla", "Dove", "Stato", "Azioni"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{righe.map((a) => {
              const r = REGOLA.get(a.regola), d = dove(a), link = linkFoglio(a), rimedio = rimedioDi(a.regola);
              return (
                <tr key={a.id}>
                  <td data-label="Severità"><span className="sev"><Segno v={a.severita} />{nome(a.severita)}</span></td>
                  <td data-label="Anomalia" className="corpo">
                    <span className="titolo" title={r?.descrizione}>{r?.nome ?? a.regola}</span> <span className="muto">({a.regola})</span>
                    <div>{a.messaggio}</div>
                    {rimedio && <div className="rimedio"><b>Come risolvere: </b>{rimedio}</div>}
                  </td>
                  <td data-label="Dove">
                    <div className="titolo">{d.principale}</div>
                    {d.dettaglio && <div className="muto">{d.dettaglio}</div>}
                    {a.pm && <div className="muto">PM {a.pm}</div>}
                    {link
                      ? <a href={link} target="_blank" rel="noopener noreferrer" className="btn">Apri nel foglio ↗{a.rigaFoglio ? ` (riga ${a.rigaFoglio})` : ""}</a>
                      : <div className="muto">{a.foglio ?? ""}{a.rigaFoglio ? `, riga ${a.rigaFoglio}` : ""}</div>}
                  </td>
                  <td data-label="Stato">{nome(a.stato)}{a.assegnataA ? <div className="muto">{a.assegnataA}</div> : null}</td>
                  <td data-label="Azioni">
                    {puoAgire && !["risolta", "riconosciuta"].includes(a.stato) ? (
                      <div className="azioni">
                        {a.stato !== "in_carico" && <form action={prendiInCarico}><input type="hidden" name="id" value={a.id} /><button className="btn" type="submit">Prendi in carico</button></form>}
                        <details><summary className="btn">Risolvi</summary>
                          <div className="modulo"><form action={risolvi}><input type="hidden" name="id" value={a.id} />
                            <input name="nota" required placeholder="Nota di risoluzione" aria-label="Nota di risoluzione" className="campo" /><button className="btn primary" type="submit">Conferma</button></form></div></details>
                        <details><summary className="btn">Riconosci</summary>
                          <div className="modulo"><form action={riconosci}><input type="hidden" name="id" value={a.id} />
                            <input name="motivo" required placeholder="Motivo" aria-label="Motivo" className="campo" />
                            <label>Valida fino al <input type="date" name="fino" className="campo" /></label>
                            <button className="btn primary" type="submit">Conferma</button></form></div></details>
                      </div>
                    ) : <span className="muto">—</span>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </main>
    </>
  );
}
