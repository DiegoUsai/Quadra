import { REGOLE_A } from "./gruppoA";
import { REGOLE_B } from "./gruppoB";
import { REGOLE_C } from "./gruppoC";
import { REGOLE_D } from "./gruppoD";
import { REGOLE_G } from "./gruppoG";
import { REGOLE_H } from "./gruppoH";
import { REGOLE_K } from "./gruppoK";
import type { Contesto, DefinizioneRegola, Grezza, Severita, Soglie } from "./tipi";

export const REGOLE: DefinizioneRegola[] = [...REGOLE_A, ...REGOLE_B, ...REGOLE_C, ...REGOLE_D, ...REGOLE_G, ...REGOLE_H, ...REGOLE_K];

// Configurazione modificabile dal database (tabella `regola`): attiva, severità, soglie.
export type ConfigRegola = { attiva: boolean; severita: Severita; soglie: Soglie; notifica: boolean };
export type Anomalia = Grezza & { regola: string; severita: Severita; fingerprint: string; notifica: boolean; baseline: boolean };

export const fingerprintDi = (regola: string, g: Pick<Grezza, "entitaTipo" | "entitaChiave" | "periodo">) =>
  [regola, g.entitaTipo, g.entitaChiave, g.periodo ? `${g.periodo.anno}-${String(g.periodo.mese).padStart(2, "0")}` : ""].join("|");

export function eseguiRegole(ctx: Contesto, config: Record<string, Partial<ConfigRegola>> = {}): Anomalia[] {
  const out: Anomalia[] = [];
  for (const r of REGOLE) {
    const c = config[r.codice] ?? {};
    if (c.attiva === false) continue;
    const soglie = { ...r.soglie, ...(c.soglie ?? {}) };
    for (const g of r.esegui(ctx, soglie)) {
      out.push({ ...g, regola: r.codice, severita: g.severita ?? c.severita ?? r.severita, notifica: c.notifica ?? r.notifica ?? true, baseline: r.baselineSilenziosa ?? false, fingerprint: fingerprintDi(r.codice, g) });
    }
  }
  return out;
}
