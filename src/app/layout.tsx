import type { ReactNode } from "react";
import "@/schede/theme.css";
import "./app.css";
export const metadata = { title: "Quadra" };
export default function Layout({ children }: { children: ReactNode }) {
  return (<html lang="it"><body>{children}</body></html>);
}
