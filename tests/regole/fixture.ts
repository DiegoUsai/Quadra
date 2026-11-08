import type { Contesto, Contratto, Movimento } from "@/lib/regole/tipi";

// Dati inventati: nessun cliente o importo reale (CLAUDE.md, "per i test usa solo dati anonimizzati").
export const OGGI = "2026-11-07";

export const contratto = (id: string, d: Record<string, string | number | null> = {}, riga = 2): Contratto => ({
  chiave: id, rigaFoglio: riga,
  d: {
    id_contratto: id, id_progetto: "PRJ", stato: "Contrattualizzato", attivo_passivo: "Attivo", importo: 120000, durata_mesi: 12,
    data_inizio: "2026-01-01", data_fine: "2026-12-31", linea_business: "Documentale", pm: "Anna",
    lav_2021: 0, lav_2025: 0, lav_2026: 100000, lav_totale: 100000, da_lavorare: 20000, squadratura_budget: 0, squadratura_piano_fatt: 0,
    check_fatt_lav: "OK", ...d,
  },
});

export const movimento = (contratto: string, mese: string, importo: number, d: Record<string, string | number | null> = {}, riga = 10): Movimento => ({
  chiave: `${mese}|${contratto}|Ricavo|MAC|x|Canone`, rigaFoglio: riga,
  d: { anno_mese: mese, id_contratto: contratto, tipo_voce: "Ricavo", spec_voce: "MAC", dettaglio: "x", tipo_servizio: "Canone", importo, nota: null, ...d },
});

export const ctx = (contratti: Contratto[], movimenti: Movimento[] = []): Contesto => ({ oggi: OGGI, contratti, movimenti });
