// Strumenti per le notifiche:
//   npm run notifiche:base      segna come già notificate le anomalie esistenti (da fare prima di accendere le notifiche)
//   npm run notifiche:prova     mostra nel log cosa verrebbe inviato, senza usare Slack
import { config } from "dotenv";
config({ path: ".env.local" });
const cmd = process.argv[2];
const n = await import("../src/lib/notifier/notifiche");
if (cmd === "base") console.log("anomalie segnate come già notificate:", await n.segnaStatoAttuale());
else if (cmd === "prova") {
  const { ConsoleNotifier } = await import("../src/lib/notifier/console");
  process.env.NOTIFICHE_ATTIVE = "1";
  process.env.SLACK_CHANNEL_ANOMALIE ??= "C_PROVA";
  const c = new ConsoleNotifier();
  console.log("nuove:", await n.inviaNuove(null, c));
  console.log("risoluzioni:", await n.inviaRisoluzioni(null, c));
  console.log("riepilogo:", await n.riepilogoGiornaliero({ forza: true }, c));
  console.log("\n--- primo messaggio (Block Kit) ---\n" + JSON.stringify(c.inviati[0], null, 1).slice(0, 1800));
} else console.log("uso: tsx scripts/notifiche.ts base|prova");
process.exit(0);
