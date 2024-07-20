const fs = require("node:fs");
const { OpenAIEmbeddings, ChatOpenAI } = require("@langchain/openai");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { RunnablePassthrough, RunnableSequence } = require("@langchain/core/runnables");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { ChatPromptTemplate } = require("@langchain/core/prompts");

const formatDocumentsAsString = (documents) => {
  return documents.map((document) => document.pageContent).join("\n\n");
};

class DocumentRetriever {
  constructor() {
    this.model = new ChatOpenAI({
      model: "gpt-4o",
    });
  }

  async initializeRetriever(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
    const docs = await textSplitter.createDocuments([text]);
    
    // Create a vector store from the documents
    this.vectorStore = await MemoryVectorStore.fromDocuments(
      docs,
      new OpenAIEmbeddings()
    );

    // Initialize a retriever wrapper around the vector store
    this.vectorStoreRetriever = this.vectorStore.asRetriever();
  }

}

module.exports = DocumentRetriever;