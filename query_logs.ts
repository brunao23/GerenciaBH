import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createBiaSupabaseServerClient } from "./lib/supabase/bia-client";
import { getTablesForTenant } from "./lib/helpers/tenant";

async function main() {
  const supabase = createBiaSupabaseServerClient();
  const tables = getTablesForTenant("bia_vox");
  
  const { data, error } = await supabase.rpc('get_indexes_for_table', { table_name: tables.chatHistories });
  
  if (error) {
    const { data: qData, error: qError } = await supabase.from('pg_indexes').select('*').eq('tablename', tables.chatHistories);
    console.log("pg_indexes:", qData || qError);
  } else {
    console.log(data);
  }
}

main().catch(console.error);
