const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json'); // Caminho para o arquivo JSON
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = getFirestore(process.env.FIRESTORE_DB);

// Conectar ao emulador Firestore se em modo de desenvolvimento
if (process.env.FIRESTORE_EMULATOR_HOST) {
    db.settings({
        host: process.env.FIRESTORE_EMULATOR_HOST,
        ssl: false
    });
}

module.exports = db;
