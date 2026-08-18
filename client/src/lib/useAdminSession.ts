import { trpc } from "./trpc";

/** True only once we've confirmed a logged-in admin session — never renders admin-only UI on a guess. */
export function useAdminSession(): boolean {
  const me = trpc.auth.me.useQuery();
  return me.data?.role === "admin";
}
