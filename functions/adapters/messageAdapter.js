// adapters/messageAdapter.js

class Message {
    constructor({ body, user, bot, profileName, messageType, mediaUrl, mediaContentType }) {
      this.body = body;
      this.user = user;
      this.bot = bot;
      this.profileName = profileName;
      this.messageType = messageType;
      this.mediaUrl = mediaUrl;
      this.mediaContentType = mediaContentType;
    }
  }
  
  class MessageHandler {
    parseRequest(req) {
      throw new Error("Method 'parseRequest' must be implemented.");
    }
  }
  
  class MessageSender {
    sendMessage(bot, user, messageContent) {
      throw new Error("Method 'sendMessage' must be implemented.");
    }
  
    sendResponse(res, messageContent) {
      throw new Error("Method 'sendResponse' must be implemented.");
    }
  }
  
  module.exports = { Message, MessageHandler, MessageSender };