import { timingSafeEqual } from "node:crypto";

// Confronto a tempo costante di un segreto condiviso (CRON_SECRET, APPS_SCRIPT_SECRET). Senza segreto configurato: sempre falso.
export function segretoValido(ricevuto: string | null, atteso: string | undefined): boolean {
  if (!atteso || !ricevuto) return false;
  const a = Buffer.from(ricevuto), b = Buffer.from(atteso);
  return a.length === b.length && timingSafeEqual(a, b);
}
