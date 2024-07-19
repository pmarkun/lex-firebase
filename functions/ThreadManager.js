const { FieldValue } = require('firebase-admin/firestore');
const logger = require("firebase-functions/logger");
const { db } = require('./config');

class ThreadManager {
    async getOrCreateThread(userId) {
        try {
            logger.info("Checking user document", { userId });

            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();
            logger.info("User document fetched", { exists: userDoc.exists });

            if (userDoc.exists) {
                let threadId = userDoc.data().threadId;

                if (!threadId) {
                    threadId = this.createUniqueThreadId();
                    logger.info('create thread...', { threadId });

                    await userRef.update({ threadId });
                    await userRef.collection('logs').doc(threadId).set({
                        type: 'custom',
                        createdAt: FieldValue.serverTimestamp(),
                        count: 1,
                        threadId
                    });
                    logger.info("New thread created for user", { userId, threadId });
                } else {
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
                }

                return threadId;
            } else {
                throw new Error('User document does not exist');
            }
        } catch (error) {
            logger.error("Error in getOrCreateThread", { error: error.message });
            throw error;
        }
    }

    createUniqueThreadId() {
        // Implement your own logic for creating a unique thread ID.
        return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = ThreadManager;
