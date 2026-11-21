import { describe, it, expect } from "vitest";
import { chiaveRipetuta, daRisolvere } from "@/lib/regole/persistenza";

describe("chiavi ripetute del Lookup (H07)", () => {
  it("riconosce il numero d'ordine finale", () => {
    expect(chiaveRipetuta("stato:Attivo#2")).toBe(true);
    expect(chiaveRipetuta("stato:Attivo#12")).toBe(true);
  });
  it("non scambia per ripetute le chiavi senza numero", () => {
    expect(chiaveRipetuta("stato:Attivo")).toBe(false);
    expect(chiaveRipetuta("stato:Attivo#d")).toBe(false);
  });
});

describe("anomalie da risolvere", () => {
  const an = (fingerprint: string, regola: string, stato = "aperta") => ({ fingerprint, regola, stato });

  it("risolve quelle non più prodotte da una regola attiva", () => {
    const r = daRisolvere([an("f1", "A01"), an("f2", "A01")], new Set(["f1"]), { A01: { attiva: true } });
    expect(r.map((x) => x.fingerprint)).toEqual(["f2"]);
  });
  it("lascia invariate quelle di una regola disattivata", () => {
    expect(daRisolvere([an("f1", "B02"), an("f2", "B02", "in_carico")], new Set(), { B02: { attiva: false } })).toEqual([]);
  });
  it("non tocca quelle già risolte", () => {
    expect(daRisolvere([an("f1", "A01", "risolta")], new Set(), {})).toEqual([]);
  });
});
