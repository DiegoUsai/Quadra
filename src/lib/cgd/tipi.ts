import type { RispostaHub } from "../hub/ore";

// Il CGD (l'HUB di SiMaggioli, decisione di Diego 12/11/2026) si legge solo tramite questa interfaccia (CLAUDE.md, regola 7):
// oggi tramite le API dell'HUB, in futuro altre fonti (per esempio il file overview_progetti) senza cambiare regole e pagine.
export type ProgettoCgd = {
  id: number; nome: string;
  ctr: string | null;        // codice del contratto sul CGD, es. "CTR487"; vuoto su alcuni progetti
  importo: number | null;    // importo complessivo del contratto
  inizio: string | null;     // AAAA-MM-GG, giorno di calendario a Roma
  fine: string | null;
  bloccato: boolean;
};

export interface CgdSource {
  readonly nome: string;
  progetti(): Promise<ProgettoCgd[]>;
  ore(anno: number, mese: number): Promise<RispostaHub>;
}

// Dal numero di contratto si aggancia lo scadenzario al CGD: "CTR487", "CTR 487" e "487" sono lo stesso contratto (specifiche 9.5).
export const numeroCtr = (v: unknown): string | null => {
  const m = String(v ?? "").match(/(?:CTR\s*)?(\d{3,4})/i);
  return m ? m[1] : null;
};
