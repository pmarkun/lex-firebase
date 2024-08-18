twilio api:events:v1:subscriptions:create \
--description lex-messaging \
--sink-sid DG66fcd91c6823f00c2a28ebe6b2d5d7ac \
--types '{"type": "com.twilio.messaging.message.sent","schema_version": 1 }'


twilio api:events:v1:subscriptions:create \
--description "lex-sync PROD" \
--sink-sid DG66fcd91c6823f00c2a28ebe6b2d5d7ac \
--types '{"type": "com.twilio.voice.status-callback.call.completed","schema_version": 1 }' \
--types '{"type": "com.twilio.voice.status-callback.call.ringing","schema_version": 1 }' \
--types '{"type": "com.twilio.voice.status-callback.call.initiated","schema_version": 1 }' \
--types '{"type": "com.twilio.voice.status-callback.call.answered","schema_version": 1 }' \
--types '{"type": "com.twilio.voice.twiml.gather.finished","schema_version": 1 }' \














twilio api:events:v1:subscriptions:create \
  --description "Subscription on 3 call_summary events" \
  --sink-sid <sink id DGxxx> \
  --types '{"type":"com.twilio.voice.insights.call-summary.partial","schema_version":1}' \
  --types '{"type":"com.twilio.voice.insights.call-summary.predicted-complete","schema_version":1}' \
  --types '{"type":"com.twilio.voice.insights.call-summary.complete","schema_version":1}'