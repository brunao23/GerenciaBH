import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { TenantChatHistoryService } from "./lib/services/tenant-chat-history.service";

async function main() {
  const chat = new TenantChatHistoryService("bia_vox");
  
  const start = Date.now();
  const res = await chat.hasRecentEquivalentMessage({
      sessionId: "556592613457",
      content: "A tarde é melhor",
      role: "user",
      fromMe: false,
      withinSeconds: 300
  });
  const end = Date.now();
  console.log(`Query took ${end - start}ms, result: ${res}`);
}

main().catch(console.error);
