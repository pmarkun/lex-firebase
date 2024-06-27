const admin = require('firebase-admin');
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { limpaNumero, adicionaNove } = require('./util');

require('dotenv').config();
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
const db = getFirestore("lexai"); // Inicializa o Firestore




exports.callLog = onRequest(async (req, res) => {
    // É necessário este webhook para conseguir ativar o fluxo do eventStreams que usamos no syncLog.js
    // const { From, CallDuration, FromCity, fromState, CallStatus, CallSid } = req.body;
    // logger.info('CALL LOG REQ', From, CallStatus, CallDuration, CallSid);
    res.send('OK');
});