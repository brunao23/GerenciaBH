/**
 * Serviço de integração com Evolution API
 * Documentação: https://doc.evolution-api.com
 */

interface EvolutionApiConfig {
  url: string
  instance: string
  token: string
  phoneNumber: string
}

interface SendMessageParams {
  number: string
  text: string
  delay?: number
}

interface SendMessageResponse {
  success: boolean
  messageId?: string
  error?: string
  data?: any
}

export class EvolutionApiService {
  private config: EvolutionApiConfig

  constructor(config: EvolutionApiConfig) {
    this.config = config
  }

  /**
   * Envia mensagem de texto via Evolution API
   */
  async sendTextMessage(params: SendMessageParams): Promise<SendMessageResponse> {
    try {
      const url = `${this.config.url}/message/sendText/${this.config.instance}`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.config.token,
        },
        body: JSON.stringify({
          number: params.number,
          textMessage: {
            text: params.text
          },
          delay: params.delay || 1200 // Delay padrão de 1.2 segundos
        })
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('[Evolution API] Erro ao enviar mensagem:', data)
        return {
          success: false,
          error: data?.message || `HTTP ${response.status}: ${response.statusText}`,
          data
        }
      }

      return {
        success: true,
        messageId: data?.key?.id || data?.id,
        data
      }
    } catch (error: any) {
      console.error('[Evolution API] Exceção ao enviar mensagem:', error)
      return {
        success: false,
        error: error?.message || 'Erro desconhecido ao enviar mensagem'
      }
    }
  }

  /**
   * Verifica status da instância
   * Documentação: https://doc.evolution-api.com
   * Endpoint recomendado: GET /instance/connectionState/{instance}
   * Método alternativo: GET /instance/fetchInstances (busca todas e filtra)
   */
  async checkInstanceStatus(): Promise<{ online: boolean; error?: string; details?: any }> {
    try {
      // Limpa a URL removendo barra final se existir
      const baseUrl = this.config.url.replace(/\/$/, '')
      
      // Primeiro, tenta usar o endpoint específico da instância (método recomendado)
      let url = `${baseUrl}/instance/connectionState/${this.config.instance}`
      
      console.log(`[Evolution API] Verificando status da instância ${this.config.instance} em ${url}`)
      
      let response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': this.config.token,
          'Content-Type': 'application/json',
        }
      })

      // Se o endpoint específico não existir (404), tenta o método alternativo
      if (response.status === 404) {
        console.log('[Evolution API] Endpoint connectionState não encontrado, tentando fetchInstances...')
        
        // Método alternativo: buscar todas as instâncias
        url = `${baseUrl}/instance/fetchInstances`
        
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'apikey': this.config.token,
            'Content-Type': 'application/json',
          }
        })

        const data = await response.json()

        if (!response.ok) {
          console.error('[Evolution API] Erro ao buscar instâncias:', data)
          return {
            online: false,
            error: data?.message || `HTTP ${response.status}: ${response.statusText}`,
            details: data
          }
        }

        // Busca a instância na lista
        const instances = Array.isArray(data) ? data : (data?.instances || [])
        const instance = instances.find((inst: any) => 
          inst.instanceName === this.config.instance || 
          inst.instance?.instanceName === this.config.instance ||
          inst.name === this.config.instance
        )

        if (!instance) {
          const availableInstances = instances.map((i: any) => i.instanceName || i.name || i.instance?.instanceName).filter(Boolean)
          return {
            online: false,
            error: `Instância '${this.config.instance}' não encontrada. ${availableInstances.length > 0 ? `Instâncias disponíveis: ${availableInstances.join(', ')}` : 'Nenhuma instância encontrada.'}`,
            details: { instances: instances.map((i: any) => ({ name: i.instanceName || i.name, state: i.instance?.state || i.status })) }
          }
        }

        // Verifica o estado da instância
        const state = instance.instance?.state || instance.state || instance.status || instance.instance?.status
        const isConnected = state === 'open' || state === 'connected' || state === 'OPEN' || state === 'CONNECTED'

        return {
          online: isConnected,
          error: isConnected ? undefined : `Instância encontrada mas não está conectada. Estado: ${state || 'desconhecido'}`,
          details: { instance: instance.instanceName || instance.name, state }
        }
      } else {
        // Endpoint connectionState existe e retornou resultado
        const data = await response.json()

        if (!response.ok) {
          return {
            online: false,
            error: data?.message || `HTTP ${response.status}: ${response.statusText}`,
            details: data
          }
        }

        // Verifica o estado da conexão
        const state = data?.state || data?.status || data?.instance?.state || data?.connection?.state
        const isConnected = state === 'open' || state === 'connected' || state === 'OPEN' || state === 'CONNECTED'

        return {
          online: isConnected,
          error: isConnected ? undefined : `Estado: ${state || 'desconhecido'}`,
          details: { state, data }
        }
      }
    } catch (error: any) {
      console.error('[Evolution API] Erro ao verificar status:', error)
      return {
        online: false,
        error: error?.message || 'Erro ao verificar status da instância',
        details: { error: error.toString() }
      }
    }
  }

  /**
   * Normaliza número de telefone para formato da Evolution API
   */
  static normalizePhoneNumber(phone: string): string {
    if (!phone) return ''
    
    // Remove caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '')
    
    // Remove código do país se presente (55 para Brasil)
    if (cleaned.startsWith('55') && cleaned.length > 11) {
      cleaned = cleaned.substring(2)
    }
    
    // Garante formato correto (DDD + número)
    // Se tem 11 dígitos (celular) ou 10 dígitos (fixo), está ok
    return cleaned
  }

  /**
   * Formata número para envio (adiciona código do país se necessário)
   */
  static formatPhoneForSending(phone: string): string {
    const normalized = EvolutionApiService.normalizePhoneNumber(phone)
    
    // Adiciona código do país se não tiver
    if (normalized.length === 10 || normalized.length === 11) {
      return `55${normalized}@s.whatsapp.net`
    }
    
    // Se já tem código do país ou está completo, retorna como está
    if (phone.includes('@')) {
      return phone
    }
    
    return `${normalized}@s.whatsapp.net`
  }
}

