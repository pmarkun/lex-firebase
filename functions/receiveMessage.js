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
    const hasImage = req.body.MessageType == 'image';
    const from = adicionaNove(limpaNumero(req.body.From));
    const profileName = req.body.ProfileName;

    logger.info("Incoming message received", { message: incomingMessage, from, profileName });

    const twiml = new twilio.twiml.MessagingResponse();
    const { currentTokens, maxTokens, userRef, role } = await userTokenManager.checkAndUpdateUserTokens(from, profileName);


    // Envio de conteúdo por palavra-chave
    switch (incomingMessage.toUpperCase().trim()) {
        case 'FOTO':
            let photoData = await db.collection('settings').doc('photo').get()
                .then(s => {
                    if (s.exists) {
                        return s.data();
                    }
                    return null
                });
            
            if (photoData && photoData.active) {
                // await cliente.messages.create({
                //     from: req.body.To,
                //     to: req.body.From,
                //     body: photoData.message || "",
                //     mediaUrl: [
                //         photoData.mediaUrl
                //     ]
                // });

                await userRef.set({
                    photoSent: FieldValue.increment(1),
                    lastMessageTime: Date.now()
                }, { merge: true });

                twiml.message(photoData.message || "").media(photoData.mediaUrl);

            }
            return res.end(twiml.toString());
    }


    logger.info(`${from}: maxTokens ${maxTokens}`);
    switch (role) {
        case roles.admin:
        case roles.editor:
            logger.info('Role is Admin or Editor');
            break;
        case roles.user:
        case roles.guest:
        default:
            logger.info('Role is Guest or User');
            if (maxTokens === 0) {
                twiml.message(await loadTemplate('welcome', {}));
                return res.end(twiml.toString());
            }
            break;
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());

    if (hasAudio) {
        const audioUrl = req.body.MediaUrl0;
        //const audioContentType = req.body.MediaContentType0;
        logger.info('DOWNLOAD MEDIA', { url: req.body.MediaUrl0, MessageType: req.body.MessageType, ContentType: req.body.MediaContentType0 });
        let { contentType, buffer } = await downloadTwilioMedia(audioUrl);
        if (buffer.length > 10000) {
            await messageSender.sendMessage(req.body.To, req.body.From, loadTemplate('audioTranscribe', {}));
        }

        const transcription = await transcribeAudio(buffer, contentType);
        incomingMessage = transcription.text;
    }
    if (hasImage && data.role === roles.admin) {
        logger.info('Saving photo on database', {
            media: req.body.MediaUrl0,
            message: incomingMessage
        });
        // TODO: salvar imagem em banco
        await db.collection('settings').doc('photo').set({
            active: true,
            mediaUrl: req.body.MediaUrl0,
            message: incomingMessage,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        await cliente.messages.create({
            from: req.body.To,
            to: req.body.From,
            body: "Foto salva com sucesso!"
        });
    }

    const threadId = await threadManager.getOrCreateThread(from);
    logger.info("Thread ID for user", { from, threadId });

    await langChainHandler.processResponse(threadId, userRef, req.body.To, req.body.From, incomingMessage);
});
