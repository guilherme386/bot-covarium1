require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');

const updepix = require('./updepix');
const produtos = require('./produtos.json');
const nvidiaAI = require('./nvidia-ai');
const { enviarMensagemFofa } = require('./nvidia-ai-mention');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

console.log("🚀 Iniciando bot...");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.on('error', (err) => console.error('❌ Client error:', err.message));
client.on('warn', (warn) => console.warn('⚠️ Client warn:', warn));

const TEMPO_AUTO_DELETE = 5 * 60 * 1000;

const ephemeralQueue = new Set();

function agendarDelete(interaction, msgId) {
    const key = `${interaction.id}_${msgId}`;
    ephemeralQueue.add(key);
    setTimeout(async () => {
        try {
            await interaction.webhook.deleteMessage(msgId);
        } catch {}
        ephemeralQueue.delete(key);
    }, TEMPO_AUTO_DELETE);
}

async function replyE(interaction, content) {
  const res = await interaction.reply({ content, flags: MessageFlags.Ephemeral, withResponse: true });
  const msgId = res?.resource?.message?.id;
  if (msgId) agendarDelete(interaction, msgId);
  return res?.resource?.message;
}

async function followUpE(interaction, content) {
  const res = await interaction.followUp({ content, flags: MessageFlags.Ephemeral, withResponse: true });
  const msgId = res?.resource?.message?.id;
  if (msgId) agendarDelete(interaction, msgId);
  return res?.resource?.message;
}

const COR_PRINCIPAL = 0xFF6600;
const COR_SUCESSO = 0x00C853;
const COR_ERRO = 0xFF1744;
const COR_INFO = 0x29B6F6;

const conversationHistory = new Map();
const MAX_HISTORY = 20;

// ─────────────────────────────────────────────
// PERSISTÊNCIA DOS TICKETS (JSON)
// ─────────────────────────────────────────────
const TICKETS_FILE = path.join(__dirname, 'tickets.json');
let ticketsAtivos = new Map();

function carregarTickets() {
    try {
        if (fs.existsSync(TICKETS_FILE)) {
            const fileData = fs.readFileSync(TICKETS_FILE, 'utf-8');
            if (fileData.trim()) {
                const parsed = JSON.parse(fileData);
                ticketsAtivos = new Map(parsed);
                console.log(`💾 ${ticketsAtivos.size} tickets ativos carregados do banco de dados local.`);
            }
        }
    } catch (e) {
        console.error("❌ Erro ao carregar tickets.json:", e);
    }
}

function salvarTickets() {
    try {
        const data = JSON.stringify([...ticketsAtivos.entries()], null, 2);
        fs.writeFileSync(TICKETS_FILE, data, 'utf-8');
    } catch (e) {
        console.error("❌ Erro ao salvar tickets.json:", e);
    }
}

// Carregar ao iniciar
carregarTickets();

// ─────────────────────────────────────────────
// CONFIGURAÇÃO DE CARGOS (STAFF / MEMBER)
// ─────────────────────────────────────────────
const CONFIG_FILE = path.join(__dirname, 'config.json');
let config = { staff_roles: [], member_roles: [] };

function carregarConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
            if (data.trim()) {
                const parsed = JSON.parse(data);
                config.staff_roles = parsed.staff_roles || [];
                config.member_roles = parsed.member_roles || [];
            }
        }
    } catch (e) {
        console.error("❌ Erro ao carregar config.json:", e);
    }
}

function salvarConfig() {
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
}

function isLojaAberta() {
  return config.loja_aberta !== false;
}

function setLojaAberta(valor) {
  config.loja_aberta = valor === true || valor === 'true';
  salvarConfig();
}

carregarConfig();

function getStaffOverwrites() {
    return config.staff_roles.map(roleId => ({
        id: roleId,
        allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.SendMessages
        ],
        deny: []
    }));
}

function getMemberOverwrites() {
  return config.member_roles.map(roleId => ({
    id: roleId,
    deny: [PermissionFlagsBits.ViewChannel],
    allow: []
  }));
}

async function aplicarPermissoes(channel, overwrites) {
  for (const ow of overwrites) {
    try {
      await channel.permissionOverwrites.create(ow.id, {
        allow: ow.allow || [],
        deny: ow.deny || []
      });
    } catch (e) {
      console.error(`⚠️ Permissão ignorada para ${ow.id}: ${e.message}`);
    }
  }
}

function getNextTicketNumber() {
  let maxNum = 0;
  for (const [, t] of ticketsAtivos.entries()) {
    if (t.ticketNum && t.ticketNum > maxNum) maxNum = t.ticketNum;
  }
  return maxNum + 1;
}

async function criarEGerenciarAcessoTicket(channel, guild, ticketOwnerId) {
  const ticketNum = getNextTicketNumber();
  const roleName = `Atendimento #${ticketNum}`;
  let ticketRole;
  try {
    ticketRole = await guild.roles.create({
      name: roleName,
      color: 'Blurple',
      reason: `Cargo automático para ticket #${ticketNum}`
    });
  } catch (e) {
    console.error(`⚠️ Erro ao criar cargo do ticket:`, e.message);
    return null;
  }
  try {
    await channel.permissionOverwrites.create(ticketRole, {
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
      deny: []
    });
  } catch (e) {
    console.error(`⚠️ Erro ao definir permissões do cargo no canal:`, e.message);
  }
  try {
    const member = await guild.members.fetch(ticketOwnerId);
    if (member) await member.roles.add(ticketRole);
  } catch (e) {
    console.error(`⚠️ Erro ao dar cargo ao usuário do ticket:`, e.message);
  }
  for (const roleId of config.staff_roles) {
    try {
      const staffRole = guild.roles.cache.get(roleId);
      if (staffRole) {
        for (const member of staffRole.members.values()) {
          await member.roles.add(ticketRole).catch(() => {});
        }
      }
    } catch {}
  }
  try {
    const botMember = guild.members.me;
    if (botMember) await botMember.roles.add(ticketRole).catch(() => {});
  } catch {}
  return { roleId: ticketRole.id, ticketNum };
}

// ─────────────────────────────────────────────
// REGISTRAR CARTEIRA LIQUID (DEPIX)
// ─────────────────────────────────────────────
let depixWalletId = null;

