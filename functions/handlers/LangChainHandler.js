const { InMemoryChatMessageHistory } = require("@langchain/core/chat_history");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { RunnableWithMessageHistory } = require("@langchain/core/runnables");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const MemoryHandler = require('./memoryHandler');
const MessageSender = require('../messageSender');
const logger = require("firebase-functions/logger");
const { loadTemplate } = require("../util");

const messageHistories = {};

class LangChainHandler {
    constructor() {
        this.model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: "gpt-4o-mini",
            temperature: 0
        });

        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", loadTemplate('default', {})],
            ["placeholder", "{chat_history}"],
            ["human", "{input}"],
        ]);

        const chain = this.prompt.pipe(this.model);

        this.withMessageHistory = new RunnableWithMessageHistory({
            runnable: chain,
            getMessageHistory: async (sessionId) => {
                if (!messageHistories[sessionId]) {
                    messageHistories[sessionId] = new InMemoryChatMessageHistory();
                    const lastMessages = await this.memoryHandler.getMessagesSinceLastSummary(sessionId);
                    await messageHistories[sessionId].addMessages(lastMessages.map(msg => {
                        if (msg.role === 'human') {
                            return new HumanMessage({ content: msg.content });
                        } else {
                            return new AIMessage({ content: msg.content });
                        }
                    }));
                }
                return messageHistories[sessionId];
            },
            inputMessagesKey: "input",
            historyMessagesKey: "chat_history",
        });

        this.memoryHandler = new MemoryHandler();
        this.messageSender = new MessageSender();
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
        const responseStream = await this.withMessageHistory.stream(inputs, config);

        // Send message via stream and collect full response
        const fullResponse = await this.messageSender.sendMessage(twilioFrom, twilioTo, responseStream);

        logger.info('Response sent via stream');

        const chatHistory = await this.withMessageHistory.getMessageHistory(sessionId);

        await chatHistory.addMessages([
            new HumanMessage({ content: inputMessage }),
            new AIMessage({ content: fullResponse })
        ]);

        await this.memoryHandler.addMessages(sessionId, [
            { role: 'human', content: inputMessage },
            { role: 'ai', content: fullResponse }
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
