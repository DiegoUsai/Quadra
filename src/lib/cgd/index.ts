import { HubApi } from "./hub";
import type { CgdSource } from "./tipi";

export type { CgdSource, ProgettoCgd } from "./tipi";
export const creaCgdSource = (): CgdSource => new HubApi();
