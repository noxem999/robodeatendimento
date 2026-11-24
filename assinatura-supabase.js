const { createClient } = require('@supabase/supabase-js');

const TABELA = process.env.SUPABASE_TABELA || 'usuarios';
const COLUNA_ID = process.env.SUPABASE_COLUNA_ID || 'id';
const CLIENTE_ID = process.env.CLIENTE_ID;

const CACHE_MS = 60 * 1000;
const RETENTAR_MS = 10 * 1000;

const MENSAGEM_SUSPENSO =
  process.env.MENSAGEM_SUSPENSO ||
  'Olá! O atendimento automático desta empresa está temporariamente suspenso. Tente novamente mais tarde ou entre em contato por outro canal.';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !CLIENTE_ID) {
  console.warn('[assinatura] AVISO: defina SUPABASE_URL, SUPABASE_SERVICE_KEY e CLIENTE_ID. Sem isso o robô nunca é suspenso.');
}

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    : null;

const hojeBrasil = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

function calcularAtiva(linha) {
  if (!linha) return true;
  if (linha.status === 'inativo') return false;
  if (linha.data_vencimento && linha.data_vencimento < hojeBrasil()) return false;
  return true;
}

let cache = { validoAte: 0, ativa: true };

async function assinaturaAtiva() {
  if (!supabase || !CLIENTE_ID) return true;
  if (Date.now() < cache.validoAte) return cache.ativa;
  try {
    const { data, error } = await supabase
      .from(TABELA)
      .select('status, data_vencimento')
      .eq(COLUNA_ID, CLIENTE_ID)
      .single();
    if (error) throw error;
    cache = { validoAte: Date.now() + CACHE_MS, ativa: calcularAtiva(data) };
  } catch (err) {
    console.error('[assinatura] falha ao consultar o Supabase:', err.message);
    cache = { validoAte: Date.now() + RETENTAR_MS, ativa: cache.ativa };
  }
  return cache.ativa;
}

const avisos = new Map();
const INTERVALO_AVISO_MS = 6 * 60 * 60 * 1000;

async function avisarSuspensao(sock, jid) {
  if (Date.now() - (avisos.get(jid) || 0) < INTERVALO_AVISO_MS) return;
  if (avisos.size >= 5000) avisos.delete(avisos.keys().next().value);
  avisos.set(jid, Date.now());
  await sock.sendMessage(jid, { text: MENSAGEM_SUSPENSO });
}

module.exports = { assinaturaAtiva, avisarSuspensao };
