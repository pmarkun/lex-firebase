const admin = require('firebase-admin');
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

const OpenAI = require('openai');
const twilio = require('twilio');

const { limpaNumero, adicionaPais, primeiroNome } = require('./util');

require('dotenv').config();
const { DONOR_TOKENS } = process.env;
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
const { roles } = require('./roles');

const cliente = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);



exports.processAudioFile = onObjectFinalized({ cpu: 2 }, async (event) => {

    const fileBucket = event.data.bucket; // Storage bucket containing the file.
    const filePath = event.data.name; // File path in the bucket.
    const contentType = event.data.contentType; // File content type.
    // Exit if the image is already a thumbnail.
    const fileName = path.basename(filePath);

    logger.info('EVENT DATA', event.data);
    return logger.info('NEW FILE', { contentType, fileName, fileBucket, filePath });

    // TODO: transcrever o arquivo
    // TODO: chamar ChatGPT
    // TODO: enviar mensagem do retorno em texto do ChatGPT


    // // Exit if this is triggered on a file that is not an image.
    // if (!contentType.startsWith("image/")) {
    //     return logger.log("This is not an image.");
    // }
    // if (fileName.startsWith("thumb_")) {
    //     return logger.log("Already a Thumbnail.");
    // }
  
    // // Download file into memory from bucket.
    // const bucket = getStorage().bucket(fileBucket);
    // const downloadResponse = await bucket.file(filePath).download();
    // const imageBuffer = downloadResponse[0];
    // logger.log("Image downloaded!");
  
    // // Generate a thumbnail using sharp.
    // const thumbnailBuffer = await sharp(imageBuffer).resize({
    //     width: 200,
    //     height: 200,
    //     withoutEnlargement: true,
    // }).toBuffer();
    // logger.log("Thumbnail created");
  
    // // Prefix 'thumb_' to file name.
    // const thumbFileName = `thumb_${fileName}`;
    // const thumbFilePath = path.join(path.dirname(filePath), thumbFileName);
  
    // // Upload the thumbnail.
    // const metadata = {contentType: contentType};
    // await bucket.file(thumbFilePath).save(thumbnailBuffer, {
    //     metadata: metadata,
    // });
    // return logger.log("Thumbnail uploaded!");
});

