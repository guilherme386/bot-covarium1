const https = require('https');

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com';

const SYSTEM_PROMPT = `Você é o assistente de suporte e vendas da Covarium. Responda de forma direta, objetiva e SEM emojis. Use português brasileiro, seja curto e direto ao ponto. Não seja fofo, não use saudações simpáticas, não faça perguntas desnecessárias.

PRODUTOS DISPONÍVEIS:
- Cargo VIP Diamante — R$ 29,90 (30 dias de acesso a canais exclusivos)
- Bot Personalizado (Básico) — R$ 150,00 (5 comandos personalizados)
- Cargo VIP Ouro — R$ 20,90 (acesso VIP)
- Assinatura Premium ETERNA — R$ 150,00 (acesso total e vitalício)

PAGAMENTOS:
- PIX — automático, confirmação instantânea
- DEPIX — via Liquid Network (SideSwap), confirmação manual

SEU PAPEL:
1. Ajude o cliente a comprar: tire dúvidas, recomende produtos e direcione para a compra.
2. Se o cliente quiser comprar, PERGUNTE qual forma de pagamento ele prefere: PIX (automático, instantâneo) ou DEPIX (via Liquid Network, confirmação manual).
3. Se o cliente disser que usa PIX, diga: "Perfeito! O PIX é automático e a confirmação é instantânea. Para comprar com PIX, clique em Ver Produtos & Comprar no painel principal, escolha o produto e clique em **Pagar com PIX**."
4. Se o cliente disser que usa DEPIX, diga: "Tudo bem! Aceitamos DEPIX via Liquid Network. Clique em Ver Produtos & Comprar no painel principal, escolha o produto e clique em **Pagar com DEPIX**. A confirmação é manual pela nossa equipe."
5. Jamais invente preços ou produtos — use apenas os listados acima.
6. Se o cliente não disser qual método quer, PERGUNTE: "Você prefere pagar com PIX (automático) ou DEPIX (via Liquid Network)?"
7. Se for algo complexo: "Para mais detalhes, clique em Chamar Suporte para falar com um atendente humano."`;

const MAX_TOKENS = 2000;
const TIMEOUT_MS = 60000;

function enviarMensagemNVIDIA(mensagem, historico = []) {
  return new Promise((resolve) => {
    if (!NVIDIA_API_KEY) {
      return resolve('❌ API Key da NVIDIA não configurada. Configure NVIDIA_API_KEY no arquivo .env');
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
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
          return resolve('🔑 **Erro de autenticação na IA.** A chave da API NVIDIA parece inválida. Verifique o arquivo `.env`.');
        }
        if (res.statusCode === 402) {
          return resolve('💰 **Créditos insuficientes na API NVIDIA.** A conta pode não ter saldo disponível.');
        }
        if (res.statusCode === 429) {
          return resolve('⏳ **Limite de requisições excedido.** Aguarde um momento e tente novamente.');
        }
        if (res.statusCode !== 200) {
          console.error(`Erro NVIDIA API [${res.statusCode}]:`, data);
          return resolve('⚠️ Erro ao conectar com a IA. Tente novamente mais tarde.');
        }

        try {
          const parsed = JSON.parse(data);
          const choice = parsed?.choices?.[0];
          const msg = choice?.message || {};

          let text = msg.content;
          if (!text && msg.reasoning_content) {
            text = msg.reasoning_content;
          }
          if (!text && msg.reasoning) {
            text = msg.reasoning;
          }

          if (text) {
            return resolve(text.trim());
          }

          return resolve('⚠️ Não foi possível obter uma resposta da IA no momento. Tente novamente.');
        } catch {
          return resolve('⚠️ Erro ao processar resposta da IA.');
        }
      });
    });

    req.on('error', (e) => {
      console.error('Erro na requisição NVIDIA:', e.message);
      resolve('⚠️ Erro ao conectar com a IA. Tente novamente mais tarde.');
    });

    req.setTimeout(TIMEOUT_MS, () => {
      console.error('Timeout na requisição NVIDIA');
      req.destroy();
      resolve('⏳ A IA demorou para responder. Tente novamente.');
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { enviarMensagemNVIDIA };
