const http = require('http');
const https = require('https');

const PORT = 8000;
const PROJECT_ID = "gen-lang-client-0279324764";
const MODEL = "gemini-3.1-pro-preview";
const LOCATION = "us-central1";

// Servidor que finge ser a API da Anthropic
http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        try {
            console.log(`[Router] Recebendo requisição: ${req.url}`);
            const anthropicRequest = JSON.parse(body);
            
            // Traduzir Anthropic -> Gemini (Vertex AI Format)
            const geminiRequest = {
                contents: anthropicRequest.messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                })),
                generationConfig: {
                    maxOutputTokens: anthropicRequest.max_tokens || 1024,
                    temperature: anthropicRequest.temperature || 0.7
                }
            };

            // Pegar Token do gcloud
            const child_process = require('child_process');
            const token = child_process.execSync('gcloud auth print-access-token').toString().trim();

            const options = {
                hostname: `${LOCATION}-aiplatform.googleapis.com`,
                path: `/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:streamGenerateContent`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            };

            const geminiReq = https.request(options, (geminiRes) => {
                res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                geminiRes.on('data', (d) => {
                    // Aqui precisaríamos de um parser de stream complexo para Traduzir Gemini Stream -> Anthropic Stream
                    // Para simplificar este teste inicial, vamos apenas logar ou enviar o dado
                    res.write(d); 
                });
                geminiRes.on('end', () => res.end());
            });

            geminiReq.on('error', (e) => {
                console.error(e);
                res.statusCode = 500;
                res.end();
            });

            geminiReq.write(JSON.stringify(geminiRequest));
            geminiReq.end();

        } catch (e) {
            console.error(e);
            res.statusCode = 500;
            res.end();
        }
    });
}).listen(PORT, () => {
    console.log(`🚀 Gemini Router Rodando em http://localhost:${PORT}`);
    console.log(`Configurado para: ${MODEL} no projeto ${PROJECT_ID}`);
});
