export type Role = "admin" | "user";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthAdapter {
  verifyCredentials(email: string, password: string): Promise<SessionUser | null>;
}
