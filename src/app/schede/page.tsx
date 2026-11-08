import Schede from "@/schede/Schede";
import Barra from "../Barra";

export default function Page() {
  return (
    <>
      <Barra corrente="/schede" />
      <Schede />
    </>
  );
}
