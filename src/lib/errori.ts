// Messaggio di errore da mostrare, salvare o notificare senza dati.
// Gli errori di Drizzle (DrizzleQueryError) riportano la query e i parametri ("Failed query: … params: …"), cioè valori
// di cella, importi e nomi: qui restano solo il codice Postgres e il nome della tabella o del vincolo (CLAUDE.md, log).
type ConCausa = { name?: string; message?: string; cause?: unknown; code?: string; table?: string; constraint?: string };

export function messaggioSicuro(e: unknown, max = 300): string {
  if (!(e instanceof Error)) return String(e ?? "errore").slice(0, max);
  const x = e as Error & ConCausa;
  if (x.name === "DrizzleQueryError" || /^Failed query:/.test(x.message)) {
    const c = (x.cause ?? {}) as ConCausa;
    const dove = c.table ? `, tabella ${c.table}` : c.constraint ? `, vincolo ${c.constraint}` : "";
    return `Errore del database${c.code ? ` (codice ${c.code}${dove})` : dove ? ` (${dove.slice(2)})` : ""}`;
  }
  return x.message.slice(0, max);
}
