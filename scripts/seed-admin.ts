import bcrypt from "bcrypt";
import { supabase } from "../src/config/supabase.ts";

const USERNAME = "admin";
const PASSWORD = "Metadology01!";
const EMAIL = "twinblueprints@gmail.com";

const SETUP_SQL = `
-- =====================================================
-- Run ALL of these in Supabase SQL Editor (one-time)
-- =====================================================

-- Fix type mismatch: users.id is int8 but notifications.user_id / leads.assigned_to are UUID
-- Notifications
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications ALTER COLUMN user_id TYPE bigint USING user_id::bigint;
ALTER TABLE notifications ADD FOREIGN KEY (user_id) REFERENCES users(id);

-- Leads
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE leads ALTER COLUMN assigned_to TYPE bigint USING assigned_to::bigint;
ALTER TABLE leads ADD FOREIGN KEY (assigned_to) REFERENCES users(id);

-- Grants
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.leads TO authenticated;
GRANT ALL ON public.companies TO service_role;
GRANT ALL ON public.companies TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT ALL ON public.notifications TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Indexes (for query performance)
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_company_name ON companies (company_name);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
`;

const seed = async () => {
  console.log("Checking for existing admin user...");

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("username", USERNAME)
    .single();

  if (existing) {
    console.log(`User "${USERNAME}" already exists. Skipping.`);
  } else {
    const password_hash = await bcrypt.hash(PASSWORD, 12);

    const { error } = await supabase.from("users").insert({
      full_name: "Admin",
      username: USERNAME,
      email: EMAIL,
      password_hash,
      role: "admin",
      is_active: true,
    });

    if (error) {
      console.error("Failed to create admin user:", error);
      process.exit(1);
    }

    console.log("Admin user created:");
    console.log(`  Username: ${USERNAME}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log("  Change the password after first login!");
  }

  console.log("\nRun this SQL in Supabase SQL Editor (one-time setup):");
  console.log(SETUP_SQL);
};

seed();
