// LangChainHandler.js

const { InMemoryChatMessageHistory } = require("@langchain/core/chat_history");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { RunnableWithMessageHistory } = require("@langchain/core/runnables");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const MemoryHandler = require('./memoryHandler');
const logger = require("firebase-functions/logger");
const { loadTemplate } = require("../util");

class LangChainHandler {
    constructor(messageSender) {
        this.model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: "gpt-4o-mini",
            temperature: 0,
        });

        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", loadTemplate('default', {})],
            ["ai", loadTemplate('rag'), { loaded_rag: "{loaded_rag}" }],
            ["placeholder", "{chat_history}"],
            ["human", "{input}"],
        ]);

        // Initialize message history storage
        this.messageHistories = {};

        this.memoryHandler = new MemoryHandler();
        this.messageSender = messageSender; // Injected messageSender
    }

    async processResponse(threadId, userRef, from, to, inputMessage) {
        const sessionId = threadId;
        const config = {
            configurable: {
                sessionId: sessionId,
            },
            metadata: {
                session_id: sessionId,
                from: from,
                to: to,
                userRef: userRef,
            },
        };

        const inputs = {
            input: inputMessage,
            loaded_rag: {}, // Removed RAG for now
        };

        logger.info('Processing input', { inputs });

        const chain = this.prompt.pipe(this.model);

        // Message History
        const withMessageHistory = new RunnableWithMessageHistory({
            runnable: chain,
            getMessageHistory: async (sessionId) => {
                if (!this.messageHistories[sessionId]) {
                    this.messageHistories[sessionId] = new InMemoryChatMessageHistory();
                    const lastMessages = await this.memoryHandler.getMessagesSinceLastSummary(sessionId);
                    await this.messageHistories[sessionId].addMessages(lastMessages.map(msg => {
                        if (msg.role === 'human') {
                            return new HumanMessage({ content: msg.content });
                        } else {
                            return new AIMessage({ content: msg.content });
                        }
                    }));
                }
                return this.messageHistories[sessionId];
            },
            inputMessagesKey: "input",
            historyMessagesKey: "chat_history",
        });

        const responseStream = await withMessageHistory.stream(inputs, config);

        // Send message via stream and collect full response
        const fullResponse = await this.messageSender.sendMessage(from, to, responseStream);
        logger.info('Response sent via stream');

        const chatHistory = await withMessageHistory.getMessageHistory(sessionId);
        await chatHistory.addMessages([
            new HumanMessage({ content: inputMessage }),
            new AIMessage({ content: fullResponse }),
        ]);

        await this.memoryHandler.addMessages(sessionId, [
            { role: 'human', content: inputMessage },
            { role: 'ai', content: fullResponse },
        ]);

        logger.info('Message logged');
    }

    async summarizeAndSaveMessages(threadId) {
        const sessionId = threadId;
        const summary = await this.memoryHandler.summarizeMessages(sessionId);
        await this.memoryHandler.saveSummary(sessionId, summary);
    }
}

module.exports = LangChainHandler;