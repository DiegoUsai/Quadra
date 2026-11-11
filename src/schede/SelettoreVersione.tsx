"use client";
import { useEffect, useState } from "react";

type Versione = { versione: number; descrizione: string; attiva: boolean; creataIl: string };
type Dash = { setVersione?: (v: number | null) => void };
const dash = () => (window as unknown as { dash?: Dash }).dash;

// Selettore della versione del budget mostrata nelle schede. È separato dal componente delle schede di proposito:
// le schede scrivono direttamente nel loro markup e non devono essere ridisegnate da React quando cambia questo stato.
export default function SelettoreVersione() {
  const [anno, setAnno] = useState<number>(2027);
  const [versioni, setVersioni] = useState<Versione[]>([]);
  const [scelta, setScelta] = useState<number | null>(null); // null = la versione attiva

  useEffect(() => {
    let attivo = true;
    fetch("/api/budget/versioni").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && attivo) { setAnno(j.anno); setVersioni(j.versioni); } }).catch(() => undefined);
    // Versione indicata nell'indirizzo (?versione=2): si applica appena lo strato dati delle schede è pronto
    const v = Number(new URLSearchParams(location.search).get("versione"));
    if (v) {
      setScelta(v);
      const prova = setInterval(() => { if (dash()?.setVersione) { dash()!.setVersione!(v); clearInterval(prova); } }, 150);
      setTimeout(() => clearInterval(prova), 15000);
    }
    return () => { attivo = false; };
  }, []);

  const attiva = versioni.find((v) => v.attiva);
  const mostrata = versioni.find((v) => v.versione === (scelta ?? attiva?.versione));
  const cambia = (valore: string) => {
    const v = valore ? Number(valore) : null;
    const diversa = v !== null && v !== attiva?.versione;
    setScelta(diversa ? v : null);
    dash()?.setVersione?.(diversa ? v : null);
    const u = new URL(location.href);
    if (diversa) u.searchParams.set("versione", String(v)); else u.searchParams.delete("versione");
    history.replaceState(null, "", u);
  };

  if (versioni.length < 2) return null;
  return (
    <div role="group" aria-label={`Versione del budget ${anno}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 16px 0", fontSize: 13 }}>
      <label htmlFor="versione-budget"><strong>Budget {anno}</strong>, versione:</label>
      <select id="versione-budget" className="btn" value={mostrata?.versione ?? ""} onChange={(e) => cambia(e.target.value)}>
        {versioni.map((v) => <option key={v.versione} value={v.versione}>v{v.versione}{v.attiva ? " (attiva)" : ""}</option>)}
      </select>
      {mostrata && <span style={{ color: "var(--color-fg-muted)" }}>{mostrata.descrizione} · creata il {new Date(mostrata.creataIl).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</span>}
      {scelta !== null && scelta !== attiva?.versione && (
        <span role="status" style={{ border: "1px solid var(--color-border-line)", borderRadius: 6, padding: "1px 8px" }}>
          Stai guardando una versione diversa da quella attiva.{" "}
          <button type="button" className="btn" onClick={() => cambia("")}>Torna alla versione attiva</button>
        </span>
      )}
    </div>
  );
}
