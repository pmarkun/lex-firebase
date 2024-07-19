const { FieldValue } = require('firebase-admin/firestore');
const db = require('../firebase');
const logger = require("firebase-functions/logger");
const { loadTemplate } = require("../util");
const { ChatOpenAI } = require("@langchain/openai");
const { SystemMessage } = require("@langchain/core/messages");

class MemoryHandler {
    constructor() {
        this.db = db;
        this.model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: "gpt-3.5-turbo",
            temperature: 0
        });
    }

    async getLastNMessages(sessionId, n, since = null) {
        try {
            let messagesRef = this.db.collection('sessions').doc(sessionId).collection('messages').orderBy('createdAt', 'desc');
            if (since) {
                messagesRef = messagesRef.where('createdAt', '>', since);
            }
            if (n) {
                messagesRef = messagesRef.limit(n);
            }
            const snapshot = await messagesRef.get();
            const messages = [];
            snapshot.forEach(doc => {
                messages.push(doc.data());
            });
            return messages.reverse(); // Reverse to maintain chronological order
        } catch (error) {
            logger.error('Error loading messages', error);
            throw new Error('Error loading messages');
        }
    }

    async addMessages(sessionId, messages) {
        try {
            const batch = this.db.batch();
            messages.forEach(message => {
                const docRef = this.db.collection('sessions').doc(sessionId).collection('messages').doc();
                batch.set(docRef, {
                    ...message,
                    createdAt: FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
        } catch (error) {
            logger.error('Error adding messages to Firestore', error);
            throw new Error('Error adding messages to Firestore');
        }
    }

    async summarizeMessages(sessionId) {
        try {
            const lastSummary = await this.loadSummary(sessionId);
            const lastSummaryDate = lastSummary ? lastSummary.updatedAt : null;
            const newMessages = await this.getLastNMessages(sessionId, null, lastSummaryDate);

            const combinedMessages = [
                lastSummary ? `Previous summary: ${lastSummary.summary}` : '',
                ...newMessages.map(msg => `${msg.role === 'human' ? 'User' : 'AI'}: ${msg.content}`)
            ].join('\n');

            const prompt = loadTemplate('summary', { combinedMessages });
            const response = await this.model.invoke([{ role: 'system', content: prompt }]);

            return response.content;
        } catch (error) {
            logger.error('Error summarizing messages', error);
            throw new Error('Error summarizing messages');
        }
    }

    async saveSummary(sessionId, summary) {
        try {
            await this.db.collection('sessions').doc(sessionId).set({
                summary: summary,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            logger.error('Error saving summary to Firestore', error);
            throw new Error('Error saving summary to Firestore');
        }
    }

    async loadSummary(sessionId) {
        try {
            const doc = await this.db.collection('sessions').doc(sessionId).get();
            if (doc.exists) {
                return doc.data().summary || '';
            }
            return '';
        } catch (error) {
            logger.error('Error loading summary from Firestore', error);
            throw new Error('Error loading summary from Firestore');
        }
    }
}

module.exports = MemoryHandler;
