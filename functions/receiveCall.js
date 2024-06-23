const admin = require('firebase-admin');
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const OpenAI = require('openai');
const twilio = require('twilio');

const tiktoken = require('tiktoken');
const { limpaNumero, adicionaNove } = require('./util');

require('dotenv').config();
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
const { OPENAI_API_KEY, ASSISTANT_ID_VOICE } = process.env;
const { roles } = require('./roles');

const cliente = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);


const apiKey = OPENAI_API_KEY;
if (!apiKey) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY");
}
const assistantId = ASSISTANT_ID_VOICE;
if (!assistantId) {
    throw new Error("Missing required environment variable: ASSISTANT_ID");
}

const openai = new OpenAI({ apiKey });


// Inicializa o Firebase Admin SDK
if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json'); // Caminho para o arquivo JSON
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}


const db = getFirestore("lexai"); // Inicializa o Firestore


const calculateTokens = (text, encoding='') => {
    const tokensLength = tiktoken.encoding_for_model('gpt-4o').encode(text).length;
    logger.info('TOKENS', tokensLength);
    return tokensLength;
}


// Função para obter ou criar uma thread para um usuário
async function getOrCreateVoiceThread(userId) {
    try {
        logger.info("Checking user document", { userId });

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        logger.info("User document fetched", { exists: userDoc.exists });

        if (userDoc.exists && userDoc.data().threadIdVoice) {
            // TODO: se a thread tiver mais de 24 horas é interessante criar uma outra!
            const threadId = userDoc.data().threadIdVoice;
            if (threadId) {
                return threadId;
            }
        } else {
            const thread = await openai.beta.threads.create();
            await userRef.update({ threadIdVoice: thread.id });
            logger.info("New thread created for user", { userId, threadId: thread.id });
            return thread.id;
        }
    } catch (error) {
        logger.error("Error in getOrCreateThread", { error: error.message });
        throw error;
    }
}



exports.receiveCall = onRequest(async (req, res) => {
    // try {
        console.log('CALL', req.body);
        const twiml = new twilio.twiml.VoiceResponse();

        /*
            CallSid: armazenar no banco dados da ligação
            CallerCity
            CalledState
            From
        */

        // const incomingMessage = req.body.Body;
        const from = req.body.From; // O número de telefone do remetente
        const speechResult = req.body.SpeechResult; 
        const msg = req.body.msg;

        const threadId = await getOrCreateVoiceThread(from);


        // Adicionar a mensagem ao thread
        if (msg == 'Gather End') {
            // Retorno padrão sem resposta para Webhook da Twilio
            twiml.gather({
                input: 'speech',
                language: 'pt-BR',
                // maxSpeechTime: 600,
                speechModel: 'experimental_conversations',
                speechTimeout: 'auto',
                language: 'pt-BR',
                actionOnEmptyResult: true
            }).say({
                language: 'pt-BR',
                voice: 'Polly.Vitoria-Neural',
                // 'Google.pt-BR-Neural2-A'

            }, 'Desculpe, não entendi o que você falou. Pode repetir novamente por favor?');
            res.writeHead(200, {'Content-Type': 'text/xml'});
            res.end(twiml.toString());
        } else {

            if(!speechResult) {
                // Retorno padrão sem resposta para Webhook da Twilio
                twiml.say({
                    language: 'pt-BR',
                    voice: 'Polly.Vitoria-Neural',
                    // 'Google.pt-BR-Neural2-A'

                }, 'Olá da Lex, a primeira inteligência artificial legislativa do Brasil.');
                twiml.gather({
                    input: 'speech',
                    language: 'pt-BR',
                    // maxSpeechTime: 600,
                    speechModel: 'experimental_conversations',
                    speechTimeout: 'auto',
                    language: 'pt-BR',
                    actionOnEmptyResult: true,
                    enhanced: true
                }).say({
                    language: 'pt-BR',
                    voice: 'Polly.Vitoria-Neural',
                    // 'Google.pt-BR-Neural2-A'

                }, 'Como posso ajudar você hoje?');
                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
                
                


            } else {

                console.log('SPEECH: ', speechResult);
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: speechResult
                });

                let buffer = '';
                const run = await openai.beta.threads.runs
                    .stream(threadId, {
                        assistant_id: assistantId,
                        max_completion_tokens: process.env.MAX_COMPLETION_TOKENS | 8096,
                        max_prompt_tokens: process.env.MAX_PROMPT_TOKENS | 60000
                    })
                    .on('textCreated', (text) => console.log('\nassistant > '))
                    .on('textDone', async (content, snapshot) => {
                        console.log('CONTENT', content)

                        if (content.value.indexOf('<DESLIGA>') > 0) {
                            // Retorno padrão sem resposta para Webhook da Twilio
                            twiml.say({
                                language: 'pt-BR',
                                voice: 'Polly.Vitoria-Neural',
                                // 'Google.pt-BR-Neural2-A'

                            }, content.value.split('<DESLIGA>').join(''));
                        } else {
                            // Retorno padrão sem resposta para Webhook da Twilio
                            twiml.gather({
                                input: 'speech',
                                language: 'pt-BR',
                                // maxSpeechTime: 600,
                                speechModel: 'default',
                                speechTimeout: 'auto',
                                language: 'pt-BR',
                                actionOnEmptyResult: true,
                                enhanced: true
                            }).say({
                                language: 'pt-BR',
                                voice: 'Polly.Vitoria-Neural',
                                // 'Google.pt-BR-Neural2-A'

                            }, `${content.value}`);
                        }

                        res.writeHead(200, {'Content-Type': 'text/xml'});
                        res.end(twiml.toString());

                    })
                    .on('toolCallCreated', (toolCall) => console.log(`\nassistant > ${toolCall.type}\n\n`))
                    .on('toolCallDelta', (toolCallDelta, snapshot) => {
                        if (toolCallDelta.type === 'code_interpreter') {
                            if (toolCallDelta.code_interpreter.input) {
                                console.log(toolCallDelta.code_interpreter.input);
                            }
                            if (toolCallDelta.code_interpreter.outputs) {
                                console.log('\noutput >\n');
                                toolCallDelta.code_interpreter.outputs.forEach((output) => {
                                    if (output.type === 'logs') {
                                        console.log(`\n${output.logs}\n`);
                                    }
                                });
                            }
                        }
                    }
                );

            }
        }
    // } catch (error) {
    //     logger.error("Error processing message", { error: error.message });
    //     if (error.response) {
    //         logger.error("Response data", { data: error.response.data });
    //         logger.error("Response status", { status: error.response.status });
    //         logger.error("Response headers", { headers: error.response.headers });
    //     }
    //     res.status(500).send("Internal Server Error");
    // }
});
