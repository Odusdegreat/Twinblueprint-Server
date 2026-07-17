import bcrypt from "bcrypt";
import { supabase } from "../src/config/supabase.ts";

const USERNAME = "admin";
const PASSWORD = "Metadology01!";
const EMAIL = "twinblueprints@gmail.com";

const INDEXES_SQL = `
-- Run these in Supabase SQL Editor for better query performance:
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

  console.log("\nRecommended indexes (run in Supabase SQL Editor):");
  console.log(INDEXES_SQL);
};

seed();
