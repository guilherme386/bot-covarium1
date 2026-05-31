const https = require('https');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com';

const SYSTEM_PROMPT_FOFO = `Você é o assistente virtual da Covarium. Seja calmo, educado e conversacional. Converse de forma natural com as pessoas. Use emojis com moderação se fizer sentido. Use português brasileiro.

SEU PAPEL:
1. Converse naturalmente. Responda perguntas de forma simples e direta, como quem está trocando ideia.
2. NÃO fale sobre a loja, produtos, vendas ou pagamentos a menos que a pessoa PERGUNTE explicitamente sobre esses assuntos.
3. Se a pessoa perguntar sobre produtos, vendas, preços ou pagamentos (PIX/DEPIX), responda normalmente e informe os produtos disponíveis.
4. Seja prestativo e tranquilo. Responda perguntas gerais como: quem descobriu o Brasil, quem é o homem mais rico do mundo, curiosidades, piadas, conversas de dia a dia, etc.
5. Aja como um amigo conversando — não force o tema da loja.`;

const SYSTEM_PROMPT_SUPORTE = `Você é o assistente de suporte e vendas da Covarium. Responda de forma direta e SEM emojis. Use português brasileiro, seja curto e direto ao ponto.

SEU PAPEL:
1. Converse de forma natural. Responda perguntas de forma simples e direta, como quem está trocando ideia.
2. NÃO fale sobre a loja, produtos, vendas ou pagamentos a menos que a pessoa PERGUNTE explicitamente sobre esses assuntos.
3. Se a pessoa perguntar sobre produtos, vendas, preços ou formas de pagamento, responda normalmente.
4. Seja prestativo. Responda perguntas gerais livremente (curiosidades, história, conhecimento geral, etc.).
5. Jamais invente preços ou produtos. Use apenas os listados abaixo se forem perguntados:
   - Cargo VIP Diamante — R$ 29,90 (30 dias, canais exclusivos)
   - Bot Personalizado (Básico) — R$ 150,00 (5 comandos personalizados)
   - Cargo VIP Ouro — R$ 20,90 (acesso VIP)
   - Assinatura Premium ETERNA — R$ 150,00 (acesso total e vitalício)
   - PIX — automático, confirmação instantânea
   - DEPIX — via Liquid Network, confirmação manual
6. Aja como um amigo conversando — não force o tema da loja.`;

const MAX_TOKENS = 2000;
const TIMEOUT_MS = 60000;

function chamarIA(systemPrompt, mensagem, historico = []) {
  return new Promise((resolve) => {
    if (!NVIDIA_API_KEY) {
      return resolve('❌ API Key não configurada.');
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historico,
      { role: 'user', content: mensagem }
    ];

    const payload = JSON.stringify({
      model: 'stepfun-ai/step-3.7-flash',
      messages,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      top_p: 0.9
    });

    const url = new URL('/v1/chat/completions', NVIDIA_BASE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return resolve('🔑 Chave da IA inválida. Verifique o .env.');
        }
        if (res.statusCode === 402) {
          return resolve('💰 Créditos insuficientes na API NVIDIA.');
        }
        if (res.statusCode === 429) {
          return resolve('⏳ Limite de requisições excedido.');
        }
        if (res.statusCode !== 200) {
          console.error(`Erro NVIDIA [${res.statusCode}]:`, data);
          return resolve('⚠️ Erro ao conectar com a IA.');
        }

        try {
          const parsed = JSON.parse(data);
          const choice = parsed?.choices?.[0];
          const msg = choice?.message || {};
          let text = msg.content;
          if (!text && msg.reasoning_content) text = msg.reasoning_content;
          if (!text && msg.reasoning) text = msg.reasoning;
          if (text) return resolve(text.trim());
          return resolve('⚠️ Não foi possível obter resposta.');
        } catch {
          return resolve('⚠️ Erro ao processar resposta.');
        }
      });
    });

    req.on('error', (e) => {
      console.error('Erro requisição NVIDIA:', e.message);
      resolve('⚠️ Erro ao conectar com a IA.');
    });

    req.setTimeout(TIMEOUT_MS, () => {
      console.error('Timeout requisição NVIDIA');
      req.destroy();
      resolve('⏳ A IA demorou para responder.');
    });

    req.write(payload);
    req.end();
  });
}

function enviarMensagemNVIDIA(mensagem, historico = []) {
  return chamarIA(SYSTEM_PROMPT_SUPORTE, mensagem, historico);
}

function enviarMensagemFofa(mensagem, historico = []) {
  return chamarIA(SYSTEM_PROMPT_FOFO, mensagem, historico);
}

module.exports = { enviarMensagemNVIDIA, enviarMensagemFofa };
