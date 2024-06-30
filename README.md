# Lex, a primeira inteligência artificial legislativa do Brasil.

Lex é uma inteligência artificial desenvolvida especificamente para esta campanha, equipada com tecnologia de ponta para analisar dados em grande escala, formular políticas públicas, fiscalizar contratos e interagir diretamente com a população. Lex não é apenas um programa; é um novo modelo de representação política que garante que todas as vozes sejam ouvidas e que cada decisão seja baseada em análises profundas e objetivas.

Este projeto é uma aplicação de ChatBot Legislativo que utiliza Firebase para armazenamento de dados, Twilio para notificações via WhatsApp e OpenAI para funcionalidades de IA. O sistema principal é o `receiveMessage`, que processa mensagens recebidas, verifica permissões de usuários e tokens, e responde utilizando OpenAI.

Conheça mais em https://lex.tec.br/

## Requisitos

- Node.js (versão 14 ou superior)
- Firebase CLI
- Conta no Firebase com um projeto configurado
- Conta no Twilio com credenciais de API
- Conta no OpenAI com uma chave de API
- ngrok para expor o endpoint localmente

## Configuração do Ambiente

1. **Clone o Repositório**

   ```bash
   git clone https://github.com/pmarkun/lex-firebase
   cd lex-firebase
   ```

2. **Instale as Dependências**

   ```bash
   npm install
   ```

3. **Configuração do Firebase**

   - Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
   - Baixe o arquivo `serviceAccountKey.json` das credenciais do Firebase e coloque-o na raiz do projeto.

4. **Configuração do Twilio**

   - Crie uma conta no [Twilio](https://www.twilio.com/).
   - Crie um número de WhatsApp Sandbox no Twilio.
   - Anote o `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN`.

5. **Configuração do OpenAI**

   - Crie uma conta no [OpenAI](https://www.openai.com/).
   - Gere uma chave de API.

6. **Configuração do Arquivo `.env`**

   Crie um arquivo `.env` na raiz do projeto com o seguinte conteúdo:

   ```env
   OPENAI_API_KEY=<sua-chave-de-api-do-openai>
   TWILIO_ACCOUNT_SID=<seu-account-sid-do-twilio>
   TWILIO_AUTH_TOKEN=<seu-auth-token-do-twilio>
   ASSISTANT_ID=<id-do-assistente>
   DONOR_TOKENS=2000
   MAX_COMPLETION_TOKENS=8096
   MAX_PROMPT_TOKENS=60000
   TWILIO_FROM=<seu-numero-do-twilio>
   ```

   Você pode usar suas próprias chaves (OpenAI, Firebase e Twilio) ou pode pedir as chaves do ambiente de desenvolvimento para @luisleao ou @pmarkun.

## Inicialização do Projeto

1. **Inicialize o Firebase**

   Conecte-se ao seu projeto Firebase:

   ```bash
   firebase login
   firebase use --add
   ```

2. **Deploy das Funções Firebase**

   ```bash
   firebase deploy --only functions
   ```

3. **Rodando o Projeto Localmente**

   Para rodar o projeto localmente em modo de desenvolvimento:

   ```bash
   npm start
   ```

4. **Expondo o Endpoint Localmente com ngrok**

   Para expor o endpoint localmente e testar os webhooks:

   - Instale o ngrok (se ainda não tiver):

     ```bash
     npm install -g ngrok
     ```

   - Inicie o ngrok para expor a porta onde sua aplicação está rodando (normalmente a porta 5001 para Firebase Functions em desenvolvimento):

     ```bash
     ngrok http 5001
     ```

   - O ngrok fornecerá uma URL pública. Use essa URL para configurar os webhooks no Twilio e no DoarPara.

## Estrutura do Projeto

- `receiveMessage.js`: Função principal que processa mensagens recebidas e interage com o OpenAI.
- `receiveDonation.js`: Função que lida com doações recebidas e atualiza o status do usuário e tokens.
- `serviceAccountKey.json`: Arquivo de chave de serviço do Firebase (não incluído no repositório por questões de segurança).
- `util.js`: Contém funções utilitárias como `limpaNumero` e `adicionaNove`.
- `roles.js`: Define os papéis dos usuários no sistema.

## Funções Principais

### `receiveMessage`

Esta função é chamada quando uma nova mensagem é recebida. Ela realiza as seguintes operações:

1. **Recepção da Mensagem**: Recebe e limpa o número do remetente e a mensagem.
2. **Verificação de Permissões e Tokens**: Verifica os tokens disponíveis e as permissões do usuário.
3. **Criação ou Obtenção de Thread**: Cria ou obtém uma thread de conversa para o usuário.
4. **Processamento da Mensagem**: Adiciona a mensagem à thread e processa usando OpenAI.
5. **Envio da Resposta**: Envia a resposta gerada de volta para o usuário via WhatsApp.

### `receiveDonation`

Esta função lida com doações recebidas e atualiza o status do usuário e tokens, conforme necessário. A seguir está uma descrição detalhada das etapas envolvidas:

1. **Recepção dos Dados da Doação**: A função recebe os dados da doação, incluindo o evento e os detalhes da doação.
2. **Tratamento dos Dados da Doação**: Converte e ajusta os dados recebidos conforme necessário (por exemplo, convertendo datas e valores monetários).
3. **Salvamento da Doação no Firestore**: Salva os detalhes da doação na coleção `donations` do Firestore, organizada por usuário.
4. **Verificação e Atualização do Usuário**: Verifica se o usuário existe no Firestore. Se não existir, cria um novo registro de usuário com as informações básicas e define um papel inicial.
5. **Atualização do Estado do Usuário**:
   - Para o evento `new_donation`, atualiza o status da doação e incrementa o contador de intenções de doação.
   - Para o evento `donation_captured`, atualiza o papel do usuário para `user` (se for `guest`), incrementa os tokens máximos e envia uma notificação via WhatsApp.

## Arquitetura

### Twilio

Para que o Twilio envie mensagens para a função `receiveMessage`, é necessário configurar o callback no Twilio Console:

1. Acesse o [Twilio Console](https://www.twilio.com/console).
2. Vá para a seção de números de telefone.
3. Selecione o número que você configurou para o WhatsApp.
4. Na seção "A Message Comes In", configure o webhook para apontar para a URL pública fornecida pelo ngrok (por exemplo, `https://<ngrok-id>.ngrok.io/receiveMessage`).

### DoarPara

Para que o sistema receba notificações de doações da plataforma DoarPara, é necessário configurar o callback no DoarPara:

1. Acesse o [DoarPara](https://doarpara.com.br/).
2. Configure o webhook para apontar para a URL pública fornecida pelo ngrok (por exemplo, `https://<ngrok-id>.ngrok.io/receiveDonation`).

**Nota:** Configurar o callback no DoarPara não é obrigatório para o funcionamento do sistema principal, mas é necessário para atualizar o status de doações e gerenciar permissões de acesso baseadas em doações.

## Contribuição

1. Faça um fork do projeto.
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`).
3. Faça commit das suas alterações (`git commit -m 'Adiciona nova feature'`).
4. Faça push para a branch (`git push origin feature/nova-feature`).
5. Abra um Pull Request.

## Licença

Este projeto está licenciado sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

Certifique-se de atualizar `<sua-chave-de-api-do-openai>`, `<seu-account-sid-do-twilio>`, `<seu-auth-token-do-twilio>`, `<id-do-assistente>` e `<seu-numero-do-twilio>` com informações específicas do seu projeto.
