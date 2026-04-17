from anthropic import AnthropicVertex

try:
    client = AnthropicVertex(region='global', project_id='gen-lang-client-0279324764')
    message = client.messages.create(
        max_tokens=1024,
        messages=[{'role': 'user', 'content': 'Olá Opus! Estamos testando o acesso via Vertex API.'}],
        model='claude-opus-4-7'
    )
    print('\n--- RESPOSTA DO MODELO ---')
    print(message.content[0].text)
    print('--------------------------\n')
    print(' SUCESSO: Claude Opus 4.7 está Online!')
except Exception as e:
    print(f' ERRO: {str(e)}')
