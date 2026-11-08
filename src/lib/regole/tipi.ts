// Le regole sono funzioni pure (contesto, soglie) -> anomalie grezze (specifiche 7). Nessun accesso a DB o orologio:
// la data di riferimento arriva nel contesto, così stessi input danno stessi esiti.
export type Dati = Record<string, string | number | null>;
export type Contratto = { chiave: string; rigaFoglio: number | null; d: Dati };
export type Movimento = { chiave: string; rigaFoglio: number | null; d: Dati };

// Budget ponderato dei ricavi per Id Progetto e mese (dal seed storico), per le regole del gruppo D.
export type RigaBudget = { progetto: string; anno: number; mese: number; importo: number };
// Variazione di una cella tra due snapshot, con data di lettura (regola D04).
export type VariazioneCella = { foglio: string; chiave: string; campo: string; prima: unknown; dopo: unknown; quando: string };

// Valore ammesso del foglio Lookup (una cella di una colonna di valori); `ripetuto` se compare più volte nella stessa colonna.
export type RigaLookup = { campo: string; valore: string; rigaFoglio: number | null; ripetuto: boolean };

export type Contesto = {
  oggi: string; // AAAA-MM-GG
  contratti: Contratto[];
  movimenti: Movimento[];
  budget?: RigaBudget[];
  variazioni?: VariazioneCella[];
  lookup?: RigaLookup[];
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
