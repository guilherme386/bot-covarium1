const axios = require('axios');
require('dotenv').config();

async function listModels() {
  const apiKey = process.env.NVIDIA_API_KEY;

  try {
    const response = await axios.get(
      'https://integrate.api.nvidia.com/v1/models',
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 30000
      }
    );

    const models = response.data?.data || [];
    const stepModels = models.filter(m =>
      m.id.toLowerCase().includes('step')
    );

    console.log('\n📋 Modelos STEP disponíveis:');
    stepModels.forEach(m => {
      console.log(`  - ${m.id}`);
    });

    if (stepModels.length === 0) {
      console.log('\nTodos os modelos disponíveis:');
      models.slice(0, 20).forEach(m => {
        console.log(`  - ${m.id}`);
      });
    }
  } catch (error) {
    console.log('Erro ao listar modelos:', error.response?.status);
    console.log(error.response?.data);
  }
}

listModels();
