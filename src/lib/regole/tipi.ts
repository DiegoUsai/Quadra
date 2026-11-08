// Le regole sono funzioni pure (contesto, soglie) -> anomalie grezze (specifiche 7). Nessun accesso a DB o orologio:
// la data di riferimento arriva nel contesto, così stessi input danno stessi esiti.
export type Dati = Record<string, string | number | null>;
export type Contratto = { chiave: string; rigaFoglio: number | null; d: Dati };
export type Movimento = { chiave: string; rigaFoglio: number | null; d: Dati };

export type Contesto = {
  oggi: string; // AAAA-MM-GG
  contratti: Contratto[];
  movimenti: Movimento[];
};

export type Severita = "bloccante" | "alta" | "media" | "info";

export type Grezza = {
  entitaTipo: "contratto" | "movimento";
  entitaChiave: string;
  periodo?: { anno: number; mese: number };
  messaggio: string;
  valori?: Record<string, unknown>;
  severita?: Severita; // se assente vale quella della regola
  foglio: "Contratti Attivi" | "Costi/Ricavi";
  rigaFoglio?: number | null;
  pm?: string | null;
};

export type Soglie = Record<string, unknown>;

export type DefinizioneRegola = {
  codice: string;
  nome: string;
  descrizione: string;
  gruppo: string;
  severita: Severita;
  soglie: Soglie; // valori iniziali, modificabili dal database
  notifica?: boolean;
  esegui: (ctx: Contesto, soglie: Soglie) => Grezza[];
};
