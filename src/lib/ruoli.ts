// Ruoli (sezione 14.1). Per ora da variabili d'ambiente; la tabella app_user subentra in fase 7.
// Le voci vuote si scartano: con ADMIN_EMAILS vuota un'email vuota non deve diventare admin.
const elenco = (v?: string) => (v ?? "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);

export function ruoloDi(email?: string | null): "admin" | "editor" | "viewer" {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return "viewer";
  if (elenco(process.env.ADMIN_EMAILS).includes(e)) return "admin";
  if (elenco(process.env.EDITOR_EMAILS).includes(e)) return "editor";
  return "viewer";
}
