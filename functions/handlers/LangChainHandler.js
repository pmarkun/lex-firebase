const { InMemoryChatMessageHistory } = require("@langchain/core/chat_history");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { RunnableWithMessageHistory } = require("@langchain/core/runnables");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { FieldValue } = require('firebase-admin/firestore');
const logger = require("firebase-functions/logger");
const twilio = require('twilio');
const { loadTemplate } = require('../util');

const messageHistories = {};

class LangChainHandler {
    constructor() {
        this.model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: "gpt-3.5-turbo",
            temperature: 0
        });

        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", "You are a helpful assistant who remembers all details the user shares with you."],
            ["placeholder", "{chat_history}"],
            ["human", "{input}"],
        ]);

        const chain = this.prompt.pipe(this.model);

        this.withMessageHistory = new RunnableWithMessageHistory({
            runnable: chain,
            getMessageHistory: async (sessionId) => {
                if (!messageHistories[sessionId]) {
                    messageHistories[sessionId] = new InMemoryChatMessageHistory();
                }
                return messageHistories[sessionId];
            },
            inputMessagesKey: "input",
            historyMessagesKey: "chat_history",
        });

        this.cliente = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }

    async transcribeAudio(audioBuffer, audioContentType) {
        // Implementação da transcrição, se necessário
    }

    async createMessage(threadId, userMessage) {
        // Implementação da criação de mensagem, se necessário
    }

    async processResponse(threadId, userRef, twilioFrom, twilioTo, inputMessage) {
        const sessionId = threadId;  // Usar threadId como sessionId
        const config = {
            configurable: {
                sessionId: sessionId,
            },
        };

        const inputs = { input: inputMessage };

        logger.info('Processing input', { inputs });
        const response = await this.withMessageHistory.invoke(inputs, config);

        logger.info('Response received', { response });

        const chatHistory = await this.withMessageHistory.getMessageHistory(sessionId);

        await chatHistory.addMessages([
            new HumanMessage({ content: inputMessage }),
            new AIMessage({ content: response.content }),
        ]);

        logger.info('Memory saved', chatHistory);

        const finalMessage = response.content;
        logger.info('Sending final message', { finalMessage, twilioFrom, twilioTo });

        const responseTwilio = await this.cliente.messages.create({
            from: twilioFrom,
            to: twilioTo,
            body: finalMessage
        });

        logger.info('Final message sent', { finalMessage, responseTwilio });

        await userRef.collection('logs').doc(threadId).collection('messages').add({
            createdAt: FieldValue.serverTimestamp(),
            role: 'assistant',
            content: finalMessage
        });
        logger.info('Message logged', { finalMessage });
    }
}

module.exports = LangChainHandler;
