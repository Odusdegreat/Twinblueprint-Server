import bcrypt from "bcrypt";
import { supabase } from "../src/config/supabase.ts";

const USERNAME = "admin";
const PASSWORD = "Metadology01!";
const EMAIL = "twinblueprints@gmail.com";

const seed = async () => {
  console.log("Checking for existing admin user...");

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("username", USERNAME)
    .single();

  if (existing) {
    console.log(`User "${USERNAME}" already exists. Skipping.`);
    return;
  }

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

  console.log(`Admin user created:`);
  console.log(`  Username: ${USERNAME}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  Change the password after first login!`);
};

seed();
