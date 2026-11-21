import type { Esito, Messaggio, Notifier } from "./tipi";

// Senza credenziali Slack i messaggi si vedono nel log: serve per provare il flusso senza inviare nulla a nessuno.
export class ConsoleNotifier implements Notifier {
  readonly nome = "console";
  readonly inviati: Messaggio[] = [];
  async invia(m: Messaggio): Promise<Esito> {
    this.inviati.push(m);
    // In produzione il testo non va nei log: contiene nomi dei PM e valori di cella (CLAUDE.md). Solo canale e lunghezza.
    const corpo = process.env.NODE_ENV === "production" ? `(testo non registrato, ${m.testo.length} caratteri)` : m.testo;
    console.log(`[notifica ${m.canale}${m.thread ? " thread " + m.thread : ""}] ${corpo}`);
    return { ok: true, canale: m.canale, ts: `${Math.floor(Date.now() / 1000)}.${String(this.inviati.length).padStart(6, "0")}` };
  }
}