async function registrarCarteiraDepix() {
    const address = process.env.DEPIX_WALLET_ADDRESS;
    if (!address) return;

    try {
        const lista = await updepix.listarCarteiras();
        const walletData = lista.data || lista;
        const existente = Array.isArray(walletData) && walletData.find(w => w.address === address);
        if (existente) {
            depixWalletId = existente.id;
            console.log(`✅ Carteira DEPIX encontrada: ${existente.name} (${depixWalletId})`);
            return;
        }

        const res = await updepix.cadastrarCarteira('SideSwap Bot', address);
        const nova = res.data || res;
        depixWalletId = nova.id;
        console.log(`✅ Carteira DEPIX cadastrada: ${nova.id}`);
    } catch (e) {
        console.error("⚠️ Não foi possível registrar carteira DEPIX:", e.response?.data?.detail || e.message);
    }
}

client.on('clientReady', async () => {
    await registrarCarteiraDepix();
    console.log(`================================================`);
    console.log(`✅ Bot logado como: ${client.user.tag}`);
    console.log(`📡 Sistema de Loja Segura e Atendimento 100% Pronto!`);
    if (config.staff_roles.length > 0) {
        console.log(`👥 Staff roles configurados: ${config.staff_roles.length} cargo(s)`);
    } else {
        console.log(`⚠️  Nenhum staff role configurado. Apenas admins verão os tickets.`);
    }
    if (config.member_roles.length > 0) {
        console.log(`🔒 Member roles configurados: ${config.member_roles.length} cargo(s)`);
    }
    for (const [id, guild] of client.guilds.cache) {
        const botMember = guild.members.me;
        if (botMember) {
            const hasMC = botMember.permissions.has(PermissionFlagsBits.ManageChannels);
            const botRolePos = botMember.roles.highest.position;
            const everyonePos = guild.roles.everyone.position;
            const staffInfo = config.staff_roles.map(id => {
                const r = guild.roles.cache.get(id);
                return r ? `${r.name} (pos ${r.position}, bot acima? ${botRolePos > r.position})` : `? (id ${id})`;
            }).join(', ');
            console.log(`📋 ${guild.name}: ManageChannels = ${hasMC ? '✅' : '❌'} | Bot role pos = ${botRolePos}`);
            if (staffInfo) console.log(`   Staff roles: ${staffInfo}`);
        }
    }
    console.log(`================================================`);
});

// ─────────────────────────────────────────────
// FUNÇÕES AUXILIARES DE SUPORTE
// ─────────────────────────────────────────────
async function pingarSuporte(guild) {
    const role = guild.roles.cache.find(r => 
        r.name.toLowerCase().includes('suporte') || 
        r.name.toLowerCase().includes('staff') || 
        r.name.toLowerCase().includes('atendimento') || 
        r.name.toLowerCase().includes('admin')
    );
    return role ? `<@&${role.id}>` : '@here';
}

// Limpa todas as mensagens enviadas pelo bot no canal para evitar poluição visual
async function limparMensagensDoBot(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 50 });
        const botMessages = messages.filter(m => m.author.id === client.user.id);
        for (const msg of botMessages.values()) {
            await msg.delete().catch(() => {});
        }
    } catch (e) {
        console.error("Erro ao limpar mensagens:", e);
    }
}

// ─────────────────────────────────────────────
// ENVIAR / RESTAURAR VITRINE DA LOJA
// ─────────────────────────────────────────────
async function enviarVitrine(channel, user) {
    const embed = new EmbedBuilder()
        .setColor(COR_PRINCIPAL)
        .setTitle('🏪 Bem-vindo à sua Loja Privada!')
        .setDescription(`Olá ${user}!\nEste é seu canal de compras exclusivo.\n\n🔒 **Seu chat está travado** para garantir total foco no pedido.\n🛍️ Selecione um produto no menu abaixo para iniciar sua compra.`)
        .addFields(
            { name: '🤖 Precisa de Ajuda?', value: 'A qualquer momento você pode clicar em **🙋‍♂️ Chamar Suporte** para destravar o chat e conversar com nossa equipe.' }
        )
        .setFooter({ text: 'Selecione um produto no menu abaixo' });

    const select = new StringSelectMenuBuilder()
        .setCustomId('menu_produtos')
        .setPlaceholder('Clique aqui para escolher um produto...')
        .addOptions(produtos.map(p => ({
            label: p.nome,
            description: `R$ ${p.preco.toFixed(2)} - ${p.descricao.substring(0, 50)}...`,
            value: p.id,
            emoji: '📦'
        })));

    const rowMenu = new ActionRowBuilder().addComponents(select);

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_human')
            .setLabel('Chamar Suporte')
            .setEmoji('🙋‍♂️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Fechar Loja')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [rowMenu, rowButtons] });
}

