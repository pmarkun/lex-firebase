
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const OpenAI = require('openai');
require('dotenv').config();
const { OPENAI_API_KEY } = process.env;
const openai = new OpenAI();

exports.loadTemplate = function(templateName, context) {
    const templatePath = path.join(__dirname, 'templates', `${templateName}.hbs`);
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(templateContent);
    return template(context);
};

exports.escondeNumero = function(number) {
    // +5511999991234 => +55119****-1234
    if (number) number = number.replace('whatsapp:', '');
    if (!number || number.length < 12) return '+-----****-----';
    return number.substr(0, number.length - 8) + '****-' + number.substr(number.length - 4 )
}

exports.primeiroNome = function(nome) {
    return `${nome}`.split(' ')[0];
}
exports.adicionaPais = function(number) {
    if(number.indexOf('+') < 0) {
        return `+55${number}`
    }
    return number;
}
exports.limpaNumero = function(number, removeMais) {
    if (number) number = number.replace('whatsapp:', '');
    if (number && removeMais) number = number.replace('+', '');
    return number;
}

exports.getDDD = function(number) {
    if (number) number = number.replace('whatsapp:+', '');
    number = number.substr(0,4);
    return number;
}

exports.validateEmail = function(email) {
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

exports.convertNewLine = (text) => {
    return text.split('<e>').join('\n');
}

exports.fillParams = (text, params) => {
    return Object.keys(params).reduce((prev, key)=> {
        return prev.split(`{{${key}}}`).join(params[key]);
    }, `${text}`);
}

exports.sendNotification = async (client, from, to, message) => {
    return await client.messages.create({
        from: from,
        to: to,
        body: message
    });
}
  
exports.sendNotificationMedia = async (client, from, to, message, mediaUrl) => {
    return await client.messages.create({
        from: from,
        to: to,
        body: message,
        mediaUrl
    });
}

exports.adicionaNove = (number) => {
    if (number.split('+55').length > 1) {
        if (number.length == 13) {
            return number.substr(0, number.length - 8) + '9' + number.substr(number.length - 8);
        }
        return number;
    }
    return number;
}


exports.replaceVariablesTemplateMessage = (message, data) => {
    message = message.split('\\n').join('\n');
    
    Object.keys(data).forEach((field) => {
        message = message.split(`{{${field}}}`).join(data[field])
    });
    return message;
}


//Função auxiliar para transcrever áudio (TODO: mudar para local)
exports.transcribeAudio = async (audioBuffer, audioContentType) => {
    return await openai.audio.transcriptions.create({
        file: await OpenAI.toFile(audioBuffer, `audio.${audioContentType.split('/').pop()}`),
        model: 'whisper-1'
    });
}

// Função auxiliar para baixar arquivo do Twilio (necessário pela autenticação)
exports.downloadTwilioMediaBase64 = async (mediaUrl) => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

    const axios = require('axios'); // Para chamadas HTTP
    return await axios
        .get(mediaUrl, {
            responseType: 'arraybuffer',
            auth: {
                username: TWILIO_ACCOUNT_SID,
                password: TWILIO_AUTH_TOKEN
            }
        })
        .then(response => {
            const result = {
                contentType: response.headers['content-type'],
                base64: Buffer.from(response.data, 'binary').toString('base64')
            }
            return result;
        }).catch(e => {
            console.error('ERROR!', e);
            return null;
        });
}

exports.downloadTwilioMedia = async (mediaUrl) => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

    const axios = require('axios'); // Para chamadas HTTP
    return await axios
        .get(mediaUrl, {
            responseType: 'arraybuffer',
            auth: {
                username: TWILIO_ACCOUNT_SID,
                password: TWILIO_AUTH_TOKEN
            }
        })
        .then(response => {
            const result = {
                contentType: response.headers['content-type'],
                buffer: Buffer.from(response.data, 'binary')
            }
            return result;
        }).catch(e => {
            console.error('ERROR!', e);
            return null;
        });
}