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

// Dati mensili di un progetto per un anno, per confrontarli con le righe di Costi/Ricavi (analisi del contratto).
// Tutto in euro, costi con segno positivo; i 12 vettori vanno da gennaio a dicembre.
export type RigaCostoHub = { data: string; descrizione: string; tipo: string | null; importo: number };
export type MensileHub = {
  anno: number;
  lavorato: (number | null)[];          // campo "lic" del controllo di gestione; null se l'HUB non ha la riga di quell'anno
  statoMese: (string | null)[];         // APERTO o CHIUSO sul controllo di gestione
  personale: { costo: number[]; ore: number[] } | null; // reporting: ore per costo del personale; null se l'HUB non ha dati per l'anno
  altriCosti: number[];                 // costi aggiuntivi (importo per quantità) sommati per mese della data
  righeAltriCosti: RigaCostoHub[];
};

export interface CgdSource {
  readonly nome: string;
  progetti(): Promise<ProgettoCgd[]>;
  ore(anno: number, mese: number): Promise<RispostaHub>;
  analisiProgetto(id: number, anno: number): Promise<MensileHub>;
}

// Dal numero di contratto si aggancia lo scadenzario al CGD: "CTR487", "CTR 487" e "487" sono lo stesso contratto (specifiche 9.5).
export const numeroCtr = (v: unknown): string | null => {
  const m = String(v ?? "").match(/(?:CTR\s*)?(\d{3,4})/i);
  return m ? m[1] : null;
};
