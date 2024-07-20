const admin = require('firebase-admin');
const { onRequest, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const twilio = require('twilio');

const { limpaNumero, adicionaNove, primeiroNome } = require('./util');
const { DONOR_TOKENS } = process.env;
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
const { roles } = require('./roles');

const cliente = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);


require('dotenv').config();

// Inicializa o Firebase Admin SDK
if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json'); // Caminho para o arquivo JSON
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = getFirestore("lexai"); // Inicializa o Firestore


exports.enableLex = onRequest(
   async (req, res) => {
        const { hashID, firstName, lastName, email, phoneNumber } = req.body;

        // // TODO: regex hashID MD5 pattern
        // if (!hashID) {
        //     logger.error('NO HASH ID ', hashID);
        //     return res.end("ERR");
        // }

        // if (!firstName || firstName.trim().length == 0) {
        //     logger.error('NO FIRST NAME ', firstName);
        //     return res.end("ERR");
        // }

        // Verificar se usuário existe
        let user = await db.collection('users').doc(phoneNumber).get().then(s => {
            if (s.exists) {
                return s.data();
            }
            return null;
        });
        if (!user) {
            logger.warn(`User ${phoneNumber} does not exist!`);
            user = {
                role: roles.guest,
                phone: phoneNumber,
                currentTokens: 0,
                maxTokens: 0
            };
        }


        const nome = firstName; // primeiroNome(`${firstName} ${lastName}`);


        await db.collection('users').doc(phoneNumber).set({
            fullName: user.fullName ?? `${firstName} ${lastName}`,
            phone: phoneNumber,
            role: !user.role || user.role === roles.guest ? roles.user : user.role,
            maxTokens: FieldValue.increment(parseInt(DONOR_TOKENS)),
            updatedAt: FieldValue.serverTimestamp(),
            "events.attended": FieldValue.increment(1)
        }, { merge: true });

        await db.collection('users').doc(phoneNumber).collection('events_attendance').add({
            title: 'Lançamento Lex 2024-07-13',
            createdAt: FieldValue.serverTimestamp(),
            attended: hashID ? true : false
        }, { merge: true });


        // notificar WhatsApp sobre doação
        const { TEMPLATE_ENABLED_CONFIRMATION } = process.env;

        await cliente.messages.create({
            from: TWILIO_FROM,
            to: `whatsapp:${phoneNumber}`,
            contentSid: TEMPLATE_ENABLED_CONFIRMATION,
            contentVariables: JSON.stringify({ 1: nome }),
            // body: `Olá ${nome}!\n\nAcabamos de receber sua doação e agora você já pode conversar com a Lex!`
        });

        res.end("OK");

    }
);
