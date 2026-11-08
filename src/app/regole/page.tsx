import { asc, eq, sql } from "drizzle-orm";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { correzione, eccezione, mappaUtente, oreEccezione, regola, rigaCorrente } from "@/db/schema";
import { TIPI_ORE } from "@/lib/hub/eccezioni";
import { REGOLE } from "@/lib/regole/indice";
import Barra from "../Barra";
import { aggiungiOreEccezione, eliminaEccezione, eliminaOreEccezione, salvaMappaPm, salvaRegola } from "./azioni";

export const dynamic = "force-dynamic";

const GRUPPI: Record<string, string> = { A: "Struttura e anagrafica", B: "Coerenza economica del contratto", C: "Canoni", D: "Budget e consuntivo", H: "Valori ammessi dal Lookup", K: "Righe di Costi/Ricavi" };
const SEV = ["bloccante", "alta", "media", "info"] as const;
const cella: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--color-border-line)", textAlign: "left", fontSize: 13, verticalAlign: "top" };
const muto: React.CSSProperties = { color: "var(--color-fg-muted)" };

export default async function Regole() {
  const s = await auth();
  const admin = s?.user?.ruolo === "admin" || authSaltata();
  if (!admin)
    return (<><Barra corrente="/regole" /><main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}><h1>Regole ed eccezioni</h1><p style={muto}>Questa pagina è riservata all&apos;amministratore.</p></main></>);

  const db = getDb();
  const [righe, ecc, corr, pmNomi, pmSlack, oreEcc] = await Promise.all([
    db.select().from(regola), db.select().from(eccezione).orderBy(asc(eccezione.regola), asc(eccezione.entitaChiave)), db.select().from(correzione).orderBy(asc(correzione.entitaChiave)),
    db.selectDistinct({ pm: sql<string>`${rigaCorrente.dati}->>'pm'` }).from(rigaCorrente).where(sql`${rigaCorrente.foglio} = 'Contratti Attivi' and ${rigaCorrente.dati}->>'pm' is not null`),
    db.select().from(mappaUtente), db.select().from(oreEccezione).orderBy(asc(oreEccezione.tipo), asc(oreEccezione.nome)),
  ]);
  const slackDi = new Map(pmSlack.map((p) => [p.pmNome, p.slackUserId ?? ""]));
  const pmLista = [...new Set(pmNomi.map((p) => p.pm).filter(Boolean))].sort();
  const dbPer = new Map(righe.map((r) => [r.codice, r]));
  const gruppi = [...new Set(REGOLE.map((r) => r.gruppo))];

  return (
    <>
      <Barra corrente="/regole" />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: 16 }}>
        <h1 style={{ fontFamily: "var(--font-anthropic-serif)", fontWeight: 700, marginBottom: 4 }}>Regole ed eccezioni</h1>
        <p style={{ ...muto, marginTop: 0 }}>Soglie, severità e attivazione sono dati: la modifica ricalcola subito le anomalie e viene registrata nell&apos;audit.</p>

        {gruppi.map((g) => (
          <section key={g} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>Gruppo {g}: {GRUPPI[g]}</h2>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["Regola", "Severità", "Attiva", "Notifica", "Soglie", ""].map((h, i) => <th key={i} scope="col" style={cella}>{h}</th>)}</tr></thead>
              <tbody>{REGOLE.filter((r) => r.gruppo === g).map((r) => {
                const d = dbPer.get(r.codice);
                const f = `f-${r.codice}`;
                return (
                  <tr key={r.codice}>
                    <td style={{ ...cella, maxWidth: 380 }}><strong>{r.nome}</strong> <span style={muto}>({r.codice})</span><div style={muto}>{r.descrizione}</div></td>
                    <td style={cella}><select form={f} name="severita" defaultValue={d?.severita ?? r.severita} className="btn">{SEV.map((v) => <option key={v} value={v}>{v}</option>)}</select></td>
                    <td style={cella}><input form={f} type="checkbox" name="attiva" defaultChecked={d?.attiva ?? true} aria-label={`Regola ${r.codice} attiva`} /></td>
                    <td style={cella}><input form={f} type="checkbox" name="notifica" defaultChecked={d?.notifica ?? r.notifica ?? true} aria-label={`Notifica ${r.codice}`} /></td>
                    <td style={cella}>
                      {Object.keys(r.soglie).length
                        ? <textarea form={f} name="soglie" defaultValue={JSON.stringify(d?.sogliaJson ?? r.soglie, null, 1)} rows={Math.min(6, Object.keys(r.soglie).length + 2)} className="btn" style={{ fontFamily: "monospace", width: 260 }} aria-label={`Soglie ${r.codice}`} />
                        : <><input form={f} type="hidden" name="soglie" value="{}" /><span style={muto}>nessuna soglia</span></>}
                    </td>
                    <td style={cella}>
                      <form id={f} action={salvaRegola}><input type="hidden" name="codice" value={r.codice} /><button type="submit" className="btn primary">Salva</button></form>
                      {d && d.versione > 1 && <div style={muto}>versione {d.versione}</div>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </section>
        ))}

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 6 }}>Eccezioni ({ecc.length})</h2>
          <p style={{ ...muto, marginTop: 0 }}>Un&apos;eccezione scaduta riapre l&apos;anomalia. L&apos;asterisco finale vale come jolly (<code>C*</code> = tutto il gruppo C).</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["Regola", "Contratto o progetto", "Motivo", "Approvata da", "Dal", "Fino al", ""].map((h, i) => <th key={i} scope="col" style={cella}>{h}</th>)}</tr></thead>
              <tbody>{ecc.map((e) => (
                <tr key={e.id}><td style={cella}>{e.regola}</td><td style={cella}>{e.entitaChiave}</td><td style={{ ...cella, maxWidth: 380 }}>{e.motivo}</td><td style={cella}>{e.approvataDa}</td>
                  <td style={cella}>{e.validaDal}</td><td style={cella}>{e.validaFino ?? "senza scadenza"}</td>
                  <td style={cella}><form action={eliminaEccezione}><input type="hidden" name="id" value={e.id} /><button className="btn" type="submit">Elimina</button></form></td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 16, marginBottom: 6 }}>Correzioni ({corr.length})</h2>
          <p style={{ ...muto, marginTop: 0 }}>Applicate in lettura, mai sul foglio. Una correzione attiva riconosce le anomalie dei canoni del contratto o del progetto.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["Tipo", "Contratto o progetto", "Parametri", "Motivo", "Dal", "Attiva"].map((h) => <th key={h} scope="col" style={cella}>{h}</th>)}</tr></thead>
              <tbody>{corr.map((c) => (
                <tr key={c.id}><td style={cella}>{c.tipo}</td><td style={cella}>{c.entitaChiave}</td><td style={{ ...cella, fontFamily: "monospace" }}>{JSON.stringify(c.parametriJson)}</td>
                  <td style={{ ...cella, maxWidth: 380 }}>{c.motivo}</td><td style={cella}>{c.validaDal}</td><td style={cella}>{c.attiva ? "sì" : "no"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 6 }}>PM e utenti Slack</h2>
          <p style={{ ...muto, marginTop: 0 }}>Serve a menzionare il PM nelle notifiche. L&apos;ID si copia dal profilo Slack della persona (Copia ID membro) e ha la forma U0123ABCD. Senza ID il nome compare in chiaro.</p>
          <table style={{ borderCollapse: "collapse" }}>
            <thead><tr>{["PM (colonna PM dello scadenzario)", "ID utente Slack", ""].map((h, i) => <th key={i} scope="col" style={cella}>{h}</th>)}</tr></thead>
            <tbody>{pmLista.map((pm) => (
              <tr key={pm}><td style={cella}>{pm}</td>
                <td style={cella}><input form={`pm-${pm}`} name="slack" defaultValue={slackDi.get(pm) ?? ""} placeholder="U0123ABCD" className="btn" aria-label={`ID Slack di ${pm}`} /></td>
                <td style={cella}><form id={`pm-${pm}`} action={salvaMappaPm}><input type="hidden" name="pm" value={pm} /><button className="btn primary" type="submit">Salva</button></form></td></tr>
            ))}</tbody>
          </table>
        </section>
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 6 }}>Controllo ore: eccezioni ({oreEcc.length})</h2>
          <p style={{ ...muto, marginTop: 0 }}>
            Il nome si scrive come sull&apos;HUB, in qualunque ordine. <strong>orario</strong>: part-time (ore al giorno e/o giorni liberi); <strong>presa servizio</strong>: primo giorno in servizio;
            <strong> nome escluso</strong>: aspettativa, altra BU o uscito; <strong>ferie su HUB</strong>: rendiconta le ferie anche sull&apos;HUB; <strong>remoto</strong>: il patrono non vale.
            Per nome escluso, ferie su HUB e remoto il periodo (dal, fino al) limita la validità: scaduta, l&apos;eccezione non si applica più.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["Tipo", "Nome", "Parametri", "Motivo", "Approvata da", "Dal", "Fino al", ""].map((h, i) => <th key={i} scope="col" style={cella}>{h}</th>)}</tr></thead>
              <tbody>{oreEcc.map((e) => (
                <tr key={e.id}><td style={cella}>{e.tipo}</td><td style={cella}>{e.nome}</td><td style={{ ...cella, fontFamily: "monospace" }}>{Object.keys(e.parametriJson as object).length ? JSON.stringify(e.parametriJson) : ""}</td>
                  <td style={{ ...cella, maxWidth: 320 }}>{e.motivo}</td><td style={cella}>{e.approvataDa}</td><td style={cella}>{e.validaDal ?? ""}</td><td style={cella}>{e.validaFino ?? ""}</td>
                  <td style={cella}><form action={eliminaOreEccezione}><input type="hidden" name="id" value={e.id} /><button className="btn" type="submit">Elimina</button></form></td></tr>
              ))}</tbody>
            </table>
          </div>
          <form action={aggiungiOreEccezione} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
            <label>Tipo<br /><select name="tipo" className="btn">{TIPI_ORE.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label>Nome<br /><input name="nome" required className="btn" placeholder="Cognome Nome" /></label>
            <label>Ore al giorno<br /><input name="oreGiorno" className="btn" placeholder="6" size={4} /></label>
            <label>Giorni liberi<br /><input name="liberi" className="btn" placeholder="ven" size={8} /></label>
            <label>Dal<br /><input name="dal" type="date" className="btn" /></label>
            <label>Fino al<br /><input name="fino" type="date" className="btn" /></label>
            <label>Motivo<br /><input name="motivo" required className="btn" size={36} /></label>
            <button type="submit" className="btn primary">Aggiungi</button>
          </form>
        </section>
      </main>
    </>
  );
}
