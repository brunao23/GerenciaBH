import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createBiaSupabaseServerClient } from "./lib/supabase/bia-client";
import { getTablesForTenant } from "./lib/helpers/tenant";

async function main() {
  const supabase = createBiaSupabaseServerClient();
  const tables = getTablesForTenant("vox_maceio");
  
  for (const sess of ["558296331177", "558299557760"]) {
      console.log(`\n--- Session: ${sess} ---`);
      const { data } = await supabase.from(tables.chatHistories)
        .select("message")
        .eq("session_id", sess)
        .order("created_at", { ascending: true });
        
      if (data) {
        const lines = data.map(r => {
            try {
                const msg = typeof r.message === 'string' ? JSON.parse(r.message) : r.message;
                return `${msg?.role || msg?.type}: ${msg?.content || msg?.text}`;
            } catch(e) { return ""; }
        });
        console.log(lines.join("\n"));
      }
  }
}

main().catch(console.error);
