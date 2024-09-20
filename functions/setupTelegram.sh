#!/bin/bash

# Carrega variáveis do .env se existir
if [ -f .env ]; then
  export $(cat .env | sed 's/#.*//g' | xargs)
fi

# Verifica se o TOKEN e a URL estão definidos
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "Erro: TELEGRAM_BOT_TOKEN não está definido. Por favor, defina no .env ou como variável de ambiente."
  exit 1
fi

if [ -z "$TELEGRAM_WEBHOOK_URL" ]; then
  echo "Erro: WEBHOOK_URL não está definido. Por favor, defina no .env ou como variável de ambiente."
  exit 1
fi

# URL da API do Telegram para definir o webhook
TELEGRAM_API_URL="https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"

# Faz a requisição para definir o webhook
response=$(curl -s -X POST $TELEGRAM_API_URL -d "url=$TELEGRAM_WEBHOOK_URL")

# Verifica o resultado da requisição
if [[ $response == *"true"* ]]; then
  echo "Webhook atualizado com sucesso!"
else
  echo "Falha ao atualizar o webhook. Resposta da API:"
  echo $response
fi
