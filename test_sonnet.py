from anthropic import AnthropicVertex

try:
    client = AnthropicVertex(region='global', project_id='gen-lang-client-0279324764')
    message = client.messages.create(
        max_tokens=1024,
        messages=[{'role': 'user', 'content': 'Oi Sonnet! Você está ativo?'}],
        model='claude-3-5-sonnet-v2@20241022'
    )
    print('\n--- RESPOSTA DO SONNET ---')
    print(message.content[0].text)
    print('--------------------------\n')
    print(' SUCESSO: Sonnet está Online!')
except Exception as e:
    print(f' ERRO: {str(e)}')
