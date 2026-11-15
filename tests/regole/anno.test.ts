import { describe, expect, it } from "vitest";
import { annoRifDi, indiceFine } from "@/lib/regole/anno";
import { eseguiRegole } from "@/lib/regole/indice";
import { contratto, ctx, movimento } from "./fixture";

// Dati inventati.
describe("anno di riferimento delle anomalie", () => {
  const contratti = [
    contratto("A", { data_fine: "2025-06-30", ctr_hub: "CTR101" }), contratto("B", { data_fine: "2027-03-31", ctr_hub: "CTR202" }),
    contratto("C", { data_fine: null }), contratto("S1", { data_fine: "2026-06-30" }, 3), contratto("S2", { data_fine: "2028-01-31" }, 4),
  ];
  const idx = indiceFine({ contratti });
  const anno = (entitaChiave: string, extra: object = {}) => annoRifDi({ entitaChiave, ...extra }, idx);

  it("anomalie con un mese (ricavi, canoni): anno di rendicontazione", () => {
    expect(anno("2026-03-01|A|Ricavo|MAC|x|Canone", { periodo: { anno: 2026, mese: 3 } })).toEqual({ anno: 2026, tipo: "rendicontazione" });
  });
  it("anomalie dei contratti: anno della data fine, per Id Contratto, per CTR e dal contratto citato nei valori", () => {
    expect(anno("A")).toEqual({ anno: 2025, tipo: "scadenza" });
    expect(anno("A#2")).toEqual({ anno: 2025, tipo: "scadenza" }); // duplicato nel foglio
    expect(anno("CTR202")).toEqual({ anno: 2027, tipo: "scadenza" }); // regole G
    expect(anno("2026-01-01|B|x", { valori: { contratto: "B" } })).toEqual({ anno: 2027, tipo: "scadenza" });
    expect(anno("CTR101", { valori: { contratto: "CTR101 (A)" } })).toEqual({ anno: 2025, tipo: "scadenza" });
  });
  it("D07 e D02: l'anno viene dai valori (fine del contratto; ricavi dell'anno senza budget)", () => {
    expect(anno("P1|2027", { valori: { fine: "2026-12-31" } })).toEqual({ anno: 2026, tipo: "scadenza" });
    expect(anno("P1|2026", { valori: { anno: 2026 } })).toEqual({ anno: 2026, tipo: "rendicontazione" });
  });
  it("senza data fine o senza contratto: nessun anno", () => {
    expect(anno("C")).toBeNull();
    expect(anno("Z")).toBeNull();
    expect(anno("Premio di Lookup")).toBeNull();
  });
  it("più ordini dello stesso Id Contratto: vale l'ultima fine", () => {
    const o = (id: string, fine: string, riga: number) => contratto(id, { id_contratto: "ORD", id_progetto: "P", data_fine: fine, contratto_padre: "CP" }, riga);
    expect(annoRifDi({ entitaChiave: "ORD" }, indiceFine({ contratti: [o("X", "2026-01-31", 2), o("Y", "2027-06-30", 3)] }))).toEqual({ anno: 2027, tipo: "scadenza" });
  });
  it("sulle anomalie vere delle regole: una per riga B04 ha il mese, A01 ha la fine del contratto", () => {
    const c = ctx([contratto("F", { data_fine: "2026-06-30" })], [movimento("F", "2026-08-01", 10)]);
    const prodotte = eseguiRegole(c);
    const b04 = prodotte.find((a) => a.regola === "B04")!;
    expect(annoRifDi(b04, indiceFine(c))).toEqual({ anno: 2026, tipo: "rendicontazione" });
  });
});
