import Schede from "@/schede/Schede";
import SelettoreVersione from "@/schede/SelettoreVersione";
import Barra from "../Barra";

export default function Page() {
  return (
    <>
      <Barra corrente="/schede" />
      <SelettoreVersione />
      <Schede />
    </>
  );
}
