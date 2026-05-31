const axios = require('axios');

const BASE_URL = 'https://updepix.cc/api/v1';

function getHeaders() {
    return {
        'Authorization': `Bearer ${process.env.UPDEPIX_TOKEN}`,
        'Content-Type': 'application/json'
    };
}

/**
 * Cria um depósito PIX com DEPIX caindo na carteira Liquid
 * @param {number} amount - Valor em reais
 * @param {string} walletId - ID da carteira DePix (opcional)
 */
async function criarDeposito(amount, walletId) {
    const body = { amount };
    if (walletId) body.wallet_id = walletId;
    const response = await axios.post(`${BASE_URL}/deposits`, body, { headers: getHeaders() });
    return response.data;
}

/**
 * Lista carteiras DePix cadastradas
 */
async function listarCarteiras() {
    const response = await axios.get(`${BASE_URL}/wallets`, { headers: getHeaders() });
    return response.data;
}

/**
 * Cadastra uma carteira DePix (Liquid Network)
 * @param {string} name - Nome da carteira
 * @param {string} address - Endereço Liquid (começa com lq1)
 */
async function cadastrarCarteira(name, address) {
    const response = await axios.post(`${BASE_URL}/wallets`, { name, address }, { headers: getHeaders() });
    return response.data;
}

/**
 * Busca os detalhes de um depósito pelo ID
 * @param {string} depositId - ID do depósito
 */
async function buscarDeposito(depositId) {
    const response = await axios.get(`${BASE_URL}/deposits/${depositId}`, { headers: getHeaders() });
    return response.data;
}

/**
 * Verifica o status de um depósito (força checagem no gateway)
 * @param {string} depositId - ID do depósito
 */
async function checkStatus(depositId) {
    const response = await axios.post(`${BASE_URL}/deposits/${depositId}/check-status`, {}, { headers: getHeaders() });
    return response.data;
}

/**
 * Retorna o saldo da conta
 */
async function getSaldo() {
    const response = await axios.get(`${BASE_URL}/balance`, { headers: getHeaders() });
    return response.data;
}

/**
 * Retorna informações da conta
 */
async function getConta() {
    const response = await axios.get(`${BASE_URL}/account`, { headers: getHeaders() });
    return response.data;
}

module.exports = { criarDeposito, buscarDeposito, checkStatus, getSaldo, getConta, listarCarteiras, cadastrarCarteira };
