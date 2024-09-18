// adapters/twilioAdapter.js

const twilio = require('twilio');
const { Message, MessageHandler, MessageSender } = require('./messageAdapter');
const logger = require("firebase-functions/logger");

class TwilioMessageHandler extends MessageHandler {
  parseRequest(req) {
    const body = req.body.Body;
    const from = req.body.From;
    const to = req.body.To;
    const profileName = req.body.ProfileName;
    const messageType = req.body.MessageType;
    const mediaUrl = req.body.MediaUrl0;
    const mediaContentType = req.body.MediaContentType0;

    return new Message({
      body,
      from,
      to,
      profileName,
      messageType,
      mediaUrl,
      mediaContentType,
    });
  }
}

class TwilioMessageSender extends MessageSender {
  constructor() {
    super();
    this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    this.messageQueue = [];
    this.sending = false;
    this.buffer = '';
    this.maxMessageSize = 1600; // Default max message size for Twilio
  }

  // Improved sendMessage method with buffer handling and queue processing
  async sendMessage(from, to, responseStream) {
    let fullResponse = ''; // Collect the full response

    if (typeof responseStream === 'string') {
      responseStream = [{ content: responseStream }];
    }

    for await (const chunk of responseStream) {
      fullResponse += chunk.content;
      this.buffer += chunk.content;

      // Split the message into chunks based on the max message size
      while (this.buffer.length >= this.maxMessageSize) {
        const splitIndex = this.findSplitIndex(this.buffer, this.maxMessageSize);
        const part = this.buffer.slice(0, splitIndex + 1).trim(); // Trim whitespace
        this.buffer = this.buffer.slice(splitIndex + 1).trim(); // Update the buffer
        this.messageQueue.push({ from, to, body: part });
        await this.processQueue();
      }
    }

    // Push remaining buffer to the queue
    if (this.buffer.length > 0) {
      this.messageQueue.push({ from, to, body: this.buffer });
      this.buffer = '';
    }

    // Process the queue
    await this.processQueue();

    return fullResponse; // Return the full response once all messages are sent
  }

  // Helper function to find the best place to split a message
  findSplitIndex(buffer, maxSize) {
    let splitIndex = buffer.lastIndexOf('.', maxSize);
    if (splitIndex === -1) splitIndex = buffer.lastIndexOf('\n', maxSize);
    if (splitIndex === -1) splitIndex = buffer.lastIndexOf(' ', maxSize); // Try splitting on space
    if (splitIndex === -1) splitIndex = maxSize; // Fallback to max size
    return splitIndex;
  }

  // Queue processing logic
  async processQueue() {
    if (this.sending) return; // Avoid processing if already sending messages
    this.sending = true;

    while (this.messageQueue.length > 0) {
      const { from, to, body } = this.messageQueue.shift();
      try {
        const response = await this.client.messages.create({ from, to, body });
        logger.info('Message sent', { body, response });
      } catch (error) {
        logger.error('Error sending message', { error, body });
        // Optional: Implement retry logic here
      }
    }

    this.sending = false;
  }

  // Standard Twilio response
  sendResponse(res, messageContent) {
    const twiml = new twilio.twiml.MessagingResponse();

    if (messageContent) {
      const msg = twiml.message();
      if (messageContent.body) {
        msg.body(messageContent.body);
      }
      if (messageContent.mediaUrl) {
        msg.media(messageContent.mediaUrl);
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
  }
}

module.exports = { TwilioMessageHandler, TwilioMessageSender };
