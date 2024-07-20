const admin = require('firebase-admin');
const OpenAI = require('openai');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, OPENAI_API_KEY, ASSISTANT_ID } = process.env;

if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = getFirestore(process.env.FIRESTORE_DB);
const openai = new OpenAI({ OPENAI_API_KEY });

if (!OPENAI_API_KEY) throw new Error("Missing required environment variable: OPENAI_API_KEY");
if (!ASSISTANT_ID) throw new Error("Missing required environment variable: ASSISTANT_ID");

module.exports = { db, openai, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ASSISTANT_ID };
