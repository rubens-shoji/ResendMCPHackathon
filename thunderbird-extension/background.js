console.log('Thunderbird Extension carregada!');

async function processEmail(messageId) {
  console.log('Processando email ID:', messageId);
  try {
    const message = await browser.messages.get(messageId);
    const fullMessage = await browser.messages.getFull(messageId);
    console.log('Mensagem completa obtida:', message.subject);

    const emailData = {
      id: message.id,
      subject: message.subject,
      from: message.author,
      to: message.recipients,
      date: message.date,
      body: extractBody(fullMessage),
      headers: fullMessage.headers,
    };

    console.log('Enviando para servidor:', emailData.subject);

    const response = await fetch('http://localhost:3000/process-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailData)
    });

    const result = await response.json();
    console.log('Resposta do servidor:', result);
    return result;
  } catch (error) {
    console.error('Erro ao processar email:', error);
    throw error;
  }
}

browser.messageDisplayAction.onClicked.addListener(async (tab) => {
  console.log('Botão clicado na tab:', tab.id);
  try {
    const message = await browser.messageDisplay.getDisplayedMessage(tab.id);
    if (message) {
      console.log('Email selecionado:', message.subject);
      await processEmail(message.id);
      console.log('Email processado com sucesso!');
    } else {
      console.log('Nenhum email selecionado');
    }
  } catch (error) {
    console.error('Erro ao processar email do botão:', error);
  }
});

let processedMessageIds = new Set();

async function pollNewEmails() {
  try {
    const accounts = await browser.accounts.list();

    for (const account of accounts) {
      if (!account.folders) continue;

      for (const folder of account.folders) {
        if (folder.type === 'inbox') {
          console.log('Verificando inbox:', account.name, '/', folder.name);

          const page = await browser.messages.list(folder.id);
          const messages = page.messages.slice(0, 20);

          for (const message of messages) {
            if (!processedMessageIds.has(message.id)) {
              console.log('📬 Novo email detectado:', message.subject);
              processedMessageIds.add(message.id);

              if (processedMessageIds.size > 200) {
                const oldIds = Array.from(processedMessageIds).slice(0, 100);
                oldIds.forEach(id => processedMessageIds.delete(id));
              }

              try {
                await processEmail(message.id);
                console.log('✅ Email processado automaticamente');
              } catch (error) {
                console.error('❌ Erro ao processar email automaticamente:', error);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro no polling de emails:', error);
  }
}

console.log('Iniciando polling de emails a cada 5 segundos...');
pollNewEmails();
setInterval(pollNewEmails, 5000);

function extractBody(fullMessage) {
  if (fullMessage.parts) {
    for (const part of fullMessage.parts) {
      if (part.contentType === 'text/plain' && part.body) {
        return part.body;
      }
      if (part.contentType === 'text/html' && part.body) {
        return part.body;
      }
      if (part.parts) {
        const nestedBody = extractBodyFromParts(part.parts);
        if (nestedBody) return nestedBody;
      }
    }
  }
  return '';
}

function extractBodyFromParts(parts) {
  for (const part of parts) {
    if (part.contentType === 'text/plain' && part.body) {
      return part.body;
    }
    if (part.contentType === 'text/html' && part.body) {
      return part.body;
    }
  }
  return null;
}
