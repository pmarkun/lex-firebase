const { openai } = require('../config');
const twilio = require('twilio');
const { FieldValue } = require('firebase-admin/firestore');
const logger = require("firebase-functions/logger");
const { loadTemplate } = require('../util');

class OpenAIHandler {
    constructor() {
        this.cliente = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    }

    async transcribeAudio(audioBuffer, audioContentType) {
        return await openai.audio.transcriptions.create({
            file: await OpenAI.toFile(audioBuffer, `audio.${audioContentType.split('/').pop()}`),
            model: 'whisper-1'
        });
    }

    async createMessage(threadId, userMessage) {
        await openai.beta.threads.messages.create(threadId, userMessage);
    }

    async processResponse(threadId, userRef, twilioFrom, twilioTo) {
        let buffer = '';
        const maxCompletionTokens = parseInt(process.env.MAX_COMPLETION_TOKENS) || 8096;
        const maxPromptTokens = parseInt(process.env.MAX_PROMPT_TOKENS) || 60000;

        const run = openai.beta.threads.runs
            .stream(threadId, {
                assistant_id: process.env.ASSISTANT_ID,
                max_completion_tokens: maxCompletionTokens,
                max_prompt_tokens: maxPromptTokens
            })
            .on('textCreated', async (text) => { })
            .on('textDelta', async (textDelta, snapshot) => {
                buffer += textDelta.value;
                logger.info('textDelta received', { textDelta });

                if (buffer.length >= 500) {
                    let mensagem = '';
                    const temQuebra = buffer.lastIndexOf('\n\n') > 0;
                    mensagem = buffer.substring(0, buffer.lastIndexOf(temQuebra ? '\n\n' : '. ') + (temQuebra ? 2 : 1));
                    buffer = buffer.substring(buffer.lastIndexOf(temQuebra ? '\n\n' : '. ') + (temQuebra ? 2 : 1)).trimStart();

                    logger.info('Sending partial message', { mensagem, twilioFrom, twilioTo });
                    const response = await this.cliente.messages.create({
                        from: twilioFrom,
                        to: twilioTo,
                        body: mensagem
                    });
                    logger.info('Partial message sent', { mensagem, response });
                }
            })
            .on('textDone', async (text, snapshot) => {
                logger.info('textDone received', { text });
                if (buffer.length !== 0) {
                    // Não mandar se buffer estiver vazio
                    logger.info('Sending final message', { buffer, twilioFrom, twilioTo });
                    const response = await this.cliente.messages.create({
                        from: twilioFrom,
                        to: twilioTo,
                        body: buffer
                    });
                    logger.info('Final message sent', { buffer, response });
                }

                await userRef.collection('logs').doc(threadId).collection('messages').add({
                    createdAt: FieldValue.serverTimestamp(),
                    role: 'assistant',
                    ...text
                });
                logger.info('Message logged', { text });
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
                logger.info('TOOL CALL CREATED', toolCall);

                const supportMessage = loadTemplate('support', {});
                logger.info('Sending tool call message', { twilioFrom, twilioTo });
                const response = await this.cliente.messages.create({
                    from: twilioFrom,
                    to: twilioTo,
                    body: supportMessage
                });
                logger.info('Tool call message sent', { response });
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
            }).on('end', async () => {
                console.log("end event");
            });

        logger.info("Run completed", { runId: run.id, status: run.status });
    }
}

module.exports = OpenAIHandler;
