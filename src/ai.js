const OpenAI = require('openai');
const { SYSTEM_PROMPT } = require('./persona');
const memoria = require('./memory');

// Groq expõe uma API compatível com a da OpenAI
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const MODELO = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

async function gerarResposta(jid, textoCliente) {
  const primeira = memoria.ehPrimeiraMensagem(jid);

  // Instrução interna só para ESTA chamada (não vai para o histórico salvo)
  const dica = primeira
    ? '[INSTRUÇÃO INTERNA: início da conversa. Cumprimente e se apresente brevemente.]'
    : '[INSTRUÇÃO INTERNA: conversa em andamento. NÃO cumprimente de novo; continue de onde parou.]';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...memoria.obterHistorico(jid),
    { role: 'user', content: `${dica}\n\nMensagem do cliente: ${textoCliente}` },
  ];

  const completion = await client.chat.completions.create({
    model: MODELO,
    messages,
    temperature: 0.7,
    // O gpt-oss é um modelo de raciocínio: os tokens "pensados" contam neste limite.
    // Com 400 a resposta pode vir cortada/vazia, por isso 1024 + esforço baixo.
    max_completion_tokens: 1024,
    reasoning_effort: 'low',
  });

  const resposta = completion.choices?.[0]?.message?.content?.trim();
  if (!resposta) throw new Error('Resposta vazia do modelo');

  // Salva no histórico apenas o texto limpo
  memoria.adicionar(jid, 'user', textoCliente);
  memoria.adicionar(jid, 'assistant', resposta);

  return resposta;
}

module.exports = { gerarResposta };