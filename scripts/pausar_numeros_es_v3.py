import os
from pathlib import Path
from supabase import create_client, Client
import time

def carregar_env():
    """Carrega variáveis do .env.local manual"""
    env_path = Path(__file__).parent.parent / '.env.local'
    if env_path.exists():
        try:
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip()
        except UnicodeDecodeError:
            with open(env_path, 'r', encoding='latin-1') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip()

def main():
    carregar_env()
    
    # Configuração Supabase
    SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Erro: Credenciais do Supabase não encontradas.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Ler números do arquivo
    arquivo_nums = Path('numeros_es_full.txt')
    if not arquivo_nums.exists():
        print(f"❌ Arquivo {arquivo_nums} não encontrado!")
        return
        
    print(f"📖 Lendo arquivo {arquivo_nums}...")
    with open(arquivo_nums, 'r', encoding='utf-8') as f:
        linhas = f.readlines()
        
    numeros = [l.strip() for l in linhas if l.strip() and len(l.strip()) >= 8]
    numeros_unicos = list(set(numeros))
    
    print(f"🔄 Iniciando pausa para {len(numeros_unicos)} números únicos...")
    print(f"ℹ️  Total original: {len(numeros)} | Duplicatas removidas: {len(numeros) - len(numeros_unicos)}")
    
    sucesso = 0
    erros = 0
    batch_size = 500 # Aumentando o batch para ir mais rápido
    total_batches = (len(numeros_unicos) + batch_size - 1) // batch_size
    
    for i in range(0, len(numeros_unicos), batch_size):
        batch = numeros_unicos[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        
        print(f"📦 Processando lote {batch_num}/{total_batches} ({len(batch)} números)...")
        
        # Preparar dados
        dados_batch = []
        for num in batch:
            dados_batch.append({
                'numero': num,
                'pausar': True,
                'vaga': False,
                'agendamento': True
            })
            
        try:
            # Upsert
            supabase.table('vox_es_pausar').upsert(dados_batch, on_conflict='numero').execute()
            sucesso += len(batch)
            print(f"   ✅ Lote {batch_num} ok!")
        except Exception as e:
            print(f"   ❌ Erro no lote {batch_num}: {e}")
            erros += len(batch)
            
        time.sleep(0.5) # Pequena pausa para aliviar rate limits
            
    print(f"\n{'='*50}")
    print(f"✨ PROCESSO CONCLUÍDO!")
    print(f"✅ Pausados com sucesso: {sucesso}")
    print(f"❌ Falhas: {erros}")
    print(f"{'='*50}")

if __name__ == "__main__":
    main()
