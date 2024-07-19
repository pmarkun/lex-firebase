const { InMemoryChatMessageHistory } = require("@langchain/core/chat_history");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { RunnableWithMessageHistory } = require("@langchain/core/runnables");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");
const twilio = require('twilio');
const MemoryHandler = require('./memoryHandler');
const logger = require("firebase-functions/logger");
const { loadTemplate } = require("../util");

const messageHistories = {};

class LangChainHandler {
    constructor() {
        this.model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: "gpt-3.5-turbo",
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
                    
                    const lastSummary = await this.memoryHandler.loadSummary(sessionId);
                    if (lastSummary) {
                        await messageHistories[sessionId].addMessages([
                            new SystemMessage({ content: lastSummary })
                        ]);
                    }
                    
                    const lastMessages = await this.memoryHandler.getLastNMessages(sessionId, 10);
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
        this.cliente = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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

        await this.memoryHandler.addMessages(sessionId, [
            { role: 'human', content: inputMessage },
            { role: 'ai', content: finalMessage }
        ]);

        logger.info('Message logged', { finalMessage });
    }

    async summarizeAndSaveMessages(threadId) {
        const sessionId = threadId;
        const summary = await this.memoryHandler.summarizeMessages(sessionId);
        await this.memoryHandler.saveSummary(sessionId, summary);
    }
}

module.exports = LangChainHandler;
