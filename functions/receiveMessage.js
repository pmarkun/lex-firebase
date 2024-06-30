const admin = require('firebase-admin');
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const OpenAI = require('openai');
const twilio = require('twilio');

const tiktoken = require('tiktoken');
const { limpaNumero, adicionaNove, downloadTwilioMedia } = require('./util');

require('dotenv').config();
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
const { roles } = require('./roles');


// Inicializa o Firebase Admin SDK
if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json'); // Caminho para o arquivo JSON
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}


const db = getFirestore("lexai"); // Inicializa o Firestore


const cliente = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const { OPENAI_API_KEY, ASSISTANT_ID } = process.env;
if (!OPENAI_API_KEY) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY");
}
if (!ASSISTANT_ID) {
    throw new Error("Missing required environment variable: ASSISTANT_ID");
}
const openai = new OpenAI({ OPENAI_API_KEY });



const calculateTokens = (text, encoding='') => {
    const tokensLength = tiktoken.encoding_for_model('gpt-4o').encode(text).length;
    logger.info('TOKENS', tokensLength);
    return tokensLength;
}

// // Função para dividir a mensagem em partes menores
// function splitMessage(message, maxLength) {
//     const messages = [];
//     let startIndex = 0;

//     while (startIndex < message.length) {
//         let endIndex = startIndex + maxLength;

//         if (endIndex < message.length) {
//             // Tentar encontrar o último ponto final antes do limite de comprimento
//             const lastPeriod = message.lastIndexOf('.', endIndex);

//             if (lastPeriod > startIndex) {
//                 endIndex = lastPeriod + 1; // Inclui o ponto final
//             }
//         }

//         messages.push(message.substring(startIndex, endIndex).trim());
//         startIndex = endIndex;
//     }

//     return messages;
// }

// Função para verificar tokens e atualizar se necessário
async function checkAndUpdateUserTokens(userId, profileName) {
    try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        let userData = userDoc.data();
        if (!userDoc.exists) {
            // Cria o usuário se não existir
            userData = {
                phone: userId,
                profileName,
                currentTokens: 0,
                role: roles.guest,
                maxTokens: 0, // Defina o limite de tokens inicial como 0
                lastMessageTime: FieldValue.serverTimestamp()
            };
            await userRef.set(userData);
        }

        const now = new Date();
        const lastMessageTime = userData.lastMessageTime;
        const currentTokens = userData.currentTokens || 0;
        const maxTokens = userData.maxTokens || 0;

        if (lastMessageTime && (now - lastMessageTime) / (1000 * 60 * 60) >= 24) { // TODO: qual regra é essa?
            await userRef.update({
                currentTokens: 0,
                lastMessageTime: FieldValue.serverTimestamp()
            });
            userData.currentTokens = 0;
        }

        return { currentTokens: userData.currentTokens, maxTokens, userRef, role: userData.role };
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
        logger.info("Checking user document", { userId });

        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        logger.info("User document fetched", { exists: userDoc.exists });

        if (userDoc.exists && userDoc.data().threadId) {
            const threadId = userDoc.data().threadId;

            // TODO: se a thread tiver mais de 24 horas é interessante criar uma outra!
            userRef.collection('logs').doc(threadId).update({
                updatedAt: FieldValue.serverTimestamp(),
                count: FieldValue.increment(1)
            })

            if (threadId) {
                return threadId;
            }
        } else {
            const thread = await openai.beta.threads.create();
            logger.info('create thread...', thread);
            await userRef.update({ threadId: thread.id });
            userRef.collection('logs').doc(thread.id).create({
                type: 'openai',
                createdAt: FieldValue.serverTimestamp(),
                count: 1,
                thread
            })
            logger.info("New thread created for user", { userId, threadId: thread.id });
            return thread.id;
        }
    } catch (error) {
        logger.error("Error in getOrCreateThread", { error: error.message });
        throw error;
    }
}



