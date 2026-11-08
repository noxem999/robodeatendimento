require('dotenv').config();

if (!process.env.GROQ_API_KEY) {
  console.error('❌ Defina GROQ_API_KEY nas variáveis de ambiente (veja .env.example).');
  process.exit(1);
}

const { iniciarServidor } = require('./src/server');
const { iniciarWhatsApp } = require('./src/whatsapp');

console.log('🚀 Iniciando robô de atendimento...');

// Sobe o servidor web primeiro: o Render precisa detectar a porta aberta
iniciarServidor();
iniciarWhatsApp();