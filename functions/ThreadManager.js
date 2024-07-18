const { FieldValue } = require('firebase-admin/firestore');
const logger = require("firebase-functions/logger");
const { db, openai } = require('./config');

class ThreadManager {
    async getOrCreateThread(userId) {
        try {
            logger.info("Checking user document", { userId });

            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();
            logger.info("User document fetched", { exists: userDoc.exists });

            if (userDoc.exists && userDoc.data().threadId) {
                const threadId = userDoc.data().threadId;
                
                // Ensure the log document exists before updating it
                const logRef = userRef.collection('logs').doc(threadId);
                const logDoc = await logRef.get();
                if (!logDoc.exists) {
                    await logRef.set({
                        updatedAt: FieldValue.serverTimestamp(),
                        count: 1
                    });
                } else {
                    await logRef.update({
                        updatedAt: FieldValue.serverTimestamp(),
                        count: FieldValue.increment(1)
                    });
                }

                return threadId;
            } else {
                const thread = await openai.beta.threads.create();
                logger.info('create thread...', thread);
                await userRef.update({ threadId: thread.id });
                await userRef.collection('logs').doc(thread.id).set({
                    type: 'openai',
                    createdAt: FieldValue.serverTimestamp(),
                    count: 1,
                    thread
                });
                logger.info("New thread created for user", { userId, threadId: thread.id });
                return thread.id;
            }
        } catch (error) {
            logger.error("Error in getOrCreateThread", { error: error.message });
            throw error;
        }
    }
}

module.exports = ThreadManager;