// ─────────────────────────────────────────────
// COMANDOS DE CHAT
// ─────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim().toLowerCase();

    // COMANDO !setup (Painel de abertura de loja)
    if (content === '!setup' && message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder()
            .setColor(COR_PRINCIPAL)
            .setTitle('🏪 Central de Atendimento & Compras')
            .setDescription('Seja muito bem-vindo! Clique em um dos botões abaixo para iniciar o seu atendimento.')
            .addFields(
                { name: '🛒 Ver Produtos & Comprar', value: 'Abra nossa vitrine interativa e compre via PIX automático.' },
                { name: '🎫 Suporte Geral', value: 'Tire suas dúvidas ou fale diretamente com a nossa equipe.' }
            )
            .setFooter({ text: 'Clique em um botão abaixo para iniciar' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_ver_produtos')
                    .setLabel('Ver Produtos & Comprar')
                    .setEmoji('🛒')
                    .setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setCustomId('btn_suporte_ia')
    .setLabel('Suporte Geral')
    .setEmoji('🎫')
    .setStyle(ButtonStyle.Primary),
  new ButtonBuilder()
    .setCustomId('btn_suporte_ia_bot')
    .setLabel('Suporte IA')
    .setEmoji('🤖')
    .setStyle(ButtonStyle.Secondary)
);

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply({ content: '✅ Painel de abertura configurado com sucesso!' }).catch(() => {});
    }

    // COMANDO !loja / !restaurar / !voltar (Restaura a loja e trava o chat)
    if (content === '!loja' || content === '!restaurar' || content === '!voltar') {
        const ticket = ticketsAtivos.get(message.channel.id);
        if (!ticket) return;

        // Apenas staff ou o próprio dono do ticket podem executar
        const isOwner = ticket.userId === message.author.id;
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
        if (!isOwner && !isAdmin) return;

        // Travar o chat do cliente novamente
        const member = await message.guild.members.fetch(ticket.userId).catch(() => null);
        if (member) {
            await message.channel.permissionOverwrites.edit(member.id, {
                SendMessages: false
            }).catch(() => {});
        }

        // Alterar estado
        ticket.state = 'loja';
        ticket.selectedProductId = null;
        ticketsAtivos.set(message.channel.id, ticket);
        salvarTickets();

        await limparMensagensDoBot(message.channel);
        await message.delete().catch(() => {}); // Deleta o comando digitado para manter limpo
        await enviarVitrine(message.channel, member || message.author);
        return;
    }

    // COMANDO !ajuda
    if (content === '!ajuda') {
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
        const embed = new EmbedBuilder()
            .setColor(COR_PRINCIPAL)
            .setTitle('📖 Central de Ajuda - Covarium Bot')
            .setDescription('Aqui estão os comandos do bot de vendas:')
            .addFields(
                { name: '🛒 Ativar Loja (No canal de atendimento)', value: '`!loja` ou `!restaurar` - Restaura a interface de compras e bloqueia o chat.' },
                { name: '🔒 Fechar Canal', value: '`!fechar` ou `!close` - Exclui o canal atual permanentemente.' }
            );

        if (isAdmin) {
            embed.addFields(
                { name: '🛠️ Comandos de Administrador', value: '`!setup` - Cria o painel de abertura de loja para os clientes.\n`!staff add/remove/list @role` - Gerencia cargos de staff (veem todos tickets).\n`!member add/remove/list @role` - Gerencia cargos de membro (negados dos tickets).' }
            );
        }

        return message.reply({ embeds: [embed] });
    }

// COMANDO !fechar_loja / !abrir_loja (apenas admin)
if ((content === '!fechar_loja' || content === '!abrir_loja') && message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
  const fechar = content === '!fechar_loja';
  setLojaAberta(!fechar);
  const status = fechar ? '🔒 **fechada**' : '🟢 **aberta**';
  return await message.reply(`✅ A loja está agora ${status}!`);
}

// COMANDO !loja_status (qualquer um pode ver)
if (content === '!loja_status') {
  const status = isLojaAberta() ? '🟢 **ABERTA**' : '🔒 **FECHADA**';
  return await message.reply(`📊 Status da loja: ${status}`);
}

// COMANDO !staff (add / remove / list)
if (content.startsWith('!staff')) {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Apenas administradores podem usar este comando.');
        }

        const args = message.content.split(/\s+/);
        const sub = (args[1] || '').toLowerCase();

        if (sub === 'add') {
            const role = message.mentions.roles.first();
            if (!role) return message.reply('❌ Mencione um cargo: `!staff add @role`');
            if (config.staff_roles.includes(role.id)) return message.reply('⚠️ Este cargo já é staff.');
            config.staff_roles.push(role.id);
            salvarConfig();
            return message.reply(`✅ **${role.name}** adicionado como staff. Veem todos os tickets.`);
        }

        if (sub === 'remove') {
            const role = message.mentions.roles.first();
            if (!role) return message.reply('❌ Mencione um cargo: `!staff remove @role`');
            const idx = config.staff_roles.indexOf(role.id);
            if (idx === -1) return message.reply('⚠️ Este cargo não está na lista de staff.');
            config.staff_roles.splice(idx, 1);
            salvarConfig();
            return message.reply(`✅ **${role.name}** removido dos staffs.`);
        }

        if (sub === 'list') {
            if (config.staff_roles.length === 0) return message.reply('📭 Nenhum cargo staff configurado.');
            const roles = config.staff_roles.map(id => `<@&${id}>`).join('\n');
            return message.reply(`**Cargos Staff (${config.staff_roles.length}):**\n${roles}`);
        }

        return message.reply('❌ Use: `!staff add @role`, `!staff remove @role`, ou `!staff list`');
    }

    // COMANDO !member (add / remove / list)
    if (content.startsWith('!member')) {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Apenas administradores podem usar este comando.');
        }

        const args = message.content.split(/\s+/);
        const sub = (args[1] || '').toLowerCase();

        if (sub === 'add') {
            const role = message.mentions.roles.first();
            if (!role) return message.reply('❌ Mencione um cargo: `!member add @role`');
            if (config.member_roles.includes(role.id)) return message.reply('⚠️ Este cargo já está na lista de membros.');
            config.member_roles.push(role.id);
            salvarConfig();
            return message.reply(`✅ **${role.name}** adicionado como membro. Bloqueado dos tickets.`);
        }

        if (sub === 'remove') {
            const role = message.mentions.roles.first();
            if (!role) return message.reply('❌ Mencione um cargo: `!member remove @role`');
            const idx = config.member_roles.indexOf(role.id);
            if (idx === -1) return message.reply('⚠️ Este cargo não está na lista de membros.');
            config.member_roles.splice(idx, 1);
            salvarConfig();
            return message.reply(`✅ **${role.name}** removido dos membros.`);
        }

        if (sub === 'list') {
            if (config.member_roles.length === 0) return message.reply('📭 Nenhum cargo membro configurado.');
            const roles = config.member_roles.map(id => `<@&${id}>`).join('\n');
            return message.reply(`**Cargos Membro (${config.member_roles.length}):**\n${roles}`);
        }

        return message.reply('❌ Use: `!member add @role`, `!member remove @role`, ou `!member list`');
    }

