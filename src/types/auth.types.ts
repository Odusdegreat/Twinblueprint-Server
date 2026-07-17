export type UserRole = "user" | "admin";

export interface User {
  id: string;
  full_name: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SafeUser = Omit<User, "password_hash">;
