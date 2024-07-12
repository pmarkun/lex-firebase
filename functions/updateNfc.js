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


exports.updateNfc = onRequest(
   async (req, res) => {
        console.log('REQ', req.body);
        const { hashID, firstName, phoneNumber } = req.body;

        // TODO: regex hashID MD5 pattern
        if (!hashID) {
            logger.error('NO HASH ID ', hashID);
            return res.end("ERR");
        }

        if (!firstName || firstName.trim().length == 0) {
            logger.error('NO FIRST NAME ', firstName);
            return res.end("ERR");
        }

        await db.collection('tokens').doc(hashID).set({
            firstName,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        res.end("OK");

    }
);