exports.receiveMessage = onRequest(async (req, res) => {
    // try {
        let incomingMessage = req.body.Body;
        const hasAudio = req.body.MessageType == 'audio';
        const from = adicionaNove(limpaNumero(req.body.From)); // O número de telefone do remetente
        const profileName = req.body.ProfileName;

        logger.info("Incoming message received", { message: incomingMessage, from, profileName });

        // Verificar permissões do usuário e tokens
        const { currentTokens, maxTokens, userRef, role } = await checkAndUpdateUserTokens(from, profileName);

        logger.info(`${from}: maxTokens ${maxTokens}`);
        switch(role) {
            case roles.admin:
            case roles.editor:
                logger.info('Role is Admin or Editor');
                // Não fazer nada e permitir conversar!
                break;
            case roles.user:
            case roles.guest:
            default:
                logger.info('Role is Guest or User');
                if (maxTokens === 0) {
                    // Usuário não autorizado
                    const twiml = new twilio.twiml.MessagingResponse();
                    twiml.message(`Oi, eu sou Lex, a primeira inteligência artificial legislativa do mundo. Se você chegou até aqui e quer participar dessa transformação, acesse lex.tec.br e apoie nosso projeto.\n\nCom isso você vai ter acesso à todas as minhas funcionalidades e ajudar a construir o futuro da política.`);
        
                    res.writeHead(200, {'Content-Type': 'text/xml'});
                    return res.end(twiml.toString());
                }
                break;
        }

        // TODO: verificar se mensagem ultrapassa limite de tokens disponíveis

        // Retorno padrão sem resposta para Webhook da Twilio
        const twiml = new twilio.twiml.MessagingResponse();
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());





        // BACKGROUND AREA

            // // Logar todas as mensagens na thread
            // const messages = await openai.beta.threads.messages.list(threadId);
            // logger.info("All messages in the thread", { threadId, messages: messages.data });

        if (hasAudio) {
            const audioUrl = req.body.MediaUrl0;
            const audioContentType = req.body.MediaContentType0;
            logger.info('DOWNLOAD MEDIA', { url: req.body.MediaUrl0, MessageType: req.body.MessageType, ContentType: req.body.MediaContentType0 });
            let audioBuffer = await downloadTwilioMedia(audioUrl);

            logger.info(`MEDIA SIZE: ${audioBuffer.buffer.length}`);

            if (audioBuffer.buffer.length > 30000) {
                await cliente.messages.create({
                    from: req.body.To,
                    to: req.body.From,
                    body: `Só um momento. Estou escutando seu áudio...`
                });

            }

            const transcription = await openai.audio.transcriptions.create({
                file: await OpenAI.toFile(audioBuffer.buffer, `audio.${audioContentType.split('/').pop()}`),
                model: 'whisper-1'
                // language: "de", // this is optional but helps the model
            });

            logger.info('TRANSCRIPTION', transcription);
            // console.log(transcription.text);
            incomingMessage = transcription.text;

            // TODO: se audio for grande, enviar mensagem de espera
        }


            


        // Obter ou criar uma thread para o usuário
        const threadId = await getOrCreateThread(from);
        logger.info("Thread ID for user", { from, threadId });

        // TODO: incluir informações de total de doações, data atual e o que for necessário
        // await openai.beta.threads.messages.create(threadId, {
        //    role: "system",
        //    content: ""
        // });

        // Adicionar a mensagem ao thread
        let userMessage = {
            role: "user",
            content: incomingMessage
        }
        await openai.beta.threads.messages.create(threadId, userMessage);
        await userRef.collection('logs').doc(threadId).collection('messages').add({
            ...userMessage,
            createdAt: FieldValue.serverTimestamp()
        });

        let buffer = '';
        const run = openai.beta.threads.runs
            .stream(threadId, {
                assistant_id: ASSISTANT_ID,
                max_completion_tokens: process.env.MAX_COMPLETION_TOKENS | 8096,
                max_prompt_tokens: process.env.MAX_PROMPT_TOKENS | 60000
            })
            .on('textCreated', async (text) => {
            })
            .on('textDelta', async (textDelta, snapshot) => {
                buffer += textDelta.value;

                if (buffer.length >= 500) {
                    let mensagem = '';
                    const temQuebra = buffer.lastIndexOf('\n\n') > 0;
                    mensagem = buffer.substring(0, buffer.lastIndexOf(temQuebra ? '\n\n' : '. ') + ( temQuebra ? 2 : 1));
                    buffer = buffer.substring(buffer.lastIndexOf(temQuebra ? '\n\n' : '. ') + ( temQuebra ? 2 : 1)).trimStart();

                    await cliente.messages.create({
                        from: req.body.To,
                        to: req.body.From,
                        body: mensagem
                    });

                }
            })
            .on('textDone', async (text, snapshot) => {
                if (buffer.length !== 0) {
                    // Nao mandar se buffer estiver vazio
                    await cliente.messages.create({
                        from: req.body.To,
                        to: req.body.From,
                        body: buffer
                    });
                }

                await userRef.collection('logs').doc(threadId).collection('messages').add({
                    createdAt: FieldValue.serverTimestamp(),
                    role: 'assistant',
                    ...text
                });

            })

            .on('runStepCreated', async (runStep) => {
                logger.info("runStepCreated:", JSON.stringify(runStep));
            })
            .on('runStepDelta', async (delta, snapshot) => {
                logger.info("runStepDelta:", JSON.stringify(delta));
            })
            .on('runStepDone', async (runStep, snapshot) => {
                logger.info("runStepDone:", JSON.stringify(runStep));
            })


            .on('toolCallCreated', async (toolCall) => {
                console.log(`\nassistant > ${toolCall.type}\n\n`);
                logger.info('TOOL CALL CREATED', toolCall);

                await cliente.messages.create({
                    from: req.body.To,
                    to: req.body.From,
                    body: `Um momento, pois preciso consultar meus arquivos...`
                });

            })
            .on('toolCallDelta', async (toolCallDelta, snapshot) => {
                logger.info('TOOL CALL DELTA', toolCallDelta);
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
            }).on('toolCallDone', (toolCall) => {
                logger.info('TOOL CALL DONE', toolCall);
                // console.log("toolCallDone:", JSON.stringify(toolCall));
                // toolChangedLast = true;
            }).on('end', async () => {
                console.log("end event");
                // res.end(); // Close the request
            }
        );

        
        // logger.info("Message added to thread", { threadId, message: incomingMessage });
        // console.log();
        // console.log();
        // console.log('incomingMessage', incomingMessage);
        // console.log();
        // console.log();


        // Criar e fazer o poll da execução
        // const run = await openai.beta.threads.runs.createAndStream(threadId, {
        //     assistant_id: assistantId,
        //     stream: true
        // });
        
        logger.info("Run completed", { runId: run.id, status: run.status });
        // console.log("Run completed", { runId: run.id, status: run.status });
        
        /*
        switch (run.status) {
            //If we are in any sort of intermediate state we poll
            case 'queued':
            case 'in_progress':
            case 'cancelling':
              let sleepInterval = 5000;
    
              if (options?.pollIntervalMs) {
                sleepInterval = options.pollIntervalMs;
              } else {
                const headerInterval = response.headers.get('openai-poll-after-ms');
                if (headerInterval) {
                  const headerIntervalMs = parseInt(headerInterval);
                  if (!isNaN(headerIntervalMs)) {
                    sleepInterval = headerIntervalMs;
                  }
                }
              }
              await sleep(sleepInterval);
              break;
            //We return the run in any terminal state.
            case 'requires_action':
            case 'incomplete':
            case 'cancelled':
            case 'completed':
            case 'failed':
            case 'expired':
              return run;
          }
          */


        // // Verificar se a execução foi completada e obter a resposta
        // if (run.status === 'completed') {
        //     const updatedMessages = await openai.beta.threads.messages.list(run.thread_id);
        //     const assistantMessages = updatedMessages.data.filter(msg => msg.role === 'assistant');
        //     const assistantMessage = assistantMessages.length > 0 ? assistantMessages[0].content[0].text.value : "No response from assistant.";
        //     logger.info("Response from assistant", { response: assistantMessage });

        //     console.log('\n\n\n');
        //     logger.info("UPDATED MESSAGES", updatedMessages);
        //     console.log('\n\n\n');

        //     // Formatar a resposta para Twilio
        //     const twiml = new twilio.twiml.MessagingResponse();
        //     const responseMessages = splitMessage(assistantMessage, 1500);

        //     await responseMessages.forEach(async msg => {
        //         twiml.message(msg)
        //         await cliente.messages.create({
        //             from: TWILIO_FROM,
        //             to: req.body.From,
        //             body: msg
        //         });
        //     });


        //     // Calcular tokens usados e atualizar tokens do usuário
        //     // TODO: verificar se a resposta inclui total de tokens utilizados.
        //     const tokensUsed = calculateTokens(incomingMessage) + calculateTokens(assistantMessage); //assistantMessage.length * 3; // Cálculo provisório de tokens
        //     await updateUserTokens(userRef, tokensUsed);

        // } else {
        //     logger.error("Run did not complete successfully", { status: run.status });
        //     res.status(500).send("Failed to get a response from assistant");
        // }



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
