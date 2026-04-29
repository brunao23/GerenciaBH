import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createBiaSupabaseServerClient } from "./lib/supabase/bia-client";

async function main() {
  const supabase = createBiaSupabaseServerClient();
  
  const { data: registryData } = await supabase.from("units_registry")
    .select("id, metadata")
    .eq("unit_prefix", "vox_maceio")
    .single();
    
  if (registryData) {
    let metadata = registryData.metadata;
    if (metadata?.nativeAgentLearning?.signals) {
        const oldLength = metadata.nativeAgentLearning.signals.length;
        metadata.nativeAgentLearning.signals = metadata.nativeAgentLearning.signals.filter(
            (sig: any) => !String(sig.message || "").toLowerCase().includes("sarah")
        );
        const newLength = metadata.nativeAgentLearning.signals.length;
        
        if (oldLength !== newLength) {
            await supabase.from("units_registry")
                .update({ metadata })
                .eq("id", registryData.id);
            console.log(`Removidos ${oldLength - newLength} sinais corrompidos contendo "Sarah".`);
        } else {
            console.log("Nenhum sinal com Sarah encontrado no state atual.");
        }
    }
  }
}

main().catch(console.error);
