const admin = require('firebase-admin');
const { onRequest, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const { limpaNumero, adicionaNove } = require('./util');

require('dotenv').config();

// Inicializa o Firebase Admin SDK
if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json'); // Caminho para o arquivo JSON
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = getFirestore("lexai"); // Inicializa o Firestore


exports.getUserByRFID = onCall(
    { cors: [/lex\.tec\.br$/, "https://flutter.com"] },
    (request) => {

        return {
            teste: true,
            mensagem: 'Olá mundo!'
        };

    }
);
