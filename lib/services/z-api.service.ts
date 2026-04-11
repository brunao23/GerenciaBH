/**
 * Z-API Service
 * Docs: https://developer.z-api.io/
 */

export interface ZApiConfig {
  instanceId: string
  token: string
  clientToken: string
  apiUrl?: string
}

export interface SendMessageParams {
  phone: string
  message: string
  delayMessage?: number
  delayTyping?: number
}

export interface SendAudioParams {
  phone: string
  audio: string
  delayMessage?: number
  delayTyping?: number
  waveform?: boolean
}

export interface ZApiResponse {
  success?: boolean
  id?: string
  messageId?: string
  error?: string
  data?: any
}

export class ZApiService {
  private config: ZApiConfig
  private senderUrl: string
  private senderAudioUrl: string
  private statusUrl: string
  private qrCodeBytesUrl: string
  private qrCodeImageUrl: string
  private phoneCodeUrl: string
  private messagesUrl: string

  constructor(config: ZApiConfig) {
    this.config = config

    if (config.apiUrl?.includes("send-text")) {
      this.senderUrl = config.apiUrl
      const baseUrl = config.apiUrl.replace(/\/send-text.*/i, "")
      this.senderAudioUrl = `${baseUrl}/send-audio`
      this.statusUrl = `${baseUrl}/status`
      this.qrCodeBytesUrl = `${baseUrl}/qr-code`
      this.qrCodeImageUrl = `${baseUrl}/qr-code/image`
      this.phoneCodeUrl = `${baseUrl}/phone-code`
      this.messagesUrl = `${baseUrl}/messages`
      return
    }

    const baseUrl = (config.apiUrl || "https://api.z-api.io").replace(/\/$/, "")
    const root = `${baseUrl}/instances/${this.config.instanceId}/token/${this.config.token}`
    this.senderUrl = `${root}/send-text`
    this.senderAudioUrl = `${root}/send-audio`
    this.statusUrl = `${root}/status`
    this.qrCodeBytesUrl = `${root}/qr-code`
    this.qrCodeImageUrl = `${root}/qr-code/image`
    this.phoneCodeUrl = `${root}/phone-code`
    this.messagesUrl = `${root}/messages`
  }

  private buildHeaders() {
    return {
      "Content-Type": "application/json",
      "Client-Token": this.config.clientToken,
    }
  }