// COMANDO !close / !fechar
if (content === '!close' || content === '!fechar') {
  const isTicket = ticketsAtivos.has(message.channel.id);
  if (!isTicket) return;

  const ticket = ticketsAtivos.get(message.channel.id);
  ticketsAtivos.delete(message.channel.id);
  conversationHistory.delete(message.channel.id);
  salvarTickets();

  if (ticket?.ticketRoleId) {
    const guild = message.guild;
    if (guild) {
      try {
        const role = guild.roles.cache.get(ticket.ticketRoleId);
        if (role) await role.delete().catch(() => {});
      } catch {}
    }
  }

  const embed = new EmbedBuilder()
    .setColor(COR_ERRO)
    .setTitle('🔒 Canal Sendo Encerrado')
    .setDescription('O canal será excluído permanentemente em 5 segundos...');

  await message.reply({ embeds: [embed] });
  setTimeout(() => { if (message.channel) message.channel.delete().catch(() => {}); }, 5000);
}

  // INTEGRAÇÃO COM IA — responde APENAS em loja e suporte_ia (NUNCA em suporte humano)
  const ticket = ticketsAtivos.get(message.channel.id);
  if (ticket && message.author.id === ticket.userId && !message.author.bot) {
    const state = ticket.state;
    if (state === 'loja' || state === 'suporte_ia') {
      if (state === 'suporte') {
        console.log('[IA] Ignorando mensagem em suporte humano (state=suporte)');
        return;
      }
      let botMsg;
      try {
        botMsg = await message.channel.send({ content: '💭 Processando sua mensagem, aguarde um instante...' });
      } catch {
        botMsg = null;
      }

      try { await message.channel.sendTyping(); } catch {}

      const history = conversationHistory.get(message.channel.id) || [];
      const resposta = await nvidiaAI.enviarMensagemNVIDIA(message.content, history);

      history.push({ role: 'user', content: message.content });
      history.push({ role: 'assistant', content: resposta });
      while (history.length > MAX_HISTORY) history.shift();
      conversationHistory.set(message.channel.id, history);

  if (botMsg) {
    try { await botMsg.edit({ content: resposta }); } catch {}
    setTimeout(() => { botMsg.delete().catch(() => {}); }, TEMPO_AUTO_DELETE);
  } else {
    await message.reply(resposta);
  }
}

  }

  // MENCIONAR O BOT (@Covarium Store Bot) — responde de forma fofa com emojis
  if (message.mentions.has(client.user)) {
    const plainContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    if (plainContent.length === 0) return;

    let botMsg;
    try {
      botMsg = await message.channel.send({ content: '✨ Deixa eu pensar um pouquinho...' });
    } catch {
      botMsg = null;
    }

    try { await message.channel.sendTyping(); } catch {}

    const respostaFofa = await enviarMensagemFofa(plainContent);

  if (botMsg) {
    try { await botMsg.edit({ content: respostaFofa }); } catch {}
    setTimeout(() => { botMsg.delete().catch(() => {}); }, TEMPO_AUTO_DELETE);
  } else {
    await message.reply(respostaFofa);
  }

  }
});

// ─────────────────────────────────────────────
// INTERAÇÕES (Botões e Dropdowns)
// ─────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            const customId = interaction.customId;
            const parts = customId.split('_');
            const action = parts[0];
            const param1 = customId.substring(action.length + 1);

// 1. CLIQUE EM "VER PRODUTOS & COMPRAR"
  if (customId === 'btn_ver_produtos' || customId === 'btn_abrir_loja') {
    if (!isLojaAberta()) {
      return await replyE(interaction, '🔒 A loja está **fechada** no momento. Volte mais tarde!');
    }
    const guild = interaction.guild;
    const user = interaction.user;

    // Verificar se o usuário já possui um canal de loja ativo
                let canalExistente = null;
                for (const [id, t] of ticketsAtivos.entries()) {
                    if (t.userId === user.id) {
                        const ch = guild.channels.cache.get(id);
                        if (ch) {
                            canalExistente = ch;
                            break;
                        } else {
                            // Limpeza de canal deletado manualmente
                            ticketsAtivos.delete(id);
                        }
                    }
                }

                if (canalExistente) {
                    return await replyE(interaction, '❌ Você já possui uma loja aberta em: ' + canalExistente);
                }

                await replyE(interaction, '⏳ Criando sua loja privada, aguarde...');

                // Criar canal de texto privado com chat travado para o cliente
const channel = await guild.channels.create({
  name: `🛒-loja-${user.username}`,
  type: ChannelType.GuildText
});

// Aplicar permissões uma por uma pra não falhar tudo se um cargo der erro
await aplicarPermissoes(channel, [
  { id: guild.id, deny: [PermissionFlagsBits.ViewChannel], allow: [] },
  { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages], deny: [] },
  ...getStaffOverwrites()
]);

const ticketInfo = await criarEGerenciarAcessoTicket(channel, guild, user.id);

// Salvar dados
ticketsAtivos.set(channel.id, {
  userId: user.id,
  state: 'loja',
  selectedProductId: null,
  ticketRoleId: ticketInfo?.roleId || null,
  ticketNum: ticketInfo?.ticketNum || 0
});
salvarTickets();

                // Enviar Vitrine Inicial
                await enviarVitrine(channel, user);

                return await followUpE(interaction, `✅ Sua loja privada foi aberta com sucesso em: ${channel}`);
            }

// 1B. CLIQUE EM "SUPORTE GERAL" (humano)
  if (customId === 'btn_suporte_ia') {
    const guild = interaction.guild;
    const user = interaction.user;

    if (!isLojaAberta()) {
      return await replyE(interaction, '🔒 A loja está **fechada** no momento. Volte mais tarde!');
    }

    let canalExistente = null;
                for (const [id, t] of ticketsAtivos.entries()) {
                    if (t.userId === user.id) {
                        const ch = guild.channels.cache.get(id);
                        if (ch) {
                            canalExistente = ch;
                            break;
                        } else {
                            ticketsAtivos.delete(id);
                        }
                    }
                }

                if (canalExistente) {
                    return await replyE(interaction, '❌ Você já possui um atendimento aberto em: ' + canalExistente);
                }

await replyE(interaction, '⏳ Criando seu canal de suporte, aguarde...');

const channel = await guild.channels.create({
  name: 'suporte-' + user.username,
  type: ChannelType.GuildText
});

// Aplicar permissões uma por uma pra não falhar tudo se um cargo der erro
await aplicarPermissoes(channel, [
  { id: guild.id, deny: [PermissionFlagsBits.ViewChannel], allow: [] },
  { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages], deny: [] },
  ...getStaffOverwrites()
]);

const ticketInfo = await criarEGerenciarAcessoTicket(channel, guild, user.id);

ticketsAtivos.set(channel.id, {
  userId: user.id,
  state: 'suporte',
  selectedProductId: null,
  ticketRoleId: ticketInfo?.roleId || null,
  ticketNum: ticketInfo?.ticketNum || 0
});
salvarTickets();

