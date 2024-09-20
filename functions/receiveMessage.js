const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { loadTemplate, transcribeAudio, downloadTwilioMedia } = require('./util');
const UserTokenManager = require('./UserTokenManager');
const ThreadManager = require('./ThreadManager');
const LangChainHandler = require('./handlers/LangChainHandler');
const { roles } = require('./roles');
const { FieldValue } = require('firebase-admin/firestore');
const db = require('./firebase');
require('dotenv').config();  // Carrega o .env

const userTokenManager = new UserTokenManager();
const threadManager = new ThreadManager();

// Função para carregar dinamicamente o adaptador com base na variável de ambiente
function loadAdapter(adapterName) {
  try {
    // Constroi o caminho do arquivo e nome das classes com base no adapterName
    const adapterPath = `./adapters/${adapterName}Adapter`;
    const HandlerClass = require(adapterPath)[`${adapterName.charAt(0).toUpperCase() + adapterName.slice(1)}MessageHandler`];
    const SenderClass = require(adapterPath)[`${adapterName.charAt(0).toUpperCase() + adapterName.slice(1)}MessageSender`];
    
    return {
      messageHandler: new HandlerClass(),
      messageSender: new SenderClass(),
    };
  } catch (error) {
    logger.error(`Failed to load adapter: ${adapterName}`, error);
    throw new Error(`Invalid adapter specified: ${adapterName}`);
  }
}

// Carrega o adaptador com base na variável de ambiente
const adapterName = process.env.MESSAGE_ADAPTER || 'twilio';  // Padrão para 'twilio'
const { messageHandler, messageSender } = loadAdapter(adapterName);

const langChainHandler = new LangChainHandler(messageSender);

exports.receiveMessage = onRequest(async (req, res) => {
  // Parse the incoming message using the selected adapter
  let message = messageHandler.parseRequest(req);
  logger.info("Incoming message received", {
    request: req.body,
  });

  
  const profileName = message.profileName;
  const user = message.user;

  // Check and update user tokens
  const { currentTokens, maxTokens, userRef, role } = await userTokenManager.checkAndUpdateUserTokens(user, profileName);

  // Handle user roles and token limits
  if ([roles.guest, roles.user].includes(role)) {
    logger.info('Role is Guest or User.');
    if (maxTokens === 0) {
      const welcomeMessage = await loadTemplate('welcome', {});
      messageSender.sendResponse(res, { body: welcomeMessage });
      await userRef.set({ maxTokens: 2000 }, { merge: true }); // Update maxTokens to 2000
      return;
    }
  } else {
    logger.info('Role is Admin or Editor.');
  }

  // Send an empty response immediately (acknowledgment)
  messageSender.sendResponse(res, {});

  // Handle audio messages
  if (message.messageType === 'audio') {
    const audioUrl = message.mediaUrl;
    logger.info('DOWNLOAD MEDIA', {
      url: audioUrl,
      MessageType: message.messageType,
      ContentType: message.mediaContentType,
    });

    let { contentType, buffer } = await downloadTwilioMedia(audioUrl);

    if (buffer.length > 10000) {
      const audioTranscribeMessage = await loadTemplate('audioTranscribe', {});
      await messageSender.sendMessage(message.from, message.to, {
        body: audioTranscribeMessage,
      });
    }

    const transcription = await transcribeAudio(buffer, contentType);
    message.body = transcription.text;
    logger.info('Audio transcription completed', { transcription: message.body });
  }

  // Proceed with processing the message
  const threadId = await threadManager.getOrCreateThread(user);
  logger.info("Thread ID for user", { user, threadId });

  await langChainHandler.processResponse(
    threadId,
    userRef,
    message.user,
    message.bot,
    message.body
  );
});
