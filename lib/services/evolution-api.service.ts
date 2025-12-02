/**
 * Evolution API Service
 * Serviço para integração com Evolution API (WhatsApp)
 * Docs: https://doc.evolution-api.com/
 */

export interface EvolutionAPIConfig {
    apiUrl: string
    instanceName: string
    token: string
    phoneNumber: string
}

export interface SendMessageParams {
    number: string
    text: string
    delay?: number
}

export interface EvolutionAPIResponse {
    success: boolean
    messageId?: string
    error?: string
    data?: any
}

export class EvolutionAPIService {
    private config: EvolutionAPIConfig

    constructor(config: EvolutionAPIConfig) {
        this.config = config
    }

    /**
     * Envia uma mensagem de texto via Evolution API
     */
    async sendTextMessage(params: SendMessageParams): Promise<EvolutionAPIResponse> {
        try {
            const { number, text, delay = 0 } = params

            // Remove caracteres especiais do número (mantém apenas dígitos)
            const cleanNumber = number.replace(/\D/g, '')

            // URL do endpoint
            const url = `${this.config.apiUrl}/message/sendText/${this.config.instanceName}`

            // Payload da requisição
            const payload = {
                number: cleanNumber,
                text: text,
                delay: delay
            }

            console.log('[EvolutionAPI] Enviando mensagem:', {
                url,
                number: cleanNumber,
                textPreview: text.substring(0, 50) + '...'
            })

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.config.token
                },
                body: JSON.stringify(payload)
            })

            const data = await response.json()

            if (!response.ok) {
                console.error('[EvolutionAPI] Erro no envio:', data)
                return {
                    success: false,
                    error: data.message || 'Erro ao enviar mensagem',
                    data
                }
            }

            console.log('[EvolutionAPI] Mensagem enviada com sucesso:', data)

            return {
                success: true,
                messageId: data.key?.id || data.messageId,
                data
            }

        } catch (error: any) {
            console.error('[EvolutionAPI] Erro na requisição:', error)
            return {
                success: false,
                error: error.message || 'Erro desconhecido'
            }
        }
    }

    /**
     * Verifica o status da conexão da instância
     */
    async checkInstanceStatus(): Promise<{ connected: boolean; data?: any }> {
        try {
            const url = `${this.config.apiUrl}/instance/connectionState/${this.config.instanceName}`

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': this.config.token
                }
            })

            const data = await response.json()

            return {
                connected: data.state === 'open' || data.instance?.state === 'open',
                data
            }

        } catch (error: any) {
            console.error('[EvolutionAPI] Erro ao verificar status:', error)
            return {
                connected: false,
                data: { error: error.message }
            }
        }
    }

    /**
     * Busca informações da instância
     */
    async fetchInstanceInfo(): Promise<any> {
        try {
            const url = `${this.config.apiUrl}/instance/fetchInstances?instanceName=${this.config.instanceName}`

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': this.config.token
                }
            })

            return await response.json()

        } catch (error: any) {
            console.error('[EvolutionAPI] Erro ao buscar informações:', error)
            return null
        }
    }

    /**
     * Verifica se um número está registrado no WhatsApp
     */
    async checkNumber(number: string): Promise<{ exists: boolean; jid?: string }> {
        try {
            const cleanNumber = number.replace(/\D/g, '')
            const url = `${this.config.apiUrl}/chat/whatsappNumbers/${this.config.instanceName}`

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.config.token
                },
                body: JSON.stringify({
                    numbers: [cleanNumber]
                })
            })

            const data = await response.json()

            if (data && data.length > 0) {
                return {
                    exists: data[0].exists || false,
                    jid: data[0].jid
                }
            }

            return { exists: false }

        } catch (error: any) {
            console.error('[EvolutionAPI] Erro ao verificar número:', error)
            return { exists: false }
        }
    }
}

/**
 * Função helper para criar instância do serviço a partir do banco
 */
export async function createEvolutionAPIServiceFromDB(): Promise<EvolutionAPIService | null> {
    try {
        const { createBiaSupabaseServerClient } = await import('@/lib/supabase/bia-client')
        const supabase = createBiaSupabaseServerClient()

        const { data, error } = await supabase
            .from('evolution_api_config')
            .select('*')
            .eq('is_active', true)
            .single()

        if (error || !data) {
            console.error('[EvolutionAPI] Configuração não encontrada:', error)
            return null
        }

        return new EvolutionAPIService({
            apiUrl: data.api_url,
            instanceName: data.instance_name,
            token: data.token,
            phoneNumber: data.phone_number
        })

    } catch (error: any) {
        console.error('[EvolutionAPI] Erro ao criar serviço:', error)
        return null
    }
}
