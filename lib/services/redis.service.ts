import { Redis } from "@upstash/redis"

export class RedisService {
  private static instance: Redis | null = null
  private static get client(): Redis | null {
    if (this.instance) return this.instance
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
    if (!url || !token) {
      console.warn("[RedisService] Variáveis UPSTASH_REDIS_REST_URL ou UPSTASH_REDIS_REST_TOKEN não encontradas. Cache desabilitado.")
      return null
    }
    this.instance = new Redis({ url, token })
    return this.instance
  }

  static async getCache<T>(key: string): Promise<T | null> {
    if (!this.client) return null
    try {
      return await this.client.get<T>(key)
    } catch (e) {
      console.error("[RedisService] Erro ao ler cache:", e)
      return null
    }
  }

  static async setCache<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<boolean> {
    if (!this.client) return false
    try {
      await this.client.set(key, value, { ex: ttlSeconds })
      return true
    } catch (e) {
      console.error("[RedisService] Erro ao salvar cache:", e)
      return false
    }
  }

  static async delCache(key: string): Promise<boolean> {
    if (!this.client) return false
    try {
      await this.client.del(key)
      return true
    } catch (e) {
      return false
    }
  }

  /**
   * Adquire um Lock distribuído para evitar Race Conditions de mensagens simultâneas.
   * O Lock é liberado automaticamente após o tempo TTL para prevenir deadlocks.
   */
  static async acquireLock(lockKey: string, ttlSeconds: number = 30): Promise<boolean> {
    if (!this.client) return true // Se não tem redis configurado, deixa passar (comportamento legado)
    try {
      // 'nx' = set if Not eXists. Se retornar null/false, o lock já existe.
      const result = await this.client.set(lockKey, "locked", { nx: true, ex: ttlSeconds })
      return result === "OK" || result === true || result !== null
    } catch (e) {
      console.error("[RedisService] Erro ao adquirir lock:", e)
      return true // Falha tolerante
    }
  }

  static async releaseLock(lockKey: string): Promise<void> {
    if (!this.client) return
    try {
      await this.client.del(lockKey)
    } catch (e) {
      console.error("[RedisService] Erro ao liberar lock:", e)
    }
  }

  /**
   * Aguarda um lock ser liberado fazendo polling.
   */
  static async waitAndAcquireLock(lockKey: string, ttlSeconds: number = 30, maxWaitMs: number = 15000): Promise<boolean> {
    if (!this.client) return true
    const start = Date.now()
    
    while (Date.now() - start < maxWaitMs) {
      const locked = await this.acquireLock(lockKey, ttlSeconds)
      if (locked) return true
      // Espera 500ms antes de tentar de novo
      await new Promise(r => setTimeout(r, 500))
    }
    
    return false // Timeout, não conseguiu o lock
  }
}
