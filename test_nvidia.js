const axios = require('axios');
require('dotenv').config();

async function testNVIDIA() {
  const apiKey = process.env.NVIDIA_API_KEY;
  const baseURL = 'https://integrate.api.nvidia.com/v1';

  console.log('API Key:', apiKey ? apiKey.substring(0, 10) + '...' : 'NÃO ENCONTRADA');
  console.log('Base URL:', baseURL);

  try {
    const response = await axios.post(
      `${baseURL}/chat/completions`,
      {
        model: 'stepfun/step-3.7-flash',
        messages: [
          { role: 'user', content: 'Olá, tudo bem?' }
        ],
        max_tokens: 100
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('\n✅ Conexão OK!');
    console.log('Status:', response.status);
    console.log('Resposta:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('\n❌ Erro!');
    console.log('Status:', error.response?.status);
    console.log('Data:', JSON.stringify(error.response?.data, null, 2));
    console.log('Mensagem:', error.message);
  }
}

testNVIDIA();
