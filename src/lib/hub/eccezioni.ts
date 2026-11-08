import { getDb } from "@/db";
import { oreEccezione } from "@/db/schema";
import { attese, patrono, patronoPossibile, type Opzioni, type Orario } from "./ore";

export const TIPI_ORE = ["orario", "presa_servizio", "nome_escluso", "ferie_su_hub", "remoto"] as const;
export type RigaEccezione = { tipo: string; nome: string; parametriJson: unknown; validaDal: string | null; validaFino: string | null };
export type Eccezioni = { orari: Orario[]; nomiEsclusi: string[]; ferieSuHub: string[]; remoti: string[] };

/** Riga del database -> opzioni del controllo. `oggi` è ISO (aaaa-mm-gg): fuori dal periodo l'eccezione non vale. */
export function daRighe(righe: RigaEccezione[], oggi: string): Eccezioni {
  const e: Eccezioni = { orari: [], nomiEsclusi: [], ferieSuHub: [], remoti: [] };
  for (const r of righe) {
    const valida = (!r.validaDal || r.validaDal <= oggi) && (!r.validaFino || r.validaFino >= oggi);
    if (r.tipo === "orario") e.orari.push({ nome: r.nome, ...(r.parametriJson as object) });
    else if (r.tipo === "presa_servizio") e.orari.push({ nome: r.nome, da: r.validaDal ?? undefined });
    else if (valida && r.tipo === "nome_escluso") e.nomiEsclusi.push(r.nome);
    else if (valida && r.tipo === "ferie_su_hub") e.ferieSuHub.push(r.nome);
    else if (valida && r.tipo === "remoto") e.remoti.push(r.nome);
  }
  return e;
}

export async function caricaEccezioni(oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })) {
  return daRighe(await getDb().select().from(oreEccezione), oggi);
}

/** Opzioni di `controllaOre` a partire dalle eccezioni salvate. */
export const opzioniOre = (e: Eccezioni, bu = "Diego"): Opzioni => ({
  escluso: patrono(e.remoti), possibile: patronoPossibile(e.remoti), attese: attese(e.orari),
  ferieSuHub: e.ferieSuHub, nomiEsclusi: e.nomiEsclusi, bu,
});
