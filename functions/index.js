const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const twilio = require('twilio');

// Inicializa o Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json'); // Caminho para o arquivo JSON
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

dotenv.config();

const db = getFirestore("lexai"); // Inicializa o Firestore

const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

const assistantId = process.env.ASSISTANT_ID;
if (!assistantId) {
  throw new Error("Missing required environment variable: ASSISTANT_ID");
}

// Função para verificar tokens e atualizar se necessário
async function checkAndUpdateUserTokens(userId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    let userData = userDoc.data();
    if (!userDoc.exists) {
      // Cria o usuário se não existir
      userData = {
        currentTokens: 0,
        maxTokens: 0, // Defina o limite de tokens inicial como 0
        lastMessageTime: Date.now()
      };
      await userRef.set(userData);
    }

    const now = new Date();
    const lastMessageTime = userData.lastMessageTime;
    const currentTokens = userData.currentTokens || 0;
    const maxTokens = userData.maxTokens;

    if (lastMessageTime && (now - lastMessageTime) / (1000 * 60 * 60) >= 24) {
      await userRef.update({
        currentTokens: 0,
        lastMessageTime: now
      });
      userData.currentTokens = 0;
    }

    return { currentTokens: userData.currentTokens, maxTokens, userRef };
  } catch (error) {
    logger.error("Error in checkAndUpdateUserTokens", { error: error.message });
    throw error;
  }
}

// Função para atualizar os tokens do usuário
async function updateUserTokens(userRef, tokensUsed) {
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

// Função para obter ou criar uma thread para um usuário
async function getOrCreateThread(userId) {
  try {
    const userRef = db.collection('users').doc(userId);
    logger.info("Checking user document", { userId });
    const userDoc = await userRef.get();
    logger.info("User document fetched", { exists: userDoc.exists });

    if (userDoc.exists && userDoc.data().threadId) {
      const threadId = userDoc.data().threadId;
      if (threadId) {
        return threadId;
      }
    } else {
      const thread = await openai.beta.threads.create();
      await userRef.set({ threadId: thread.id });
      logger.info("New thread created for user", { userId, threadId: thread.id });
      return thread.id;
    }
  } catch (error) {
    logger.error("Error in getOrCreateThread", { error: error.message });
    throw error;
  }
}

exports.receiveMessage = onRequest(async (req, res) => {
  try {
    const incomingMessage = req.body.Body;
    const from = req.body.From; // O número de telefone do remetente
    logger.info("Incoming message received", { message: incomingMessage, from });

    // Verificar permissões do usuário e tokens
    const { currentTokens, maxTokens, userRef } = await checkAndUpdateUserTokens(from);

    if (maxTokens === 0) {
      // Usuário não autorizado
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message("Você ainda não está autorizado a usar a LexAI");

      res.writeHead(200, {'Content-Type': 'text/xml'});
      return res.end(twiml.toString());
    }

    // Obter ou criar uma thread para o usuário
    const threadId = await getOrCreateThread(from);
    logger.info("Thread ID for user", { from, threadId });

    // Adicionar a mensagem ao thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: incomingMessage
    });
    logger.info("Message added to thread", { threadId, message: incomingMessage });

    // Logar todas as mensagens na thread
    const messages = await openai.beta.threads.messages.list(threadId);
    logger.info("All messages in the thread", { threadId, messages: messages.data });

    // Criar e fazer o poll da execução
    const run = await openai.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: assistantId
    });
    logger.info("Run completed", { runId: run.id, status: run.status });

    // Verificar se a execução foi completada e obter a resposta
    if (run.status === 'completed') {
      const updatedMessages = await openai.beta.threads.messages.list(run.thread_id);
      const assistantMessages = updatedMessages.data.filter(msg => msg.role === 'assistant');
      const assistantMessage = assistantMessages.length > 0 ? assistantMessages[0].content[0].text.value : "No response from assistant.";
      logger.info("Response from assistant", { response: assistantMessage });

      // Formatar a resposta para Twilio
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(assistantMessage);

      // Calcular tokens usados e atualizar tokens do usuário
      const tokensUsed = assistantMessage.length * 3; // Cálculo provisório de tokens
      await updateUserTokens(userRef, tokensUsed);

      res.writeHead(200, {'Content-Type': 'text/xml'});
      res.end(twiml.toString());
    } else {
      logger.error("Run did not complete successfully", { status: run.status });
      res.status(500).send("Failed to get a response from assistant");
    }
  } catch (error) {
    logger.error("Error processing message", { error: error.message });
    if (error.response) {
      logger.error("Response data", { data: error.response.data });
      logger.error("Response status", { status: error.response.status });
      logger.error("Response headers", { headers: error.response.headers });
    }
    res.status(500).send("Internal Server Error");
  }
});
