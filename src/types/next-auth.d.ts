import "next-auth";
declare module "next-auth" {
  interface User { ruolo?: "admin" | "editor" | "viewer" }
  interface Session { user: { ruolo: "admin" | "editor" | "viewer" } & import("next-auth").DefaultSession["user"] }
}
