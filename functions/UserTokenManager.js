const { FieldValue } = require('firebase-admin/firestore');
const logger = require("firebase-functions/logger");
const { db } = require('./config');
const { roles } = require('./roles');

class UserTokenManager {
    async checkAndUpdateUserTokens(userId, profileName) {
        try {
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();

            let userData = userDoc.data();
            if (!userDoc.exists) {
                userData = {
                    phone: userId,
                    profileName,
                    currentTokens: 0,
                    role: roles.guest,
                    maxTokens: 0, //Habilitando para que todos possam conversar com a Lex
                    lastMessageTime: FieldValue.serverTimestamp()
                };
                await userRef.set(userData);
            }

            const now = new Date();
            const lastMessageTime = userData.lastMessageTime;
            const currentTokens = userData.currentTokens || 0;
            const maxTokens = userData.maxTokens || 0;

            if (lastMessageTime && (now - lastMessageTime) / (1000 * 60 * 60) >= 24) {
                await userRef.update({
                    currentTokens: 0,
                    lastMessageTime: FieldValue.serverTimestamp()
                });
                userData.currentTokens = 0;
            }

            return { currentTokens: userData.currentTokens, maxTokens, userRef, role: userData.role };
        } catch (error) {
            logger.error("Error in checkAndUpdateUserTokens", { error: error.message });
            throw error;
        }
    }

    async updateUserTokens(userRef, tokensUsed) {
        try {
            await userRef.update({
                currentTokens: FieldValue.increment(tokensUsed),
                lastMessageTime: Date.now()
            });
        } catch (error) {
            logger.error("Error in updateUserTokens", { error: error.message });
            throw error;
        }
    }
}

module.exports = UserTokenManager;