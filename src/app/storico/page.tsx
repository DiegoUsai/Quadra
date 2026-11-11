import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { modificaCella, runControllo, snapshotScadenzario, variazione } from "@/db/schema";
import Barra from "../Barra";

export const dynamic = "force-dynamic";

// Righe del foglio coperte da una cella o un intervallo A1 ("F6", "A6496:Y6496").
function righeDi(cella: string): [number, number] {
  const n = [...cella.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  return [n[0] ?? 0, n[n.length - 1] ?? 0];
}
const mostra = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const ora = (d: Date | null) => (d ? d.toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "—");
const num = (n: number) => n.toLocaleString("it-IT");
// Giorno (ora di Roma) di una colonna timestamp, per confrontarlo con le date dei filtri.
const giorno = (col: unknown) => sql`(${col} at time zone 'Europe/Rome')::date`;

type P = { vista?: string; dal?: string; al?: string; foglio?: string; tipo?: string; q?: string; esito?: string; origine?: string; ord?: string; dir?: string; pag?: string; dim?: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DIMENSIONI = [25, 50, 100, 200, 500];

const COL_DIFF = { data: snapshotScadenzario.lettoIl, foglio: variazione.foglio, voce: variazione.chiave, tipo: variazione.tipo } as const;
const COL_RUN = { data: runControllo.avviatoIl, origine: runControllo.origine, esito: runControllo.esito, variazioni: runControllo.nVariazioni } as const;

export default async function Storico({ searchParams }: { searchParams: Promise<P> }) {
  const f = await searchParams;
  const vista = f.vista === "controlli" ? "controlli" : "differenze";
  const dal = f.dal && ISO.test(f.dal) ? f.dal : undefined, al = f.al && ISO.test(f.al) ? f.al : undefined;
  const q = f.q?.trim() || undefined;
  const dim = DIMENSIONI.includes(Number(f.dim)) ? Number(f.dim) : 100;
  const db = getDb();

  // Ordinamento: colonna e verso dai parametri; di default la data, dal più recente.
  const colonne = vista === "controlli" ? COL_RUN : COL_DIFF;
  const ord = (f.ord && f.ord in colonne ? f.ord : "data") as keyof typeof colonne;
  const dir = f.dir === "asc" || f.dir === "desc" ? f.dir : ord === "data" || ord === "variazioni" ? "desc" : "asc";
  const verso = dir === "asc" ? asc : desc;

  // Link che conserva tutti i filtri e cambia solo ciò che si chiede (cambiare filtro riporta a pagina 1).
  const link = (o: Partial<P>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...o, ...("pag" in o ? {} : { pag: undefined }) })) if (v) p.set(k, v);
    return `/storico?${p}`;
  };

  let righe: React.ReactNode, totale: number, tutte: number, intestazioni: [string, string | null][];
  if (vista === "controlli") {
    const cond = and(
      dal ? sql`${giorno(runControllo.avviatoIl)} >= ${dal}::date` : undefined, al ? sql`${giorno(runControllo.avviatoIl)} <= ${al}::date` : undefined,
      f.esito ? eq(runControllo.esito, f.esito) : undefined, f.origine ? eq(runControllo.origine, f.origine) : undefined,
    );
    const [[{ n }], [{ n: t }]] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(runControllo).where(cond), db.select({ n: sql<number>`count(*)::int` }).from(runControllo),
    ]);
    totale = n; tutte = t;
    const pagina = Math.min(Math.max(Number(f.pag) || 1, 1), Math.max(Math.ceil(n / dim), 1));
    const rs = await db.select().from(runControllo).where(cond).orderBy(verso(colonne[ord]), desc(runControllo.id)).limit(dim).offset((pagina - 1) * dim);
    intestazioni = [["Avviato", "data"], ["Origine", "origine"], ["Esito", "esito"], ["Variazioni", "variazioni"], ["Errore", null]];
    righe = rs.map((r) => (
      <tr key={r.id}><td>{ora(r.avviatoIl)}</td><td>{r.origine}</td><td>{r.esito}</td><td>{r.nVariazioni ?? 0}</td><td>{r.errore ?? ""}</td></tr>
    ));
  } else {
    const cond = and(
      dal ? sql`${giorno(snapshotScadenzario.lettoIl)} >= ${dal}::date` : undefined, al ? sql`${giorno(snapshotScadenzario.lettoIl)} <= ${al}::date` : undefined,
      f.foglio ? eq(variazione.foglio, f.foglio) : undefined, f.tipo ? eq(variazione.tipo, f.tipo) : undefined,
      q ? or(ilike(variazione.chiave, `%${q}%`), sql`${variazione.campi}::text ilike ${"%" + q + "%"}`) : undefined,
    );
    const dalla = () => db.select({ n: sql<number>`count(*)::int` }).from(variazione).innerJoin(snapshotScadenzario, eq(variazione.snapshotId, snapshotScadenzario.id));
    const [[{ n }], [{ n: t }]] = await Promise.all([dalla().where(cond), dalla()]);
    totale = n; tutte = t;
    const pagina = Math.min(Math.max(Number(f.pag) || 1, 1), Math.max(Math.ceil(n / dim), 1));
    const vs = await db.select({ v: variazione, lettoIl: snapshotScadenzario.lettoIl }).from(variazione).innerJoin(snapshotScadenzario, eq(variazione.snapshotId, snapshotScadenzario.id))
      .where(cond).orderBy(verso(colonne[ord]), desc(variazione.id)).limit(dim).offset((pagina - 1) * dim);
    // Chi ha modificato: ultima modifica Apps Script su quella riga NON successiva alla lettura che ha visto la differenza.
    const fogliVar = [...new Set(vs.map((x) => x.v.foglio))];
    const edit = fogliVar.length ? await db.select().from(modificaCella).where(inArray(modificaCella.foglio, fogliVar)).orderBy(desc(modificaCella.ricevutaIl)).limit(5000) : [];
    const chiDi = (foglio: string, riga: number | null, lettoIl: Date) =>
      riga == null ? undefined : edit.find((e) => e.foglio === foglio && righeDi(e.cella)[0] <= riga && riga <= righeDi(e.cella)[1] && (e.quando ?? e.ricevutaIl) <= lettoIl);
    intestazioni = [["Letto il", "data"], ["Foglio", "foglio"], ["Voce", "voce"], ["Tipo", "tipo"], ["Campo", null], ["Prima", null], ["Dopo", null], ["Chi (Apps Script)", null]];
    righe = vs.flatMap(({ v, lettoIl }) => {
      const campi = (v.campi as { campo: string; prima: unknown; dopo: unknown }[] | null) ?? [{ campo: "", prima: null, dopo: null }];
      const chi = chiDi(v.foglio, v.rigaFoglio, lettoIl);
      return campi.map((c, i) => (
        <tr key={`${v.id}-${i}`}><td style={{ whiteSpace: "nowrap" }}>{ora(lettoIl)}</td><td>{v.foglio}</td><td>{v.chiave}</td><td>{v.tipo}</td>
          <td>{c.campo}</td><td>{mostra(c.prima)}</td><td>{mostra(c.dopo)}</td>
          <td>{chi ? `${chi.utente ?? "?"} · ${chi.cella}${chi.vecchioValore != null ? ` · era "${chi.vecchioValore}"` : ""}` : "—"}</td></tr>
      ));
    });
  }

  const pagine = Math.max(Math.ceil(totale / dim), 1);
  const pagina = Math.min(Math.max(Number(f.pag) || 1, 1), pagine);
  const da = totale ? (pagina - 1) * dim + 1 : 0, a = Math.min(pagina * dim, totale);
  const filtriAttivi = Boolean(dal || al || q || f.foglio || f.tipo || f.esito || f.origine);
  const [fogli, esiti, origini] = await Promise.all([
    db.selectDistinct({ x: variazione.foglio }).from(variazione), db.selectDistinct({ x: runControllo.esito }).from(runControllo), db.selectDistinct({ x: runControllo.origine }).from(runControllo),
  ]);
  const opzioni = (xs: { x: string }[]) => xs.map((o) => o.x).sort().map((x) => <option key={x} value={x}>{x}</option>);
  const sezione = vista === "controlli" ? "controlli" : "differenze";

  return (
    <>
    <Barra corrente="/storico" />
    <main className="pagina">
      <h1>Import e storico</h1>
      <p className="sottotitolo">Le date sono quelle della lettura dello scadenzario (ora di Roma). Clicca sull&apos;intestazione di una colonna per ordinare.</p>

      <nav aria-label="Vista" style={{ display: "flex", gap: 16, margin: "8px 0" }}>
        {([["differenze", "Differenze nello scadenzario"], ["controlli", "Controlli eseguiti"]] as const).map(([v, et]) => (
          <a key={v} href={`/storico?vista=${v}`} aria-current={v === vista ? "page" : undefined} style={{ fontWeight: v === vista ? 700 : 400, textDecoration: v === vista ? "underline" : "none", textUnderlineOffset: 6, color: "var(--color-fg)" }}>{et}</a>
        ))}
      </nav>

      <form method="get" className="riga-campi">
        <input type="hidden" name="vista" value={vista} />
        <label>Dal<input type="date" name="dal" defaultValue={dal} className="campo" /></label>
        <label>Al<input type="date" name="al" defaultValue={al} className="campo" /></label>
        {vista === "differenze" ? (<>
          <label>Foglio<select name="foglio" defaultValue={f.foglio ?? ""} className="campo"><option value="">Tutti</option>{opzioni(fogli)}</select></label>
          <label>Tipo<select name="tipo" defaultValue={f.tipo ?? ""} className="campo"><option value="">Tutti</option>{["nuova", "modificata", "eliminata"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label>Cerca (voce o campo)<input name="q" defaultValue={q} className="campo" placeholder="es. SardegnaCAT" /></label>
        </>) : (<>
          <label>Esito<select name="esito" defaultValue={f.esito ?? ""} className="campo"><option value="">Tutti</option>{opzioni(esiti)}</select></label>
          <label>Origine<select name="origine" defaultValue={f.origine ?? ""} className="campo"><option value="">Tutte</option>{opzioni(origini)}</select></label>
        </>)}
        <label>Righe per pagina<select name="dim" defaultValue={String(dim)} className="campo">{DIMENSIONI.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
        {f.ord && <input type="hidden" name="ord" value={f.ord} />}{f.dir && <input type="hidden" name="dir" value={f.dir} />}
        <button type="submit" className="btn primary">Filtra</button>
        {filtriAttivi && <a href={`/storico?vista=${vista}`} className="btn">Azzera filtri</a>}
      </form>

      <p role="status" style={{ margin: "4px 0 8px" }}>
        {totale === 0
          ? (filtriAttivi ? `Nessuna riga con questi filtri (su ${num(tutte)} ${sezione} in tutto).` : `Nessun dato registrato per ora: ${sezione} vuote.`)
          : <>Righe <strong>{num(da)}-{num(a)}</strong> di <strong>{num(totale)}</strong>{filtriAttivi ? ` con i filtri (su ${num(tutte)} in tutto)` : ""}.{vista === "differenze" ? " Una differenza può avere più campi: ogni campo è una riga." : ""}</>}
      </p>

      {totale > 0 && (
        <div className="scorri"><table>
          <thead><tr>{intestazioni.map(([et, col]) => col ? (
            <th key={et} scope="col" aria-sort={col === ord ? (dir === "asc" ? "ascending" : "descending") : "none"}>
              <a href={link({ ord: col, dir: col === ord && dir === "desc" ? "asc" : col === ord ? "desc" : col === "data" || col === "variazioni" ? "desc" : "asc" })} style={{ color: "inherit" }}>{et}{col === ord ? (dir === "asc" ? " ▲" : " ▼") : ""}</a>
            </th>
          ) : <th key={et} scope="col">{et}</th>)}</tr></thead>
          <tbody>{righe}</tbody>
        </table></div>
      )}

      {pagine > 1 && (
        <nav aria-label="Pagine" style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
          {pagina > 1 ? <><a className="btn" href={link({ pag: "1" })}>« Prima</a><a className="btn" href={link({ pag: String(pagina - 1) })}>‹ Precedente</a></> : null}
          <span>Pagina {num(pagina)} di {num(pagine)}</span>
          {pagina < pagine ? <><a className="btn" href={link({ pag: String(pagina + 1) })}>Successiva ›</a><a className="btn" href={link({ pag: String(pagine) })}>Ultima »</a></> : null}
        </nav>
      )}
    </main>
  </>
  );
}

