import { type MessagingConfig } from "@/lib/helpers/messaging-config"
import { ZApiService } from "@/lib/services/z-api.service"

export function createZApiServiceFromMessagingConfig(
  config: MessagingConfig | null | undefined,
): { service?: ZApiService; error?: string } {
  if (!config) return { error: "Configuracao de WhatsApp nao encontrada" }
  if (config.provider !== "zapi") return { error: "O provider desta unidade nao e Z-API" }

  const clientToken = String(config.clientToken || "").trim()
  if (!clientToken) return { error: "Client-Token da Z-API nao configurado" }

  const sendTextUrl = String(config.sendTextUrl || "").trim()
  const apiUrl = String(config.apiUrl || "").trim()
  const instanceId = String(config.instanceId || "").trim()
  const token = String(config.token || "").trim()

  if (!sendTextUrl && !(apiUrl && instanceId && token)) {
    return { error: "Preencha sendTextUrl ou (apiUrl + instanceId + token) para usar QR Code" }
  }

  return {
    service: new ZApiService({
      instanceId: instanceId || "ZAPI",
      token: token || "ZAPI",
      clientToken,
      apiUrl: sendTextUrl || apiUrl || "https://api.z-api.io",
    }),
  }
}

