const https = require('https');
require('dotenv').config();

const apiKey = process.env.NVIDIA_API_KEY;

const payload = JSON.stringify({
  model: 'stepfun-ai/step-3.7-flash',
  messages: [
    { role: 'user', content: 'Olá, tudo bem?' }
  ],
  max_tokens: 100
});

const options = {
  hostname: 'integrate.api.nvidia.com',
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error(`Erro na requisição: ${e.message}`);
});

req.setTimeout(30000, () => {
  console.log('Timeout!');
  req.destroy();
});

req.write(payload);
req.end();
