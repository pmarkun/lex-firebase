const axios = require('axios');
const { Message, MessageHandler, MessageSender } = require('./messageAdapter');
require('dotenv').config();  // Load .env file

class WebMessageHandler extends MessageHandler {
  parseRequest(req) {
    const { user, bot, body, messageType, mediaUrl, mediaContentType, profileName } = req.body;

    return new Message({
      user: user,
      bot: bot,
      body: body,
      messageType: messageType || 'text',
      mediaUrl: mediaUrl || null,
      mediaContentType: mediaContentType || null,
      profileName: profileName || "WebUser",
    });
  }
}

class WebMessageSender extends MessageSender {
  constructor() {
    super();
    this.buffer = '';
  }

  // Send a message using axios to the specified endpoint in .env
  async sendMessage(user, bot, responseStream) {
    let fullResponse = '';

    if (typeof responseStream === 'string') {
      responseStream = [{ content: responseStream }];
    }

    for await (const chunk of responseStream) {
      fullResponse += chunk.content;
    }

    // Send the full message to the external service (configured in .env)
    const payload = {
      user,
      bot,
      body: fullResponse,
      messageType: 'text',
      mediaUrl: null,
    };
    console.log('Sending message:', payload);
    try {
      const response = await axios.post(process.env.WEB_ADAPTER_ENDPOINT + "/receive-message", payload);
      console.log('Message successfully sent:', response.data);
    } catch (error) {
      console.error('Error sending message:', error.response ? error.response.data : error.message);
    }

    return fullResponse;
  }

  sendResponse(res, messageContent) {
    res.json(messageContent);
  }

  sendEmptyResponse(res) {
    res.status(200).end();
  }
}

module.exports = { WebMessageHandler, WebMessageSender };
