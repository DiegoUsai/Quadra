import type { ReactNode } from "react";
export const metadata = { title: "Quadra" };
export default function Layout({ children }: { children: ReactNode }) {
  return (<html lang="it"><body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body></html>);
}
