const admin = require('firebase-admin');
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const OpenAI = require('openai');
const twilio = require('twilio');

const { limpaNumero, adicionaPais, primeiroNome } = require('./util');

require('dotenv').config();
const { DONOR_TOKENS } = process.env;
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





exports.receiveDonation = onRequest(async (req, res) => {
    logger.info('NEW DONATION', req.body);
    logger.info('HEADERS', req.headers);

    // TODO: carregar dados da doação
    const { evento, dados } = req.body;

    Object.keys(dados).forEach((d) => {
        console.log('DADOS', d, ':', dados[d]);
        switch(d) {
            case 'created_at': 
            case 'captured_at': 
                if (dados[d]) {
                    dados[d] = Timestamp.fromDate(new Date(dados[d]));
                }
                break;
            case 'is_pre_campaign': 
            case 'is_boleto': 
            case 'is_pix': 
            case 'is_cc': 
                dados[d] = dados[d] === 1;
                break;
            case 'amount': 
                dados[d] = dados[d]/100; // salvar como centavos
                break;
            case 'donor_phone': 
                dados[d] = adicionaPais(limpaNumero(dados[d]));
                break;
        }
    });
    const userId = adicionaPais(limpaNumero(dados.donor_phone));
    const nome = primeiroNome(dados.donor_name);


    // TODO: salvar registro do evento no Firestore
    await db.collection('users').doc(userId).collection('donations').doc(dados.id).set({
        ...dados,
        userId,
        status: evento,
        updatedAt: FieldValue.serverTimestamp(),
    });


    // Verificar se usuário existe
    let user = await db.collection('users').doc(userId).get().then(s => {
        if (s.exists) {
            return s.data();
        }
        return null;
    });
    if (!user) {
        logger.warn(`User ${userId} does not exist!`);
        user = {
            role: roles.guest,
            phone: userId,
            currentTokens: 0,
            maxTokens: 0
        };
    }


    const cliente = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    switch(evento) {
        case 'new_donation': 
            // TODO: enviar mensagem template dizendo que recebeu
            // cliente.messages.create({
            //     from: TWILIO_FROM,
            //     to: `whatsapp:${userId}`,
            //     body: `Recebemos um pedido de doação em nome de ${nome}.\n\nAssim que confirmado liberaremos o uso da Lex!`
            // })

            await db.collection('users').doc(userId).update({
                fullName: dados.donor_name,
                role: !user.role ? roles.guest : user.role,
                "donations.intents": FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp(),
            });
            break;

        case 'donation_captured': 
            // definir role como user caso seja guest
            db.collection('users').doc(userId).update({
                fullName: dados.donor_name,
                role: !user.role || user.role === roles.guest ? roles.user : user.role,
                maxTokens: FieldValue.increment(parseInt(DONOR_TOKENS)),
                updatedAt: FieldValue.serverTimestamp(),
                "donations.completed": FieldValue.increment(1)
            });

            // notificar WhatsApp sobre doação
            await cliente.messages.create({
                from: TWILIO_FROM,
                to: `whatsapp:${userId}`,
                body: `Olá ${nome}!\n\nAcabamos de receber sua doação e agora você já pode conversar com a Lex!`
            });
            break;
    }


    // TODO: verificar valor e salvar tokens para usuário com número de telefone

    // {
    //     "id": "4a4fd184-85fd-4f45-8e27-68921a3c3c61",
    //     "created_at": "2024-05-29 16:05:37.1037-03",
    //     "captured_at": "2024-05-29 16:05:37.1037-03",
    //     "is_pre_campaign": 1,
    //     "is_boleto": 1,
    //     "is_pix": 1,
    //     "is_cc": 1,
    //     "amount": 10000,
    //     "donor_name": "Fulano da Silva",
    //     "donor_email": "fulano@email.com",
    //     "donor_cpf": 11111111111,
    //     "donor_phone": "+551111111111",
    //     "donor_birthdate": "11/11/2024",
    //     "donor_birthdate_iso": "2024-12-31",
    //     "referral_code": "AAAAAA"
    // }



    // criada
    /*
    {
        "evento":"new_donation",
        "dados":{
            "id":"7cddc9d0-2e7d-11ef-b7f5-37f292660fd8",
            "created_at":"2024-06-19 20:49:57.062943",
            "captured_at":null,
            "amount":103,

            "is_pix":1,
            "is_cc":0,
            "is_boleto":0,
            "is_pre_campaign":1,

            "donor_name":"Luis Fernando de Oliveira Leao",
            "donor_email":"pedro@leao.dev",
            "donor_birthdate":"1982-01-28",
            "donor_cpf":"01302541692",
            "donor_phone":"11983370955",

            "referral_code":null
        },
        "severity":"INFO",
        "message":"NEW DONATION"
    }
    */

    // capturada
    /*
    {
        "dados":{
            "id":"7cddc9d0-2e7d-11ef-b7f5-37f292660fd8",
            "created_at":"2024-06-19 20:49:57.062943",
            "captured_at":"2024-06-19 20:51:13",
            "amount":103,

            "is_pre_campaign":1,
            "is_boleto":0,
            "is_cc":0,
            "is_pix":1,

            "donor_name":"Luis Fernando de Oliveira Leao",
            "donor_phone":"11983370955",
            "donor_email":"pedro@leao.dev",
            "donor_birthdate":"1982-01-28",
            "donor_cpf":"01302541692",
            "referral_code":null
        },
        "evento":"donation_captured",
        "severity":"INFO",
        "message":"NEW DONATION"
    }
    */
    res.writeHead(200); //, {'Content-Type': 'text/xml'});
    return res.end('OK');
});
