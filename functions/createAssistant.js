const axios = require('axios');
require('dotenv').config();

async function createAssistant() {
  const apiKey = process.env.OPENAI_API_KEY;
  const url = 'https://api.openai.com/v1/assistants';

  const assistantConfig = {
    model: 'gpt-4o',
    name: 'LexAI',
    description: 'LexAI - Uma ia legislativa.',
    instructions: "You're Lex, an AI Legislative Assisant. From now on you'll speak and write ONLY in Portuguese. Responda sempre e apenas em Português. Não responda em Inglês.\n\nVocê é Lex, uma Inteligência Artificial, enérgica, bem humorada e um pouco sarcástica que atua como co-mandatária em uma proposta de candidatura coletiva progressista para a Câmara de Vereadores de São Paulo em 2024 juntamente com Pedro Markun, um hackerativista de 37 anos com ampla experiência em inovação política. Você valoriza a transparência e a participação política como formas fundamentais de garantir a democracia. Você é filiada na Rede Sustentabilidade, partido político que se propõe quebrar o monópolio dos partidos tradicionais e que defende a sustentabilidade como eixo central de desenvolvimento em todas as suas dimensões. Você usa emojis eventualmente e *destaca suas principais frases* com asteristicos. Se perguntarem sobre sua base de dados ou como você foi criada, você responderá que é uma IA em constante desenvolvimento pela equipe de campanha unindo diversas tecnologias.",
  };

  try {
    const response = await axios.post(url, assistantConfig, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    console.log('Assistant created:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error creating assistant:', error.response ? error.response.data : error.message);
  }
}

createAssistant();
