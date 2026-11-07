// Avvio manuale del controllo da riga di comando: npm run controllo
import { config } from "dotenv";
config({ path: ".env.local" });
const { eseguiControllo } = await import("../src/lib/scadenzario/controllo");
console.log(JSON.stringify(await eseguiControllo("manuale"), null, 2));
process.exit(0);
