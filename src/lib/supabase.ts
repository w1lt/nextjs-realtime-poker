import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables");
}

// Create a single instance of the Supabase client with optimized realtime settings
const supabaseClient = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 40, // Increased for better responsiveness
    },
  },
  db: {
    schema: "public",
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Initialize realtime explicitly
supabaseClient.realtime.setAuth(supabaseKey);
supabaseClient.realtime.connect();

console.log("Supabase client initialized with realtime enabled");

export const supabase = supabaseClient;
