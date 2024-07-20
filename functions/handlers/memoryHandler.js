const { FieldValue } = require('firebase-admin/firestore');
const logger = require("firebase-functions/logger");
const db = require('../firebase');
const { loadTemplate } = require('../util');
const { ChatOpenAI } = require("@langchain/openai");
const { SystemMessage, HumanMessage, AIMessage } = require("@langchain/core/messages");

class MemoryHandler {
    constructor() {
        this.db = db;
        this.model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: "gpt-4o-mini",
            temperature: 0
        });
    }

    async getMessagesSinceLastSummary(sessionId, lastSummaryDate = null) {
        try {
            let messagesRef = this.db.collection('sessions').doc(sessionId).collection('messages').orderBy('createdAt', 'desc');
            if (lastSummaryDate) {
                messagesRef = messagesRef.where('createdAt', '>', lastSummaryDate);
            }
            const snapshot = await messagesRef.get();
            const messages = [];
            snapshot.forEach(doc => {
                messages.push(doc.data());
            });
            return messages.reverse(); // Reverse to maintain chronological order
        } catch (error) {
            logger.error('Error loading messages since last summary', error);
            throw new Error('Error loading messages since last summary');
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
            const lastSummaryDate = await this.getLastSummaryDate(sessionId);
            const messages = await this.getMessagesSinceLastSummary(sessionId, lastSummaryDate);
            const messagesContent = messages.map(msg => `${msg.role === 'human' ? 'Human' : 'AI'}: ${msg.content}`).join('\n');
            const summaryPrompt = loadTemplate('summary', { messages: messagesContent });

            const response = await this.model.invoke([
                new SystemMessage({ content: summaryPrompt }),
                new HumanMessage({ content: messagesContent })
            ]);

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

    async getLastSummaryDate(sessionId) {
        try {
            const doc = await this.db.collection('sessions').doc(sessionId).get();
            if (doc.exists) {
                return doc.data().updatedAt || null;
            }
            return null;
        } catch (error) {
            logger.error('Error getting last summary date from Firestore', error);
            throw new Error('Error getting last summary date from Firestore');
        }
    }
}

module.exports = MemoryHandler;