  private async parseResponse(response: Response): Promise<any> {
    const raw = await response.text()
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return { raw }
    }
  }

  private parseBase64ImageFromResponse(data: any): string | null {
    const candidates = [
      data,
      data?.value,
      data?.link,
      data?.image,
      data?.base64,
      data?.qrCode,
      data?.qrcode,
      data?.data?.value,
      data?.data?.link,
      data?.data?.image,
      data?.data?.base64,
      data?.data?.qrCode,
      data?.data?.qrcode,
      data?.raw,
    ]

    for (const candidate of candidates) {
      const value = String(candidate || "").trim()
      if (!value) continue
      if (value.startsWith("data:image/")) return value
      if (value.startsWith("http://") || value.startsWith("https://")) return value
      if (/^[a-zA-Z0-9+/=]+$/.test(value) && value.length > 128) {
        return `data:image/png;base64,${value}`
      }
    }
    return null
  }

  /**
   * QR Code da instancia
   * Endpoints oficiais (Postman Z-API):
   * - GET /qr-code/image
   * - GET /qr-code
   */
  async getQrCodeImage(): Promise<{ success: boolean; image?: string; error?: string }> {
    try {
      const urls = [this.qrCodeImageUrl, this.qrCodeBytesUrl]
      let lastError = "Falha ao obter QR Code"

      for (const url of urls) {
        const response = await fetch(url, {
          method: "GET",
          headers: this.buildHeaders(),
        })
        const data = await this.parseResponse(response)

        if (!response.ok) {
          lastError = data?.message || `Erro HTTP ${response.status}`
          continue
        }

        const image = this.parseBase64ImageFromResponse(data)
        if (image) return { success: true, image }
      }

      return { success: false, error: lastError }
    } catch (error: any) {
      console.error("[Z-API] Erro ao buscar QR Code:", error)
      return {
        success: false,
        error: error?.message || "Erro de conexao",
      }
    }
  }

  /**
   * Pareamento por telefone
   * Endpoint oficial (Postman Z-API):
   * - GET /phone-code/{PHONE_NUMBER}
   */
  async getPhoneCode(phoneNumber: string): Promise<{ success: boolean; code?: string; error?: string; data?: any }> {
    try {
      let cleanPhone = String(phoneNumber || "").replace(/\D/g, "")
      if (cleanPhone.length >= 10 && cleanPhone.length <= 11) cleanPhone = `55${cleanPhone}`
      if (!cleanPhone || cleanPhone.length < 12) {
        return { success: false, error: "Numero invalido para gerar codigo" }
      }

      const response = await fetch(`${this.phoneCodeUrl}/${cleanPhone}`, {
        method: "GET",
        headers: this.buildHeaders(),
      })
      const data = await this.parseResponse(response)

      if (!response.ok) {
        return {
          success: false,
          error: data?.message || `Erro HTTP ${response.status}`,
          data,
        }
      }

      const code = String(
        data?.code ??
          data?.phoneCode ??
          data?.pairingCode ??
          data?.value ??
          data?.data?.code ??
          data?.data?.phoneCode ??
          "",
      ).trim()

      if (!code) {
        return { success: false, error: "Resposta sem codigo de pareamento", data }
      }

      return { success: true, code, data }
    } catch (error: any) {
      console.error("[Z-API] Erro ao gerar phone code:", error)
      return {
        success: false,
        error: error?.message || "Erro de conexao",
      }
    }
  }

  async sendTextMessage(params: SendMessageParams): Promise<ZApiResponse> {
    try {
      const url = this.senderUrl

      const uniqueTargets = this.buildTargets(params.phone)
      if (!uniqueTargets.length) {
        return { success: false, error: "Destino invalido para envio" }
      }

      const delayMessage = Number.isFinite(Number(params.delayMessage))
        ? Math.max(1, Math.min(15, Math.floor(Number(params.delayMessage))))
        : 1
      const delayTyping = Number.isFinite(Number(params.delayTyping))
        ? Math.max(0, Math.min(15, Math.floor(Number(params.delayTyping))))
        : 0

      let lastError: string | undefined
      let lastData: any = null

      for (const target of uniqueTargets) {
        const payload = {
          phone: target,
          message: params.message,
          delayMessage,
          delayTyping,
        }

        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(payload),
        })

        const data = await this.parseResponse(response)
        if (response.ok) {
          return {
            success: true,
            id: data?.id || data?.messageId,
            messageId: data?.messageId || data?.id,
            data,
          }
        }

        lastError = data?.message || (typeof data === "string" ? data : undefined) || `Erro HTTP ${response.status}`
        lastData = data
      }

      return {
        success: false,
        error: lastError || "Falha ao enviar na Z-API",
        data: lastData,
      }
    } catch (error: any) {
      console.error("[Z-API] Erro na requisicao:", error)
      return {
        success: false,
        error: error?.message || "Erro desconhecido",
      }
    }
  }

  async sendAudioMessage(params: SendAudioParams): Promise<ZApiResponse> {
    try {
      const url = this.senderAudioUrl
      const uniqueTargets = this.buildTargets(params.phone)
      if (!uniqueTargets.length) {
        return { success: false, error: "Destino invalido para envio" }
      }

      const audio = String(params.audio || "").trim()
      if (!audio) {
        return { success: false, error: "Audio obrigatorio para envio" }
      }
      const isAudioUrl = /^https?:\/\//i.test(audio)
      const base64Candidate = audio.replace(/\s+/g, "").trim()
      const isBase64Payload = !isAudioUrl && /^[a-zA-Z0-9+/=]+$/.test(base64Candidate) && base64Candidate.length > 80

      const delayMessage = Number.isFinite(Number(params.delayMessage))
        ? Math.max(1, Math.min(15, Math.floor(Number(params.delayMessage))))
        : 1
      const delayTyping = Number.isFinite(Number(params.delayTyping))
        ? Math.max(0, Math.min(15, Math.floor(Number(params.delayTyping))))
        : 0
      const waveform = params.waveform !== false

      let lastError: string | undefined
      let lastData: any = null

      for (const target of uniqueTargets) {
        const payloadVariants = isBase64Payload
          ? [
              {
                phone: target,
                audio: base64Candidate,
                delayMessage,
                delayTyping,
                waveform,
              },
              {
                phone: target,
                audio: base64Candidate,
                isBase64: true,
                delayMessage,
                delayTyping,
                waveform,
              },
              {
                phone: target,
                base64: base64Candidate,
                delayMessage,
                delayTyping,
                waveform,
              },
            ]
          : [
              {
                phone: target,
                audio,
                delayMessage,
                delayTyping,
                waveform,
              },
            ]

        for (const payload of payloadVariants) {
          const response = await fetch(url, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(payload),
          })

          const data = await this.parseResponse(response)
          if (response.ok) {
            return {
              success: true,
              id: data?.id || data?.messageId,
              messageId: data?.messageId || data?.id,
              data,
            }
          }

          lastError = data?.message || (typeof data === "string" ? data : undefined) || `Erro HTTP ${response.status}`
          lastData = data
        }
      }

      return {
        success: false,
        error: lastError || "Falha ao enviar audio na Z-API",
        data: lastData,
      }
    } catch (error: any) {
      console.error("[Z-API] Erro na requisicao de audio:", error)
      return {
        success: false,
        error: error?.message || "Erro desconhecido",
      }
    }
  }

  /**
   * DELETE /messages?messageId=...&phone=...&owner=true|false
   */
  async deleteMessage(params: { messageId: string; phone: string; owner?: boolean }): Promise<ZApiResponse> {
    try {
      const cleanPhone = ZApiService.formatPhoneForSending(params.phone)
      const owner = params.owner === true ? "true" : "false"
      const url = `${this.messagesUrl}?messageId=${encodeURIComponent(params.messageId)}&phone=${encodeURIComponent(cleanPhone)}&owner=${owner}`

      const response = await fetch(url, {
        method: "DELETE",
        headers: this.buildHeaders(),
      })
      const data = await this.parseResponse(response)

      if (!response.ok) {
        return {
          success: false,
          error: data?.message || `Erro HTTP ${response.status}`,
          data,
        }
      }

      return {
        success: true,
        data,
      }
    } catch (error: any) {
      console.error("[Z-API] Erro ao deletar mensagem:", error)
      return {
        success: false,
        error: error?.message || "Erro desconhecido",
      }
    }
  }

  async checkInstanceStatus(): Promise<{ connected: boolean; error?: string }> {
    try {
      const response = await fetch(this.statusUrl, {
        method: "GET",
        headers: this.buildHeaders(),
      })
      const data = await this.parseResponse(response)

      if (!response.ok) {
        return {
          connected: false,
          error: data?.message || `Erro HTTP ${response.status}`,
        }
      }

      const statusText = String(data?.status || data?.connectionStatus || data?.state || "").toUpperCase()
      const connected =
        data?.connected === true ||
        statusText === "CONNECTED" ||
        statusText === "OPEN" ||
        statusText === "ONLINE"

      return {
        connected,
        error: connected ? undefined : data?.error || data?.message || "Instancia desconectada",
      }
    } catch (error: any) {
      console.error("[Z-API] Erro ao verificar status:", error)
      return {
        connected: false,
        error: error?.message || "Erro de conexao",
      }
    }
  }

  static formatPhoneForSending(phone: string): string {
    if (!phone) return ""
    let clean = phone.replace("@s.whatsapp.net", "").replace(/\D/g, "")
    if (clean.length >= 10 && clean.length <= 11) clean = `55${clean}`
    return clean
  }

  private buildTargets(phone: string): string[] {
    const originalTarget = String(phone || "").trim()
    const targets: string[] = []

    if (/@g\.us$/i.test(originalTarget) || /@lid$/i.test(originalTarget)) {
      targets.push(originalTarget)
      if (/@g\.us$/i.test(originalTarget)) {
        const base = originalTarget.replace(/@g\.us$/i, "").replace(/[^0-9-]/g, "")
        if (base) targets.push(`${base}-group`)
      }
    } else if (/-group$/i.test(originalTarget)) {
      const base = originalTarget.replace(/-group$/i, "").replace(/[^0-9-]/g, "")
      if (base) {
        targets.push(`${base}-group`)
        targets.push(`${base}@g.us`)
      }
    } else {
      const possibleGroup = originalTarget.replace(/[^0-9-]/g, "")
      if (/^\d{8,}-\d{2,}$/.test(possibleGroup)) {
        targets.push(`${possibleGroup}@g.us`)
      } else {
        let cleanPhone = originalTarget.replace(/\D/g, "")
        if (cleanPhone.length >= 10 && cleanPhone.length <= 11) cleanPhone = `55${cleanPhone}`
        if (cleanPhone) targets.push(cleanPhone)
      }
    }

    return Array.from(new Set(targets.filter(Boolean)))
  }
}
