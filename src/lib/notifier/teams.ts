import type { Esito, Messaggio, Notifier } from "./tipi";

// Predisposto per la migrazione da Slack a Teams (specifiche 10.1). Non ancora implementato: si completa quando serve,
// senza toccare il resto dell'applicazione.
export class TeamsNotifier implements Notifier {
  readonly nome = "teams";
  async invia(_m: Messaggio): Promise<Esito> {
    return { ok: false, errore: "Teams non ancora implementato" };
  }
}
