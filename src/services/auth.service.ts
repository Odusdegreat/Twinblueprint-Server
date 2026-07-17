import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase.ts";
import { env } from "../config/env.config.ts";
import type { User, SafeUser } from "../types/auth.types.ts";

const toSafeUser = (user: User): SafeUser => {
  const { password_hash, ...safe } = user;
  return safe;
};

export const login = async (
  username: string,
  password: string,
): Promise<{ user: SafeUser; token: string }> => {
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .single();

  if (error || !user) {
    throw Object.assign(new Error("Invalid username or password"), {
      statusCode: 401,
    });
  }

  if (!user.is_active) {
    throw Object.assign(new Error("Account is deactivated"), {
      statusCode: 403,
    });
  }

  if (user.role !== "admin") {
    throw Object.assign(new Error("Access denied"), {
      statusCode: 403,
    });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error("Invalid username or password"), {
      statusCode: 401,
    });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );

  return { user: toSafeUser(user as User), token };
};

export const getCurrentUser = async (userId: string): Promise<SafeUser> => {
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }

  return toSafeUser(user as User);
};
