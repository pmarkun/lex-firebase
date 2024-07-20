const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const twilio = require('twilio');
const { limpaNumero, adicionaNove, downloadTwilioMedia } = require('./util');
const UserTokenManager = require('./UserTokenManager');
const ThreadManager = require('./ThreadManager');
const LangChainHandler = require('./handlers/LangChainHandler'); // Atualizado para caminho correto
const { roles } = require('./roles');
const { FieldValue } = require('firebase-admin/firestore'); // Importando FieldValue
const { loadTemplate, transcribeAudio } = require('./util');
const MessageSender = require('./messageSender');

const cliente = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const userTokenManager = new UserTokenManager();
const threadManager = new ThreadManager();
const langChainHandler = new LangChainHandler();
const messageSender = new MessageSender();

exports.receiveMessage = onRequest(async (req, res) => {
    let incomingMessage = req.body.Body;
    const hasAudio = req.body.MessageType == 'audio';
    const from = adicionaNove(limpaNumero(req.body.From));
    const profileName = req.body.ProfileName;

    logger.info("Incoming message received", { message: incomingMessage, from, profileName });

    const { currentTokens, maxTokens, userRef, role } = await userTokenManager.checkAndUpdateUserTokens(from, profileName);

    logger.info(`${from}: maxTokens ${maxTokens}`);
    switch (role) {
        case roles.admin:
        case roles.editor:
            logger.info('Role is Admin or Editor.');
            break;
        case roles.user:
        case roles.guest:
        default:
            logger.info('Role is Guest or User.');
            if (maxTokens === 0) {
                const twiml = new twilio.twiml.MessagingResponse();
                twiml.message(await loadTemplate('welcome', {}));
                return res.end(twiml.toString());
            }
            break;
    }

    const twiml = new twilio.twiml.MessagingResponse();
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());

    if (hasAudio) {
        const audioUrl = req.body.MediaUrl0;
        logger.info('DOWNLOAD MEDIA', { url: req.body.MediaUrl0, MessageType: req.body.MessageType, ContentType: req.body.MediaContentType0 });
        let { contentType, buffer } = await downloadTwilioMedia(audioUrl);
        if (buffer.length > 10000) {
            await messageSender.sendMessage(req.body.To, req.body.From, loadTemplate('audioTranscribe', {}));
        }

        const transcription = await transcribeAudio(buffer, contentType);
        incomingMessage = transcription.text;
    }

    const threadId = await threadManager.getOrCreateThread(from);
    logger.info("Thread ID for user", { from, threadId });

    await langChainHandler.processResponse(threadId, userRef, req.body.To, req.body.From, incomingMessage);
});
