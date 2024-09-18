// receiveMessage.js
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const {
  TwilioMessageHandler,
  TwilioMessageSender,
} = require('./adapters/twilioAdapter');

const {
    WebMessageHandler,
    WebMessageSender,
} = require('./adapters/webAdapter');

const {
  limpaNumero,
  adicionaNove,
  loadTemplate,
  transcribeAudio,
  downloadTwilioMedia
} = require('./util');

const UserTokenManager = require('./UserTokenManager');
const ThreadManager = require('./ThreadManager');
const LangChainHandler = require('./handlers/LangChainHandler');
const { roles } = require('./roles');
const { FieldValue } = require('firebase-admin/firestore');

const db = require('./firebase');

const userTokenManager = new UserTokenManager();
const threadManager = new ThreadManager();




exports.receiveMessage = onRequest(async (req, res) => {
    //const messageHandler = new WebMessageHandler();
    //const messageSender = new WebMessageSender(res);

    const messageHandler = new TwilioMessageHandler();
    const messageSender = new TwilioMessageSender();
    const langChainHandler = new LangChainHandler(messageSender);
  // Parse the incoming message using the adapter
  let message = messageHandler.parseRequest(req);
  logger.info("Incoming message received", {
    request: req.body,
    });

  const from = adicionaNove(limpaNumero(message.from));
  const profileName = message.profileName;

  logger.info("Incoming message received", {
    message: message.body,
    from,
    profileName,
  });

  // Check and update user tokens
  const { currentTokens, maxTokens, userRef, role } = await userTokenManager.checkAndUpdateUserTokens(from, profileName);

  logger.info(`${from}: maxTokens ${maxTokens}`);

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
  const threadId = await threadManager.getOrCreateThread(from);
  logger.info("Thread ID for user", { from, threadId });

  await langChainHandler.processResponse(
    threadId,
    userRef,
    message.to,
    message.from,
    message.body
  );
});
