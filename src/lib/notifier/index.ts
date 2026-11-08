import { ConsoleNotifier } from "./console";
import { SlackNotifier } from "./slack";
import { TeamsNotifier } from "./teams";
import type { Notifier } from "./tipi";

export type { Notifier, Messaggio, Esito } from "./tipi";

// Il provider si sceglie con NOTIFIER (slack | teams | console); senza token Slack si usa la console.
export function creaNotifier(): Notifier {
  const scelto = process.env.NOTIFIER ?? (process.env.SLACK_BOT_TOKEN ? "slack" : "console");
  if (scelto === "teams") return new TeamsNotifier();
  if (scelto === "slack" && process.env.SLACK_BOT_TOKEN) return new SlackNotifier(process.env.SLACK_BOT_TOKEN);
  return new ConsoleNotifier();
}