await limparMensagensDoBot(channel);

                const ment = await pingarSuporte(guild);

                const embed = new EmbedBuilder()
                    .setColor(COR_INFO)
                    .setTitle('🎫 Suporte Geral Ativado!')
                    .setDescription(`Olá ${user}!\n\nEste é seu canal de **Suporte Geral**. Nossa equipe vai te atender em breve.\n\n💬 **Mande sua mensagem!**`)
                    .setFooter({ text: 'A equipe de suporte foi notificada e responderá em breve.' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_voltar_vitrine')
                        .setLabel('Ir para a Loja')
                        .setEmoji('🛒')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ticket_close')
                        .setLabel('Fechar Atendimento')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                await channel.send({ content: `🔔 ${ment}, ${user} abriu um suporte!`, embeds: [embed], components: [row] });

  return await followUpE(interaction, `✅ Seu canal de suporte foi aberto em: ${channel}`);
}

// 1C. CLIQUE EM "SUPORTE IA" (atendimento por inteligência artificial)
  if (customId === 'btn_suporte_ia_bot') {
    const guild = interaction.guild;
    const user = interaction.user;

    if (!isLojaAberta()) {
      return await replyE(interaction, '🔒 A loja está **fechada** no momento. Volte mais tarde!');
    }

    let canalExistente = null;
  for (const [id, t] of ticketsAtivos.entries()) {
    if (t.userId === user.id) {
      const ch = guild.channels.cache.get(id);
      if (ch) {
        canalExistente = ch;
        break;
      } else {
        ticketsAtivos.delete(id);
      }
    }
  }

  if (canalExistente) {
    return await replyE(interaction, '❌ Você já possui um atendimento aberto em: ' + canalExistente);
  }

  await replyE(interaction, '⏳ Criando seu atendimento com IA, aguarde...');

  const channel = await guild.channels.create({
    name: 'ia-suporte-' + user.username,
    type: ChannelType.GuildText
  });

await aplicarPermissoes(channel, [
  { id: guild.id, deny: [PermissionFlagsBits.ViewChannel], allow: [] },
  { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages], deny: [] },
  ...getStaffOverwrites()
]);

const ticketInfo = await criarEGerenciarAcessoTicket(channel, guild, user.id);

ticketsAtivos.set(channel.id, {
  userId: user.id,
  state: 'suporte_ia',
  selectedProductId: null,
  ticketRoleId: ticketInfo?.roleId || null,
  ticketNum: ticketInfo?.ticketNum || 0
});
salvarTickets();

  await limparMensagensDoBot(channel);

  const embed = new EmbedBuilder()
    .setColor(COR_INFO)
    .setTitle('🤖 Suporte com Inteligência Artificial')
    .setDescription(`Olá ${user}!\n\nEste é seu canal de **Suporte IA**. Envie sua dúvida e nosso assistente virtual vai te ajudar!\n\n💬 **Mande sua mensagem!**`)
    .setFooter({ text: 'Powered by Step 3.7 Flash | Se precisar de humano, clique em "Chamar Suporte"' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_human')
      .setLabel('Chamar Suporte Humano')
      .setEmoji('🙋‍♂️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Fechar Atendimento')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row] });
  return await followUpE(interaction, `✅ Seu atendimento com IA foi aberto em: ${channel}`);
}

