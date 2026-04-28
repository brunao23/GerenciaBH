# fix-encoding.ps1 — Corrige sequencias UTF-8 interpretadas como Latin-1
# Roda na raiz do projeto GerenciaBH

$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

# Mapa de substituicoes: Latin-1 garbled -> UTF-8 correto
$replacements = [ordered]@{
    # Sequencias mais comuns primeiro (ordem importa: mais longas antes)
    'ÃƒÂ³' = 'ó'; 'ÃƒÂ²' = 'ò'; 'ÃƒÂ´' = 'ô'; 'ÃƒÂ µ' = 'õ'
    'ÃƒÂ©' = 'é'; 'ÃƒÂ¨' = 'è'; 'ÃƒÂª' = 'ê'
    'ÃƒÂ­' = 'í'; 'ÃƒÂ¬' = 'ì'; 'ÃƒÂ®' = 'î'
    'ÃƒÂ¡' = 'á'; 'ÃƒÂ ' = 'à'; 'ÃƒÂ¢' = 'â'; 'ÃƒÂ£' = 'ã'
    'ÃƒÂº' = 'ú'; 'ÃƒÂ¹' = 'ù'; 'ÃƒÂ»' = 'û'
    'ÃƒÂ§' = 'ç'; 'Ãƒâ€š' = 'Â'
    'Ã³' = 'ó'; 'Ã²' = 'ò'; 'Ã´' = 'ô'; 'Ãµ' = 'õ'
    'Ã©' = 'é'; 'Ã¨' = 'è'; 'Ãª' = 'ê'
    'Ã­' = 'í'; 'Ã¬' = 'ì'; 'Ã®' = 'î'
    'Ã¡' = 'á'; 'Ã ' = 'à'; 'Ã¢' = 'â'; 'Ã£' = 'ã'
    'Ãº' = 'ú'; 'Ã¹' = 'ù'; 'Ã»' = 'û'
    'Ã§' = 'ç'
    # Maiusculas
    'Ã"' = 'Ó'; 'Ã'' = 'Ò'; 'Ã"' = 'Ô'; 'Ã•' = 'Õ'
    'Ã‰' = 'É'; 'Ãˆ' = 'È'; 'ÃŠ' = 'Ê'
    'Ã' = 'Í'; 'ÃŒ' = 'Ì'; 'ÃŽ' = 'Î'
    'Ã' = 'Á'; 'Ã€' = 'À'; 'Ã‚' = 'Â'; 'Ãƒ' = 'Ã'
    'Ãš' = 'Ú'; 'Ã™' = 'Ù'; 'Ã›' = 'Û'
    'Ã‡' = 'Ç'
    # Especiais
    'â€™' = "'"; "â€œ" = '"'; 'â€' = '"'; 'â€"' = '—'; 'â€"' = '–'
    'â€¦' = '…'; 'â€¢' = '•'
    'Ã¯Â»Â¿' = ''  # BOM
    # Combinacoes com tilde
    'Ã£' = 'ã'; 'Ãµ' = 'õ'; 'Ã±' = 'ñ'
    # Cedilha e til
    'Ã§Ã£o' = 'ção'; 'Ã§Ã¥o' = 'ção'
    'ÃƒÂ§ÃƒÂ£o' = 'ção'
    # Padroes restantes comuns no projeto
    'nÃ£o' = 'não'; 'NÃ£o' = 'Não'; 'NÃO' = 'NÃO'
    'aÃ§Ã£o' = 'ação'; 'AÃ§Ã£o' = 'Ação'
    'informaÃ§Ã£o' = 'informação'
    'configuraÃ§Ã£o' = 'configuração'; 'ConfiguraÃ§Ã£o' = 'Configuração'
    'notificaÃ§Ã£o' = 'notificação'; 'NotificaÃ§Ã£o' = 'Notificação'
    'NOTIFICAÃ‡ÃƒO' = 'NOTIFICAÇÃO'
    'integraÃ§Ã£o' = 'integração'; 'IntegraÃ§Ã£o' = 'Integração'
    'verificaÃ§Ã£o' = 'verificação'
    'comunicaÃ§Ã£o' = 'comunicação'
    'condiÃ§Ã£o' = 'condição'
    'repetiÃ§Ã£o' = 'repetição'
    'criaÃ§Ã£o' = 'criação'
    'operaÃ§Ã£o' = 'operação'
    'soluÃ§Ã£o' = 'solução'
    'relaÃ§Ã£o' = 'relação'
    'conexÃ£o' = 'conexão'; 'ConexÃ£o' = 'Conexão'
    'sessÃ£o' = 'sessão'; 'SessÃ£o' = 'Sessão'
    'SESSÃ' = 'SESSÃ'
    'definiÃ§Ã£o' = 'definição'
    'excluÃ­do' = 'excluído'; 'ExcluÃ­do' = 'Excluído'
    'nÃºmero' = 'número'; 'NÃºmero' = 'Número'; 'nÃ³mero' = 'número'
    'telefone' = 'telefone'
    'Ã©' = 'é'; 'nÃ³' = 'nó'
    'serviÃ§o' = 'serviço'; 'ServiÃ§o' = 'Serviço'
    'comuicaÃ§Ã£o' = 'comunicação'
    'LIGAÃ‡ÃƒO' = 'LIGAÇÃO'
    'ligarÃ£o' = 'ligação'
    'inteligÃªncia' = 'inteligência'
    'atenÃ§Ã£o' = 'atenção'; 'AtenÃ§Ã£o' = 'Atenção'; 'ATENÃ‡ÃƒO' = 'ATENÇÃO'
    'apresentaÃ§Ã£o' = 'apresentação'
    'gerenciaÃ§Ã£o' = 'gerenciação'
    'funÃ§Ã£o' = 'função'; 'FunÃ§Ã£o' = 'Função'
    'posiÃ§Ã£o' = 'posição'; 'PosiÃ§Ã£o' = 'Posição'
    'execuÃ§Ã£o' = 'execução'
    'gravaÃ§Ã£o' = 'gravação'
    'publicaÃ§Ã£o' = 'publicação'
    'redirecionaÃ§Ã£o' = 'redirecionamento'
    'autenIcaÃ§Ã£o' = 'autenticação'; 'autenticaÃ§Ã£o' = 'autenticação'
    'permissÃ£o' = 'permissão'; 'PermissÃ£o' = 'Permissão'
    'mensagem' = 'mensagem'
    'tituÃ³lo' = 'título'; 'tÃ­tulo' = 'título'; 'TÃ­tulo' = 'Título'
    'prÃ³ximo' = 'próximo'; 'PrÃ³ximo' = 'Próximo'
    'ÃºltImo' = 'último'; 'Ãºltimo' = 'último'; 'ÃÃltimo' = 'Último'
    'perÃ­odo' = 'período'; 'PerÃ­odo' = 'Período'
    'histÃ³rico' = 'histórico'; 'HistÃ³rico' = 'Histórico'
    'automÃ¡tico' = 'automático'; 'AutomÃ¡tico' = 'Automático'; 'automÃ¡tica' = 'automática'
    'diagnÃ³stico' = 'diagnóstico'
    'prÃ³prio' = 'próprio'
    'especÃ­fico' = 'específico'; 'EspecÃ­fico' = 'Específico'
    'situaÃ§Ã£o' = 'situação'
    'atendÃªncia' = 'atendência'
    'tambÃ©m' = 'também'; 'TambÃ©m' = 'Também'
    'jÃ¡' = 'já'; 'JÃ¡' = 'Já'
    'vocÃª' = 'você'; 'VocÃª' = 'Você'
    'estÃ¡' = 'está'; 'EstÃ¡' = 'Está'
    'sÃ³' = 'só'; 'SÃ³' = 'Só'
    'pÃ¡gina' = 'página'; 'PÃ¡gina' = 'Página'
    'Ã©' = 'é'; 'nÃ£o' = 'não'
    'versÃ£o' = 'versão'; 'VersÃ£o' = 'Versão'
    'informaÃ§Ãµes' = 'informações'
    'configuraÃ§Ãµes' = 'configurações'; 'ConfiguraÃ§Ãµes' = 'Configurações'
    'notificaÃ§Ãµes' = 'notificações'; 'NotificaÃ§Ãµes' = 'Notificações'
    'soluÃ§Ãµes' = 'soluções'
    'funÃ§Ãµes' = 'funções'
    'sessÃµes' = 'sessões'
    'conexÃµes' = 'conexões'
    'mensagÃ©ns' = 'mensagens'
    'opÃ§Ã£o' = 'opção'; 'OpÃ§Ã£o' = 'Opção'; 'opÃ§Ãµes' = 'opções'; 'OpÃ§Ãµes' = 'Opções'
    'exceÃ§Ã£o' = 'exceção'; 'exceÃ§Ãµes' = 'exceções'
    'agendÃ¡rio' = 'agendário'; 'agendÃ¡' = 'agendá'
    'crÃ©dito' = 'crédito'; 'CrÃ©dito' = 'Crédito'
    'pÃºblico' = 'público'; 'PÃºblico' = 'Público'
    'anÃ¡lise' = 'análise'; 'AnÃ¡lise' = 'Análise'
    'resumo' = 'resumo'
    'envÃ­o' = 'envío'
    'prÃ©vio' = 'prévio'; 'PrÃ©vio' = 'Prévio'
    'Ã ' = 'à '
    'Ã¼' = 'ü'; 'Ã¶' = 'ö'; 'Ã¤' = 'ä'
}

$extensions = @("*.tsx", "*.ts", "*.jsx", "*.js", "*.css", "*.json")
$excludeDirs = @("node_modules", ".next", ".git", "dist", "build", "scripts")

$files = Get-ChildItem -Path $root -Recurse -Include $extensions -ErrorAction SilentlyContinue |
    Where-Object {
        $path = $_.FullName
        -not ($excludeDirs | Where-Object { $path -like "*\$_\*" })
    }

$fixedCount = 0
$fileCount = 0

foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    $original = $content

    foreach ($kvp in $replacements.GetEnumerator()) {
        $content = $content.Replace($kvp.Key, $kvp.Value)
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
        $fileCount++
        Write-Host "FIXED: $($file.FullName)"
    }
    $fixedCount++
}

Write-Host ""
Write-Host "=== ENCODING FIX COMPLETO ==="
Write-Host "Arquivos verificados: $fixedCount"
Write-Host "Arquivos corrigidos : $fileCount"
