import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getHub, HubApi, SECONDI_LETTURA } from "@/lib/cgd/hub";

const risposta = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

describe("lettura dell'HUB con tempi massimi", () => {
  beforeEach(() => vi.stubEnv("HUB_TOKEN", "prova"));
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("ogni chiamata ha un timeout e lo traduce in un errore leggibile", async () => {
    const fetch = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(getHub("/projects")).rejects.toThrow(/nessuna risposta entro 15 secondi/);
  });

  it("si ferma con un errore esplicito se la lettura dei progetti supera il tempo complessivo", async () => {
    const lista = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, contract: {} }));
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.endsWith("/projects") ? risposta(lista) : risposta({ id: 1, name: "P" }))));
    let t = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => (t += SECONDI_LETTURA * 600)); // ogni lettura dell'orologio avanza di 27 secondi
    await expect(new HubApi().progetti()).rejects.toThrow(/HUB troppo lento: letti \d+ progetti su 12/);
  });

  it("entro il tempo legge tutti i progetti con contratto", async () => {
    const lista = [{ id: 1, contract: {} }, { id: 2 }];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.endsWith("/projects") ? risposta(lista) : risposta({ project: { id: 1, name: "P", contract: { ctr: "CTR101" } } }))));
    const p = await new HubApi().progetti();
    expect(p.map((x) => x.ctr)).toEqual(["CTR101"]);
  });
});
