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


exports.getUserByNfc = onRequest(
    //{ cors: [/lex\.tec\.br$/, "https://flutter.com"] },
    { cors: true },

    async (request, res) => {
        console.log(request.body)
        let nfcId = request.body.id;
        try {
            await db.collection('tokens').doc(nfcId).get().then(s => {
                if (s.exists) {
                    return res.end(JSON.stringify(s.data()));
                }
                res.end(JSON.stringify({"firstName" : ""}));
            });

            // const querySnapshot = await db.collection('users').where('rfid', '==', rfid).get();
            // if (!querySnapshot.empty) {
            //     querySnapshot.forEach((doc) => {
            //         const data = doc.data();
                    
            //         //return profileName;

            //     });
            // } else {
            //     res.end(JSON.stringify({"firstName" : ""}));
            //     //return null;
            // }
        } catch (error) {
            res.end(JSON.stringify({"error" : error}));
            console.error("Error checking Firebase: ", error);
            //return null;
            }
        }
);
