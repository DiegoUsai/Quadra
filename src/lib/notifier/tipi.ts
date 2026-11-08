// Il resto dell'applicazione non conosce Slack: parla solo con questa interfaccia (specifiche 10.1, CLAUDE.md regola 6).
// Slack oggi, Teams quando la migrazione sarà completata.
export type Messaggio = {
  canale: string;      // identificativo del canale per il provider (per Slack l'ID, es. C0123ABC)
  testo: string;       // testo semplice: anteprima e fallback
  blocchi?: unknown[]; // contenuto ricco (Block Kit per Slack)
  thread?: string;     // risposta nello stesso thread di un messaggio precedente
};
export type Esito = { ok: true; canale: string; ts: string } | { ok: false; errore: string };

export interface Notifier {
  readonly nome: string;
  invia(m: Messaggio): Promise<Esito>;
}
