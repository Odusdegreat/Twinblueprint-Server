import { createClient } from "@supabase/supabase-js";
import { env } from "./env.config.ts";

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
);
