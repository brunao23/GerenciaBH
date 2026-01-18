/**
 * Z-API Service
 * Serviço para integração com Z-API (WhatsApp)
 * Docs: https://developer.z-api.io/
 */

export interface ZApiConfig {
    instanceId: string // Correspondente a 'instance' na Evolution
    token: string      // Correspondente a 'token' na Evolution
    clientToken: string // Token de segurança da conta Z-API
    apiUrl?: string    // Opcional, padrão é https://api.z-api.io
}

export interface SendMessageParams {
    phone: string
    message: string
    delayMessage?: number
}

export interface ZApiResponse {
    success?: boolean // Z-API nem sempre retorna field success explícito, mas retorna ID
    id?: string
    messageId?: string
    error?: string
    data?: any
}

export class ZApiService {
    private config: ZApiConfig
    private senderUrl: string
    private statusUrl: string
    private qrCodeUrl: string

    constructor(config: ZApiConfig) {
        this.config = config

        // Se a URL fornecida já for completa (termina com send-text), usamos ela
        if (config.apiUrl?.includes('send-text')) {
            this.senderUrl = config.apiUrl
            this.statusUrl = config.apiUrl.replace('send-text', 'status')
            this.qrCodeUrl = config.apiUrl.replace('send-text', 'qr-code/image')
        } else {
            // Comportamento legacy: constrói a URL
            const baseUrl = (config.apiUrl || 'https://api.z-api.io').replace(/\/$/, '')
            this.senderUrl = `${baseUrl}/instances/${this.config.instanceId}/token/${this.config.token}/send-text`
            this.statusUrl = `${baseUrl}/instances/${this.config.instanceId}/token/${this.config.token}/status`
            this.qrCodeUrl = `${baseUrl}/instances/${this.config.instanceId}/token/${this.config.token}/qr-code/image`
        }
    }

    /**
     * Obtém o QR Code como imagem base64
     * GET /qr-code/image
     */
    async getQrCodeImage(): Promise<{ success: boolean; image?: string; error?: string }> {
        try {
            const url = this.qrCodeUrl
            console.log('[Z-API] Buscando QR Code:', url)

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Client-Token': this.config.clientToken
                }
            })

            const data = await response.json()

            if (!response.ok) {
                return {
                    success: false,
                    error: data.message || `Erro HTTP ${response.status}`
                }
            }

            // A API retorna { link: "data:image/png;base64,..." } ou { value: "..." }
            // Verificando formato da resposta
            if (data.value) {
                return { success: true, image: data.value }
            } else if (data.link) {
                return { success: true, image: data.link }
            }

            return { success: false, error: 'Formato de QR Code desconhecido', image: JSON.stringify(data) }

        } catch (error: any) {
            console.error('[Z-API] Erro ao buscar QR Code:', error)
            return {
                success: false,
                error: error.message || 'Erro de conexão'
            }
        }
    }

    /**
     * Envia mensagem de texto via Z-API
     */
    async sendTextMessage(params: SendMessageParams): Promise<ZApiResponse> {
        try {
            const url = this.senderUrl

            // Formata telefone (apenas números)
            // Z-API exige DDI+DDD+Numero (ex: 5531999999999)
            // Evolution usava sufixo @s.whatsapp.net, Z-API NÃO usa para o parâmetro 'phone'
            let cleanPhone = params.phone.replace(/\D/g, '')

            // Garante DDI 55 se parecer número brasileiro sem DDI
            if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
                cleanPhone = '55' + cleanPhone
            }

            const payload = {
                phone: cleanPhone,
                message: params.message,
                delayMessage: params.delayMessage || 1
            }

            console.log('[Z-API] Enviando mensagem:', {
                url,
                phone: cleanPhone,
                messagePreview: params.message.substring(0, 50) + '...'
            })

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Client-Token': this.config.clientToken
                },
                body: JSON.stringify(payload)
            })

            const data = await response.json()

            if (!response.ok) {
                console.error('[Z-API] Erro no envio:', data)
                return {
                    success: false,
                    error: data.message || `Erro HTTP ${response.status}`,
                    data
                }
            }

            // Sucesso na Z-API geralmente retorna { id: "...", messageId: "..." }
            return {
                success: true,
                id: data.id || data.messageId,
                data
            }

        } catch (error: any) {
            console.error('[Z-API] Erro na requisição:', error)
            return {
                success: false,
                error: error.message || 'Erro desconhecido'
            }
        }
    }

    /**
     * Verifica o status da conexão da instância
     */
    async checkInstanceStatus(): Promise<{ connected: boolean; error?: string }> {
        try {
            const url = this.statusUrl

            console.log('[Z-API] Verificando status:', url)

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Client-Token': this.config.clientToken
                }
            })

            const data = await response.json()

            if (!response.ok) {
                return {
                    connected: false,
                    error: data.message || `Erro HTTP ${response.status}`
                }
            }

            // Z-API retorna { connected: boolean, error?: string }
            return {
                connected: data.connected === true,
                error: data.connected === true ? undefined : (data.error || 'Instância desconectada')
            }

        } catch (error: any) {
            console.error('[Z-API] Erro ao verificar status:', error)
            return {
                connected: false,
                error: error.message || 'Erro de conexão'
            }
        }
    }

    /**
     * Formata número para o padrão de envio da Z-API (DDI+DDD+Numero)
     * Remove sufixo @s.whatsapp.net se existir
     */
    static formatPhoneForSending(phone: string): string {
        if (!phone) return ''
        let clean = phone.replace('@s.whatsapp.net', '').replace(/\D/g, '')

        // Se estiver no formato brasileiro sem DDI, adiciona
        if (clean.length >= 10 && clean.length <= 11) {
            clean = '55' + clean
        }

        return clean
    }
}
