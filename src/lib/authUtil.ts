import { createClient } from "@supabase/supabase-js";
import { Database } from "../types/supabase";
import { config } from "../config";

export const getSupabase = () => createClient<Database>(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
