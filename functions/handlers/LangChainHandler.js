const { InMemoryChatMessageHistory } = require("@langchain/core/chat_history");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { RunnableWithMessageHistory, RunnablePassthrough, RunnableSequence } = require("@langchain/core/runnables");
const { OpenAIEmbeddings, ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const MemoryHandler = require('./memoryHandler');
const MessageSender = require('../messageSender');
const logger = require("firebase-functions/logger");
const { loadTemplate } = require("../util");

const weaviate = require('weaviate-client').default;
const { WeaviateStore } = require("@langchain/weaviate");

const messageHistories = {};

class LangChainHandler {
    constructor() {

        this.model = new ChatOpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            model: "gpt-4o-mini",
            temperature: 0
        });

        // Prompt Default
        this.prompt = ChatPromptTemplate.fromMessages([
            ["system", loadTemplate('default', {})],
            ["ai", loadTemplate('rag'), { loaded_rag: "{loaded_rag}" }],
            ["placeholder", "{chat_history}"],
            ["human", "{input}"],
        ]);




        // The `RunnablePassthrough.assign()` is used here to passthrough the input from the `.invoke()`
        // call (in this example it's the question), along with any inputs passed to the `.assign()` method.
        // In this case, we're passing the schema.

        this.getRag = async (input) => {

            // RAG
            const weaviateClient = await weaviate.connectToWeaviateCloud(
                process.env.WEAVIATE_HOST,
                {
                    headers: {
                        'X-Openai-Api-Key': process.env.OPENAI_API_KEY
                    },
                    authCredentials: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY),
                }
            )
    
            const result = await weaviateClient.collections.get('PositiveLibraryDocument')
                .query.nearText(input);
        
            console.log('\n\n\n');
            console.log(JSON.stringify(result, null, 2));
            console.log('retornei objetos');
            console.log('\n\n\n');
            

            return result.objects;
            
        }





        this.memoryHandler = new MemoryHandler();
        this.messageSender = new MessageSender();
    }




    async processResponse(threadId, userRef, twilioFrom, twilioTo, inputMessage) {


        const sessionId = threadId;  // Usar threadId como sessionId
        const config = {
            configurable: {
                sessionId: sessionId,
            },
            metadata: {
                session_id: sessionId,
                twilioFrom: twilioFrom,
                twilioTo: twilioTo,
                userRef: userRef,
            }
        };

        const inputs = { 
            input: inputMessage,
            loaded_rag: await this.getRag(inputMessage)
        };

        logger.info('Processing input', { inputs });

        // const results = await this.runWeaviate(inputMessage);
        // console.log('WEAVIATE RESULTS', results);
        
        // const weaviateRagChain = RunnablePassthrough.assign({
        //     loaded_rag: async () => {
        //         console.log('\n\n\n');
        //         console.log('GETTING RAG FOR:', inputMessage)
        //         console.log('\n\n\n');
        //         return await this.getRag(inputMessage);
        //     }
        // });
        

        const chain = this.prompt
            // .pipe(weaviateRagChain)
            // .pipe(this.withMessageHistory)
            .pipe(this.model);

        // Message History
        const withMessageHistory = new RunnableWithMessageHistory({
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

        const responseStream = await withMessageHistory.stream(inputs, config);

        // const responseStream = await chain.pipe(new StringOutputParser()).stream(inputMessage);

        // Send message via stream and collect full response
        const fullResponse = await this.messageSender.sendMessage(twilioFrom, twilioTo, responseStream);
        logger.info('Response sent via stream');





        const chatHistory = await withMessageHistory.getMessageHistory(sessionId);
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
