import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn("Supabase 환경변수가 설정되지 않았습니다.");
}

export const supabase = createClient<Database>(
  supabaseUrl || "",
  supabasePublishableKey || "",
);
