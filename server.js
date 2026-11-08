const express = require('express');
const QRCode = require('qrcode');

// Estado compartilhado entre o WhatsApp e o servidor web
const estado = {
  status: 'iniciando', // iniciando | aguardando_qr | conectado | reconectando
  qrDataUrl: null,
};

async function definirQR(qr) {
  estado.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
  estado.status = 'aguardando_qr';
}

function definirConectado() {
  estado.status = 'conectado';
  estado.qrDataUrl = null;
}

function definirReconectando() {
  estado.status = 'reconectando';
  estado.qrDataUrl = null;
}

// Proteção opcional por token (evita que estranhos escaneiem o QR e assumam o número)
function protegido(req, res, next) {
  const token = process.env.QR_TOKEN;
  if (!token || req.query.token === token) return next();
  res.status(401).send('Acesso negado. Use /qrcode?token=SEU_TOKEN');
}

const PAGINA = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Conectar robô</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f4f1ec; color: #2b2b2b;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; padding: 32px; border-radius: 16px; text-align: center;
            box-shadow: 0 6px 24px rgba(0,0,0,.08); max-width: 380px; }
    img { width: 100%; max-width: 320px; }
    .ok { color: #1a8f4c; }
  </style>
</head>
<body>
  <div class="card" id="card"><p>Carregando…</p></div>
  <script>
    const card = document.getElementById('card');
    const token = new URLSearchParams(location.search).get('token');
    const url = '/qrcode/status' + (token ? '?token=' + encodeURIComponent(token) : '');

    async function atualizar() {
      try {
        const r = await fetch(url);
        const d = await r.json();
        if (d.status === 'conectado') {
          card.innerHTML = '<h2 class="ok">✅ Robô conectado com sucesso!</h2><p>Pode fechar esta página.</p>';
        } else if (d.status === 'aguardando_qr' && d.qr) {
          card.innerHTML = '<h2>Escaneie o QR Code com o WhatsApp para conectar o robô</h2>' +
            '<img src="' + d.qr + '" alt="QR Code">' +
            '<p>WhatsApp &gt; Aparelhos conectados &gt; Conectar um aparelho</p>';
        } else {
          card.innerHTML = '<p>Gerando QR Code, aguarde…</p>';
        }
      } catch (e) {
        card.innerHTML = '<p>Servidor indisponível, tentando novamente…</p>';
      }
    }
    atualizar();
    setInterval(atualizar, 3000);
  </script>
</body>
</html>`;

function iniciarServidor() {
  const app = express();

  // Health check do Render e página inicial
  app.get('/', (req, res) => res.send('Robô de atendimento online 🍰'));
  app.get('/health', (req, res) => res.json({ ok: true, status: estado.status }));

  app.get('/qrcode', protegido, (req, res) => res.type('html').send(PAGINA));

  app.get('/qrcode/status', protegido, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: estado.status, qr: estado.qrDataUrl });
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web na porta ${PORT} (página do QR Code em /qrcode)`);
  });
}

module.exports = { iniciarServidor, definirQR, definirConectado, definirReconectando };
