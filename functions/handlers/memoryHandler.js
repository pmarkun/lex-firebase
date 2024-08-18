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

    async getMessagesSinceLastSummary(sessionId) {
        try {
            const summary = await this.loadSummary(sessionId);
            const messages = [];
            let messagesRef = this.db.collection('sessions').doc(sessionId).collection('messages').orderBy('createdAt', 'desc');
            if (summary && summary.updatedAt) {
                //adiconar a mensagem de sumario no messages
                messagesRef = messagesRef.where('createdAt', '>', summary.updatedAt);
            }  

            const snapshot = await messagesRef.get();
            
            snapshot.forEach(doc => {
                messages.push(doc.data());
            });

            if (!summary || messages.length > 10) {
                logger.info('Summarizing messages after 9 messages');
                this.summarizeMessages(sessionId, messages)
                    .then(summary => this.saveSummary(sessionId, summary)) 
                    .catch(error => logger.error('Error in async summarization', error));
            }

            if (summary && summary.content) {
                messages.push({ role: 'ai', content: summary.content });
            }

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

    async summarizeMessages(sessionId, messages) {
        try {
            const summary = await this.loadSummary(sessionId);
            const messagesContent = messages.map(msg => `${msg.role === 'human' ? 'Human' : 'AI'}: ${msg.content}`).join('\n');

            const summaryPrompt = loadTemplate('summary', {});
            const messagePrompt = loadTemplate('messagesCompile', { messages: messagesContent, lastSummary: summary.content});
            const response = await this.model.invoke([
                new SystemMessage({ content: summaryPrompt }),
                new HumanMessage({ content: messagePrompt })
            ]);

            logger.info('Summary response:', response.content);
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
                return { content: doc.data().summary || '',
                         updatedAt: doc.data().updatedAt || null };
            }
            return {};
        } catch (error) {
            logger.error('Error loading summary from Firestore', error);
            throw new Error('Error loading summary from Firestore');
        }
    }
}

module.exports = MemoryHandler;
