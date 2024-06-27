const admin = require('firebase-admin');
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const { limpaNumero, adicionaNove } = require('./util');

require('dotenv').config();
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
const db = getFirestore("lexai"); // Inicializa o Firestore


exports.syncLog = onRequest(async (req, res) => {
    if (typeof req.body === 'object') {
        let item = req.body[0];
        let log = {};
        let call;

        switch(item.type) {
            case "com.twilio.messaging.inbound-message.received":
                message = item.data;
                log.type = 'message_inbound';
                log.sid = message.messageSid;
                log.from = adicionaNove(limpaNumero(message.from));
                log.message = {
                    from: message.from,
                    to: message.to,
                    body: message.body,
                };

                if (message.numMedia > 0) {
                    log.message.media = message.numMedia ? parceInt(message.numMedia) : 0;
                    log.message.mediaUrl = message.mediaUrl0 ?? '';
                }
                log.createdAt = FieldValue.serverTimestamp();

                // TODO: calculate vector and save in database 

                // Save in Firestore
                await db.collection('users').doc(log.from).collection('logs').doc(log.sid).create(log).catch(async e => {
                    delete log.createdAt;
                    log.updatedAt = FieldValue.serverTimestamp();
                    await db.collection('users').doc(log.from).collection('logs').doc(log.sid).update(log)
                });

                break;

            case "com.twilio.messaging.message.queued":
            case "com.twilio.messaging.message.sent":
                // Não fazendo nenhuma inserção aqui pois não inclui o texto enviado.
                break;
            
            case "com.twilio.voice.twiml.call.requested":
            case "com.twilio.voice.status-callback.call.completed":
            case "com.twilio.voice.status-callback.call.ringing":
            case "com.twilio.voice.status-callback.call.initiated":
            case "com.twilio.voice.status-callback.call.answered":
                call = item.data.request.parameters;
                // logger.info('CALL RECEIVED', call.From, call.CallStatus, call.CallDuration, call.CallSid);
                
                log.type = 'call';
                log.sid = call.CallSid;
                log.from = call.From;
                log.call = {
                    duration: call.CallDuration ? parseInt(call.CallDuration) : 0,
                    to: call.To,
                    status: call.CallStatus
                };
                log.createdAt = FieldValue.serverTimestamp();

                // Save in Firestore
                await db.collection('users').doc(log.from).collection('logs').doc(log.sid).create(log).catch(async e => {
                    delete log.createdAt;
                    log.updatedAt = FieldValue.serverTimestamp();
                    await db.collection('users').doc(log.from).collection('logs').doc(log.sid).update(log)
                });
                break;
    
            case "com.twilio.voice.twiml.gather.finished":
                // TODO: é possível capturar o que foi transcrito
                break;
        
        
        }
    
    } else {
        logger.info('EVENTO NAO RECONHECIDO', req.body);
    } 
    res.end('OK');

});
