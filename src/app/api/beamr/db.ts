import { createClient } from "@supabase/supabase-js";
import { Database } from "./types";

const supabaseUrl = process.env.BEAMR_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.BEAMR_SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseClient = () => {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
};
