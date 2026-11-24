const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const { gerarResposta } = require('./ai');
const { assinaturaAtiva, avisarSuspensao } = require('../assinatura-supabase');
const { definirQR, definirConectado, definirReconectando } = require('./server');

const AUTH_DIR = process.env.AUTH_DIR || 'auth_info';

// Fila por contato: evita responder fora de ordem se o cliente mandar várias mensagens seguidas
const filas = {};

function extrairTexto(msg) {
  const m = msg.message;
  if (!m) return null;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    null
  );
}

async function tratarMensagem(sock, msg) {
  const jid = msg.key.remoteJid;

  // Ignora: mensagens do próprio bot, status/broadcast e grupos
  if (msg.key.fromMe) return;
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast')) return;
  if (jid.endsWith('@g.us')) return;

  const texto = extrairTexto(msg);
  if (!texto) return; // ignora áudio, figurinha etc.

  console.log(`📩 ${jid}: ${texto}`);

  // Controle de assinatura: pausada/vencida => a IA não responde, só o aviso de suspensão
  if (!(await assinaturaAtiva())) {
    console.log('[bot] assinatura pausada/vencida: IA não respondeu.');
    try {
      await avisarSuspensao(sock, jid);
    } catch (err) {
      console.error('[bot] erro ao enviar aviso de suspensão:', err.message);
    }
    return;
  }

  try {
    await sock.readMessages([msg.key]);
    await sock.sendPresenceUpdate('composing', jid);

    const resposta = await gerarResposta(jid, texto);

    await sock.sendPresenceUpdate('paused', jid);
    await sock.sendMessage(jid, { text: resposta });
    console.log(`🤖 -> ${jid}: ${resposta}`);
  } catch (err) {
    console.error('Erro ao responder:', err.message);
    await sock.sendMessage(jid, {
      text: 'Desculpe, tive um probleminha aqui. Pode repetir sua mensagem, por favor? 🙏',
    });
  }
}

async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Atendente Confeitaria', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('📱 Novo QR Code gerado. Abra /qrcode no navegador para escanear.');
      qrcodeTerminal.generate(qr, { small: true }); // útil para rodar localmente
      try {
        await definirQR(qr);
      } catch (e) {
        console.error('Erro ao gerar imagem do QR Code:', e.message);
      }
    }

    if (connection === 'open') {
      console.log('✅ Conectado ao WhatsApp! Robô online.');
      definirConectado();
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexão encerrada (código ${codigo}).`);
      definirReconectando();

      if (codigo === DisconnectReason.loggedOut) {
        // Sessão invalidada (ex.: aparelho removido no celular): limpa e gera novo QR sozinho
        console.log('Sessão encerrada. Limpando credenciais e gerando novo QR Code...');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      console.log('Reconectando...');
      iniciarWhatsApp();
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      filas[jid] = (filas[jid] || Promise.resolve())
        .then(() => tratarMensagem(sock, msg))
        .catch((e) => console.error(e));
    }
  });
}

module.exports = { iniciarWhatsApp };
