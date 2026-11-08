// Memória simples em RAM: um objeto com o histórico por contato (JID).
// Formato das mensagens: padrão OpenAI { role: 'user' | 'assistant', content }.
// Observação: reiniciar o bot apaga a memória (suficiente para demonstração).
const MAX_MENSAGENS = 20;                   // histórico máximo por contato
const INATIVIDADE_MS = 6 * 60 * 60 * 1000;  // após 6h sem falar, volta a saudar

const conversas = {};
// formato: { "5531999999999@s.whatsapp.net": { historico: [], ultimaInteracao: 0 } }

function obterConversa(jid) {
  const agora = Date.now();
  let c = conversas[jid];

  if (!c || agora - c.ultimaInteracao > INATIVIDADE_MS) {
    c = { historico: [], ultimaInteracao: agora };
    conversas[jid] = c;
  }
  c.ultimaInteracao = agora;
  return c;
}

function ehPrimeiraMensagem(jid) {
  return obterConversa(jid).historico.length === 0;
}

function adicionar(jid, role, content) {
  const c = obterConversa(jid);
  c.historico.push({ role, content });

  // Mantém só as últimas N mensagens
  while (c.historico.length > MAX_MENSAGENS) c.historico.shift();
  // Garante que o histórico sempre comece com uma mensagem do usuário
  while (c.historico.length && c.historico[0].role !== 'user') c.historico.shift();
}

function obterHistorico(jid) {
  return obterConversa(jid).historico;
}

module.exports = { ehPrimeiraMensagem, adicionar, obterHistorico };