// 2. RETORNAR À VITRINE
if (customId === 'btn_voltar_vitrine') {
                const ticket = ticketsAtivos.get(interaction.channel.id);
                if (!ticket) return;

                ticket.selectedProductId = null;
                ticketsAtivos.set(interaction.channel.id, ticket);
                salvarTickets();

                await limparMensagensDoBot(interaction.channel);
                await enviarVitrine(interaction.channel, interaction.user);
                return;
            }

            // 3. CHAMAR SUPORTE (Destrava chat, adiciona staff, limpa painel)
            if (customId === 'ticket_human') {
                const ticket = ticketsAtivos.get(interaction.channel.id);
                if (!ticket) return;

                // Mudar estado para suporte
                ticket.state = 'suporte';
                ticketsAtivos.set(interaction.channel.id, ticket);
                salvarTickets();

                // Destravar chat do cliente
                await interaction.channel.permissionOverwrites.edit(ticket.userId, {
                    SendMessages: true
                }).catch(() => {});

                // Limpar mensagens do bot (para não ficar feio com o menu de compras)
                await limparMensagensDoBot(interaction.channel);

                // Pingar suporte
                const ment = await pingarSuporte(interaction.guild);

                const embed = new EmbedBuilder()
                    .setColor(COR_INFO)
                    .setTitle('🙋‍♂️ Atendimento Humano Ativado')
                    .setDescription(`Olá ${interaction.user}!\nEste canal agora está liberado para conversação. Nossa equipe de suporte já foi notificada e entrará em instantes.\n\n💬 **Diga-nos:** Como podemos te ajudar hoje?`)
                    .setFooter({ text: 'Use o botão ou digite !loja para voltar à vitrine de compras' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_restore_loja')
                        .setLabel('Voltar para a Loja')
                        .setEmoji('🛒')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ticket_close')
                        .setLabel('Fechar Ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                await interaction.channel.send({ content: `🔔 ${ment}, suporte solicitado por ${interaction.user}!`, embeds: [embed], components: [row] });
                return;
            }

            // 4. RESTAURAR LOJA VIA BOTÃO
            if (customId === 'ticket_restore_loja') {
                const ticket = ticketsAtivos.get(interaction.channel.id);
                if (!ticket) return;

                // Travar o chat do cliente novamente
                await interaction.channel.permissionOverwrites.edit(ticket.userId, {
                    SendMessages: false
                }).catch(() => {});

                // Alterar estado
                ticket.state = 'loja';
                ticket.selectedProductId = null;
                ticketsAtivos.set(interaction.channel.id, ticket);
                salvarTickets();

                await limparMensagensDoBot(interaction.channel);
                await enviarVitrine(interaction.channel, interaction.user);
                return;
            }

// 5. FECHAR TICKET / CANAL
if (customId === 'ticket_close') {
  const ticket = ticketsAtivos.get(interaction.channel.id);
  ticketsAtivos.delete(interaction.channel.id);
  conversationHistory.delete(interaction.channel.id);
  salvarTickets();

  if (ticket?.ticketRoleId) {
    try {
      const guild = interaction.guild;
      if (guild) {
        const role = guild.roles.cache.get(ticket.ticketRoleId);
        if (role) await role.delete().catch(() => {});
      }
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setColor(COR_ERRO)
    .setTitle('🔒 Fechando Canal')
    .setDescription('Este canal de atendimento será excluído permanentemente em 5 segundos...');

  await interaction.reply({ embeds: [embed] });
  return setTimeout(() => { if (interaction.channel) interaction.channel.delete().catch(() => {}); }, 5000);
}

// 6. PAGAR PIX
            if (action === 'pix') {
                return await gerarPagamentoPix(interaction, param1);
            }

            // 6B. PAGAR DEPIX (crypto direto na Liquid Network)
            if (action === 'depix') {
                return await gerarPagamentoDepix(interaction, param1);
            }

// 6C. JÁ PAGUEI (DEPIX) — abre suporte pra confirmar manualmente
  if (action === 'ja' && parts[1] === 'paguei') {
    const prodIdParts = customId.split('_');
    const prodId = prodIdParts.slice(2).join('_');
    return await abrirConfirmacaoDepix(interaction, prodId);
  }

  // 6D. CONFIRMAR VENDA (Staff) — confirmação manual do pagamento
  if (action === 'confirmar' && parts[1] === 'venda') {
    const prodIdParts = customId.split('_');
    const prodId = prodIdParts.slice(2).join('_');
    return await confirmarManualmente(interaction, prodId);
  }

  // 7. VERIFICAR PAGAMENTO
  if (action === 'check') {
    return await verificarPagamento(interaction, param1);
  }
        }

        // INTERAÇÃO COM DROPDOWN DE PRODUTOS
        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_produtos') {
            const prodId = interaction.values[0];
            const produto = produtos.find(p => p.id === prodId);
            if (!produto) return;

            const ticket = ticketsAtivos.get(interaction.channel.id);
            if (ticket) {
                ticket.selectedProductId = prodId;
                ticketsAtivos.set(interaction.channel.id, ticket);
                salvarTickets();
            }

            await limparMensagensDoBot(interaction.channel);

            const embed = new EmbedBuilder()
                .setColor(COR_SUCESSO)
                .setTitle(`📦 Detalhes do Produto: ${produto.nome}`)
                .setDescription(`*${produto.descricao}*\n\n💵 **Preço:** R$ ${produto.preco.toFixed(2)}\n\n💸 **PIX (recomendado):** Pagamento instantâneo, confirmação automática.\n🪙 **DEPIX:** Pagamento via Liquid Network. Pode demorar mais até a confirmação manual.\n\nSelecione a forma de pagamento abaixo!`);

            const select = new StringSelectMenuBuilder()
                .setCustomId('menu_produtos')
                .setPlaceholder('Escolher outro produto...')
                .addOptions(produtos.map(p => ({
                    label: p.nome,
                    description: `R$ ${p.preco.toFixed(2)}`,
                    value: p.id,
                    emoji: '📦'
                })));

const rowMenu = new ActionRowBuilder().addComponents(select);

      const rowBotoes = [new ButtonBuilder()
        .setCustomId(`pix_${produto.id}`)
        .setLabel('Pagar com PIX')
        .setEmoji('💸')
        .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`depix_${produto.id}`)
          .setLabel('Pagar com DEPIX')
          .setEmoji('🪙')
          .setStyle(ButtonStyle.Success)];

      if (interaction.member && config.staff_roles.some(rid => interaction.member.roles.cache.has(rid))) {
        rowBotoes.push(
          new ButtonBuilder()
            .setCustomId(`confirmar_venda_${produto.id}`)
            .setLabel('Confirmar Venda (Staff)')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Primary)
        );
      }

      rowBotoes.push(
        new ButtonBuilder()
          .setCustomId('btn_voltar_vitrine')
          .setLabel('Voltar à Vitrine')
          .setEmoji('🔙')
          .setStyle(ButtonStyle.Secondary)
      );

      const rowButtons = new ActionRowBuilder().addComponents(rowBotoes);

            await interaction.channel.send({ embeds: [embed], components: [rowMenu, rowButtons] });
            await replyE(interaction, `✅ Você selecionou **${produto.nome}**!`).catch(() => {});
        }

    } catch (e) {
        console.error("Erro em interactionCreate:", e);
    }
});
// ─────────────────────────────────────────────
// INTEGRAÇÃO UPDEPIX (GERAR / VERIFICAR PIX)
// ─────────────────────────────────────────────
async function gerarPagamentoPix(interaction, prodId) {
    const produto = produtos.find(p => p.id === prodId);
    if (!produto) {
        return await replyE(interaction, '❌ Produto não encontrado.');
    }

    await replyE(interaction, '⏳ Gerando QR Code PIX...');

    try {
        const data = await updepix.criarDeposito(produto.preco);
        const deposito = data.data || data;
        
        const id = deposito.id || deposito.deposit_id;
        const copiaCola = deposito.qr_copy_paste || deposito.pix_code || deposito.brcode || deposito.copy_paste || deposito.qr_code;
        const qrUrl = deposito.qr_image_url || deposito.qr_code_url || deposito.qr_image;

        if (!copiaCola) {
            throw new Error("Resposta inválida do provedor de pagamentos.");
        }

        // Limpar mensagens de compras anteriores para focar no pagamento
        await limparMensagensDoBot(interaction.channel);

        const agora = Math.floor(Date.now() / 1000);
        const tsExpiracao = deposito.expires_at ? Math.floor(new Date(deposito.expires_at).getTime() / 1000) : null;
        const expirado = tsExpiracao ? tsExpiracao <= agora : false;
        const tsCriacao = deposito.created_at ? Math.floor(new Date(deposito.created_at).getTime() / 1000) : null;

        // Processar imagem do QR Code com overlay da logo
        let imagemQr = null;
        const logoPath = path.join(__dirname, 'logo.png');
        if (qrUrl && fs.existsSync(logoPath)) {
            try {
                const qrResponse = await axios.get(qrUrl, { responseType: 'arraybuffer' });
                const qrBuffer = Buffer.from(qrResponse.data);
                const logoSize = 52;
                const logoRedimensionada = await sharp(logoPath)
                    .resize(logoSize, logoSize, { fit: 'inside' })
                    .png()
                    .toBuffer();
                const processed = await sharp(qrBuffer)
                    .resize(400, 400, { fit: 'inside' })
                    .composite([{
                        input: logoRedimensionada,
                        gravity: 'center',
                    }])
                    .png()
                    .toBuffer();
                imagemQr = new AttachmentBuilder(processed, { name: 'qrcode.png' });
            } catch (e) {
                console.error("Erro ao processar imagem QR:", e.message);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(expirado ? COR_ERRO : COR_PRINCIPAL)
            .setTitle(expirado ? '⏰ PIX Expirado!' : '💳 Pagamento PIX Gerado!')
            .setDescription(expirado
                ? `Este PIX já expirou e não pode mais ser pago.\n\n🛒 **Produto:** ${produto.nome}\n💰 **Valor:** R$ ${produto.preco.toFixed(2)}\n\nClique em **Voltar** para gerar um novo.`
                : `Efetue o pagamento do PIX para receber seu produto automaticamente.\n\n🛒 **Produto:** ${produto.nome}\n💰 **Valor:** R$ ${produto.preco.toFixed(2)}`)
            .addFields(
                { name: '🔖 ID do PIX', value: `\`${id}\``, inline: true },
                { name: '📋 Pix Copia e Cola', value: `\`\`\`${copiaCola}\`\`\`` },
                ...(tsExpiracao && !expirado ? [
                    { name: '📅 Expira em', value: `<t:${tsExpiracao}:f>`, inline: true }
                ] : []),
                ...(expirado ? [
                    { name: '⏰ Expirado em', value: `<t:${tsExpiracao}:f>`, inline: true }
                ] : [])
            )
            .setImage(!expirado && imagemQr ? 'attachment://qrcode.png' : null)
            .setFooter({ text: expirado ? 'Gere um novo PIX clicando em Voltar.' : 'Pague e clique em "Verificar Pagamento" abaixo.' });

        const row = new ActionRowBuilder().addComponents(
            ...(!expirado ? [new ButtonBuilder()
                .setCustomId(`check_${id}`)
                .setLabel('Verificar Pagamento')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary)] : []),
            new ButtonBuilder()
                .setCustomId('ticket_human')
                .setLabel('Chamar Suporte')
                .setEmoji('🙋‍♂️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('btn_voltar_vitrine')
                .setLabel('Cancelar / Voltar')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.channel.send({ embeds: [embed], components: [row], files: !expirado && imagemQr ? [imagemQr] : [] });
    } catch (error) {
        console.error("Erro ao gerar PIX/DEPIX:", error.response?.data || error.message || error);
        await followUpE(interaction, `❌ Erro: ${error.response?.data?.message || error.message || 'Falha ao conectar com provedor de pagamentos.'}`);
    }
}

// ─────────────────────────────────────────────
// PAGAMENTO DEPIX (crypto direto na Liquid Network)
// ─────────────────────────────────────────────
async function gerarPagamentoDepix(interaction, prodId) {
    const produto = produtos.find(p => p.id === prodId);
    if (!produto) {
        return await replyE(interaction, '❌ Produto não encontrado.');
    }

    const walletAddress = process.env.DEPIX_WALLET_ADDRESS;
    if (!walletAddress) {
        return await replyE(interaction, '❌ Carteira DEPIX não configurada.');
    }

    await replyE(interaction, '⏳ Gerando pagamento DEPIX...');

    try {
        await limparMensagensDoBot(interaction.channel);

        // Gerar QR Code com o endereço da carteira Liquid
        let imagemQr = null;
        const logoPath = path.join(__dirname, 'logo.png');
        try {
            const qrResponse = await axios.get(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(walletAddress)}`, { responseType: 'arraybuffer' });
            const qrBuffer = Buffer.from(qrResponse.data);
            if (fs.existsSync(logoPath)) {
                const logoSize = 52;
                const padding = 8;
                const bgSize = logoSize + padding * 2;
                const logoRedimensionada = await sharp(logoPath)
                    .resize(logoSize, logoSize, { fit: 'inside' })
                    .png()
                    .toBuffer();
                const logoComFundo = await sharp({
                    create: {
                        width: bgSize,
                        height: bgSize,
                        channels: 4,
                        background: { r: 255, g: 255, b: 255, alpha: 1 }
                    }
                })
                    .composite([{ input: logoRedimensionada, top: padding, left: padding }])
                    .png()
                    .toBuffer();
                const processed = await sharp(qrBuffer)
                    .resize(400, 400, { fit: 'inside' })
                    .composite([{ input: logoComFundo, gravity: 'center' }])
                    .png()
                    .toBuffer();
                imagemQr = new AttachmentBuilder(processed, { name: 'depix_qr.png' });
            } else {
                imagemQr = new AttachmentBuilder(qrBuffer, { name: 'depix_qr.png' });
            }
        } catch (e) {
            console.error("Erro ao gerar QR Code DEPIX:", e.message);
        }

        const embed = new EmbedBuilder()
            .setColor(COR_INFO)
            .setTitle('🪙 Pagamento DEPIX (Liquid Network)')
            .setDescription(`Envie **DEPIX** diretamente da sua carteira **SideSwap** para o endereço abaixo:\n\n🛒 **Produto:** ${produto.nome}\n💰 **Valor:** R$ ${produto.preco.toFixed(2)} (equivalente em DEPIX)`)
            .addFields(
                { name: '📍 Endereço da Carteira', value: `\`\`\`${walletAddress}\`\`\`` },
                { name: '🔗 Rede', value: 'Liquid Network', inline: true },
                { name: '📱 Aplicativo', value: 'SideSwap (ou qualquer wallet Liquid)', inline: true }
            )
            .setImage(imagemQr ? 'attachment://depix_qr.png' : null)
            .setFooter({ text: 'Escaneie o QR Code ou copie o endereço acima e envie o DEPIX.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ja_paguei_${produto.id}`)
                .setLabel('Já paguei')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('btn_voltar_vitrine')
                .setLabel('Cancelar / Voltar')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.channel.send({ embeds: [embed], components: [row], files: imagemQr ? [imagemQr] : [] });
    } catch (error) {
        console.error("Erro ao gerar DEPIX:", error);
        await followUpE(interaction, '❌ Erro ao gerar pagamento DEPIX. Tente novamente ou chame o suporte.');
    }
}

// ─────────────────────────────────────────────
// CONFIRMAÇÃO MANUAL DE DEPIX ("Já paguei")
// ─────────────────────────────────────────────
async function abrirConfirmacaoDepix(interaction, prodId) {
    const produto = produtos.find(p => p.id === prodId);
    const ticket = ticketsAtivos.get(interaction.channel.id);
    if (!ticket) {
        await interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
        return;
    }

    ticket.state = 'suporte';
    ticketsAtivos.set(interaction.channel.id, ticket);
    salvarTickets();

    const deferredRes = await interaction.deferReply({ flags: MessageFlags.Ephemeral, withResponse: true });
    const deferred = deferredRes.resource.message;

    await interaction.channel.permissionOverwrites.edit(ticket.userId, {
        SendMessages: true
    }).catch(() => {});

    await limparMensagensDoBot(interaction.channel);

    const ment = await pingarSuporte(interaction.guild);

    const embed = new EmbedBuilder()
        .setColor(COR_INFO)
        .setTitle('✅ DEPIX — Aguardando Confirmação Manual')
        .setDescription(`Olá ${interaction.user}!\n\nVocê informou que pagou via DEPIX. Nossa equipe de suporte vai confirmar manualmente.\n\n**Para agilizar, informe os dados abaixo:**`)
        .addFields(
            { name: '📌 TX Hash (ID da transação)', value: 'Cole o hash da transação no chat.' },
            { name: '💰 Valor enviado', value: 'Informe o valor em DEPIX que você enviou.' },
            { name: '📅 Data/Hora', value: 'Quando você fez o envio?' },
            { name: '👛 Carteira de origem', value: 'Endereço Liquid de onde enviou (opcional).' }
        )
        .setFooter({ text: 'Envie as informações acima no chat. O staff já foi notificado.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_voltar_vitrine')
            .setLabel('Voltar para a Loja')
            .setEmoji('🛒')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Fechar Atendimento')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ content: `🔔 ${ment}, ${interaction.user} solicitou confirmação manual de pagamento DEPIX!`, embeds: [embed], components: [row] });
    await interaction.editReply({ content: '✅ Suporte notificado! Envie os dados da transação no chat.' });
    agendarDelete(interaction, deferred.id);
}

async function verificarPagamento(interaction, depositId) {
    await replyE(interaction, '🔍 Consultando status do PIX...');

    try {
        await updepix.checkStatus(depositId);
        const data = await updepix.buscarDeposito(depositId);
        const deposito = data.data || data;

        const status = (deposito.status || '').toLowerCase();
        const expirado = status === 'expired' || status === 'expirou' || (
            deposito.expires_at && Math.floor(new Date(deposito.expires_at).getTime() / 1000) <= Math.floor(Date.now() / 1000)
        );

        if (expirado) {
            await followUpE(interaction, '⏰ Este PIX já expirou! Clique em **Voltar** para gerar um novo.');
            return;
        }

        if (status === 'paid' || status === 'approved') {
            const statusLabel = status === 'approved' ? 'Aprovado' : 'Pago';
            const embed = new EmbedBuilder()
                .setColor(COR_SUCESSO)
                .setTitle(`✅ Pagamento ${statusLabel}!`)
                .setDescription(`Pagamento PIX de R$ ${Number(deposito.requested_amount || deposito.amount).toFixed(2)} confirmado!\n\n🔗 **DEPIX enviado para sua carteira Liquid Network.**\n💰 Seu DEPIX está a caminho via SideSwap.`);

            await interaction.channel.send({ embeds: [embed] });

            // Encontrar o produto correspondente para entregar
            const produtoEntregue = produtos.find(p => p.preco === Number(deposito.requested_amount || deposito.amount));

            const entregaMsg = produtoEntregue 
                ? `🎁 **Entrega do seu Produto:**\n**${produtoEntregue.nome}**\n\n📦 **Conteúdo/Instruções:**\n${produtoEntregue.entrega}`
                : `🎁 **Entrega de Produto:**\nStatus: Pago com sucesso! Por favor, aguarde o envio automático ou fale com a administração.`;

            const embedEntrega = new EmbedBuilder()
                .setColor(COR_SUCESSO)
                .setTitle('🎁 Entrega Efetuada!')
                .setDescription(entregaMsg);

            await interaction.channel.send({ embeds: [embedEntrega] });

            // Enviar no privado (DM) também
            try {
                await interaction.user.send({ embeds: [embedEntrega] });
            } catch (err) {
                console.log("Não foi possível enviar DM para o usuário:", err);
            }

            // Excluir canal após 15 segundos
            setTimeout(() => {
                interaction.channel.send('🏁 Pedido concluído e entregue. Este canal temporário será excluído em 15 segundos...');
                setTimeout(() => {
                    ticketsAtivos.delete(interaction.channel.id);
                    salvarTickets();
                    interaction.channel.delete().catch(() => {});
                }, 15000);
            }, 5000);

        } else {
            await followUpE(interaction, '⏳ Pagamento não detectado ainda. Se você já efetuou o pagamento, aguarde 15-30 segundos e tente verificar novamente.');
        }
    } catch (error) {
        console.error("Erro ao verificar PIX:", error);
        await followUpE(interaction, '❌ Erro ao consultar o status. Caso já tenha pago, mande o comprovante para um staff ou tente novamente.');
    }
}

// ─────────────────────────────────────────────
// CONFIRMAÇÃO MANUAL DE VENDA (STAFF)
// ─────────────────────────────────────────────
async function confirmarManualmente(interaction, prodId) {
  const produto = produtos.find(p => p.id === prodId);
  if (!produto) return await replyE(interaction, '❌ Produto não encontrado.');

  const ticket = ticketsAtivos.get(interaction.channel.id);
  if (!ticket || !interaction.member?.roles.cache.some(r => config.staff_roles.includes(r.id))) {
    return await replyE(interaction, '❌ Apenas staff pode confirmar vendas manualmente.');
  }

  await replyE(interaction, '⏳ Gerando comprovante e entregando produto...');

  const entregaMsg = `🎁 **Entrega Efetuada!**

📦 **Produto:** ${produto.nome}
💰 **Valor:** R$ ${produto.preco.toFixed(2)}
✅ **Confirmação:** Staff manual (${interaction.user.username})

📦 **Conteúdo/Instruções:**
${produto.entrega}`;

  const embedEntrega = new EmbedBuilder()
    .setColor(COR_SUCESSO)
    .setTitle('🎁 Entrega Confirmada (Staff)')
    .setDescription(entregaMsg);

  await interaction.channel.send({ embeds: [embedEntrega] });

  try {
    const ownerId = ticket.userId;
    const guild = interaction.guild;
    const member = await guild.members.fetch(ownerId).catch(() => null);
    if (member) {
      await member.send({ embeds: [embedEntrega] }).catch(() => {});
    }
  } catch {
    console.log('Não foi possível enviar DM para o usuário');
  }

  setTimeout(() => {
    if (interaction.channel) interaction.channel.delete().catch(() => {});
  }, 15000);
}

client.login(process.env.DISCORD_TOKEN);
