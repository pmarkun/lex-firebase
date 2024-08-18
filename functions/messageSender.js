const twilio = require('twilio');
const logger = require("firebase-functions/logger");

class MessageSender {
    constructor() {
        this.cliente = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        this.messageQueue = [];
        this.sending = false;
        this.buffer = '';
    }

    async sendMessage(from, to, responseStream) {
        let fullResponse = ''; // To collect the full response
        if (typeof responseStream === 'string') {
            responseStream = [{ content: responseStream }];
        }

        for await (const chunk of responseStream) {
            fullResponse += chunk.content;
            this.buffer += chunk.content;
            if (this.buffer.length >= 1600) {
                let splitIndex = this.buffer.lastIndexOf('.', 1600);
                if (splitIndex === -1) splitIndex = this.buffer.lastIndexOf('\n', 1600);
                if (splitIndex === -1) splitIndex = 1600;
                
                const part = this.buffer.slice(0, splitIndex + 1);
                this.buffer = this.buffer.slice(splitIndex + 1).trim();
                this.messageQueue.push({ from, to, body: part });
            }
            await this.processQueue(from, to);
        }

        if (this.buffer.length > 0) {
            this.messageQueue.push({ from, to, body: this.buffer });
            this.buffer = '';
        }

        await this.processQueue(from, to);
        return fullResponse; // Return the full response at the end
    }

    async processQueue(from, to) {
        if (this.sending) return;
        this.sending = true;

        console.log('SENDING...', from, to, this.messageQueue.length);

        while (this.messageQueue.length > 0) {
            const { body } = this.messageQueue.shift();
            try {
                const response = await this.cliente.messages.create({ from, to, body });
                logger.info('Message sent', { body, response });
            } catch (error) {
                logger.error('Error sending message', error);
            }
        }

        this.sending = false;
    }
}

module.exports = MessageSender;
