import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createBiaSupabaseServerClient } from "./lib/supabase/bia-client";
import { getTablesForTenant } from "./lib/helpers/tenant";

async function main() {
  const supabase = createBiaSupabaseServerClient();
  const tables = getTablesForTenant("bia_vox");
  
  const { data } = await supabase.from(tables.crmFunnelConfig).select("metadata").limit(1);
  if (data) {
      console.log(data[0].metadata?.nativeAgentConfig?.inboundMessageBufferSeconds);
  }
}

main().catch(console.error);
