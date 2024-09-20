const axios = require('axios');
const { Message, MessageHandler, MessageSender } = require('./messageAdapter');
require('dotenv').config();  // Carrega o .env

class TelegramMessageHandler extends MessageHandler {
  parseRequest(req) {
    const update = req.body;

    // Verifica se é uma mensagem de texto
    if (update.message && update.message.text) {
      console.log(update);
      const { message } = update;
      const { chat, text } = message;
      const user = chat.id.toString(); 
      const bot = 'Lex';
      const body = text;

      return new Message({
        user,
        bot,
        body,
        messageType: 'text',
        mediaUrl: null,
        mediaContentType: null,
        profileName: chat.username || chat.first_name || 'TelegramUser',
      });
    } else {
      // Se não for uma mensagem de texto, lança um erro ou trata conforme necessário
      throw new Error('Unsupported update type');
    }
  }
}

class TelegramMessageSender extends MessageSender {
    constructor() {
      super();
      this.botToken = process.env.TELEGRAM_BOT_TOKEN;
      this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
    }
  
    // Envia uma mensagem usando a API do Telegram
    async sendMessage(user, bot, responseStream) {
      let fullResponse = '';
  
      if (typeof responseStream === 'string') {
        responseStream = [{ content: responseStream }];
      }
  
      for await (const chunk of responseStream) {
        fullResponse += chunk.content;
      }
  
  
      // Envia a mensagem para o usuário via Telegram
        const response = await axios.post(`${this.apiUrl}/sendMessage`, {
          chat_id: user,
          text: fullResponse,
        });
  
      return fullResponse;
    }
  
    // Envia uma resposta HTTP imediata
    sendResponse(res, messageContent) {
      res.status(200).send('OK');
    }
  
    // Envia uma resposta vazia
    sendEmptyResponse(res) {
      res.status(200).send('OK');
    }
}

module.exports = { TelegramMessageHandler, TelegramMessageSender };
