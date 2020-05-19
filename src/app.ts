/**
 * Copyright 2020 Edwin Otten
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as restify from 'restify';
import { UniversalBot, ChatConnector, Session } from 'botbuilder';
import { config } from "dotenv"
import { setupBotStorage } from './botStorage';
import { watsonResponseToMessages, sanitizeText, buildWatsonMessageParams } from './utils';
import { WatsonAdapter } from './watsonAssistant';

config({silent: true});

const botStorage = setupBotStorage(process.env);

// Setup Restify Server
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
   console.log('%s listening to %s', server.name, server.url);
});

const watsonAdapter = new WatsonAdapter(process.env);

console.log("process.env.appID "+ process.env.appId);
console.log("process.env.appPassword "+ process.env.appPassword);

// Create chat connector for communicating with the Bot Framework Service
const connector = new ChatConnector({
    appId: process.env.appId,
    appPassword: process.env.appPassword
});

// Listen for messages from users
server.post('/api/messages', connector.listen());

const handleUserMessage = async (session) => {
  // Log incoming event, for debugging purposes
  console.log("conversation ID "+ session.message.address.conversation.id);
  console.log("Message detail:\n"+JSON.stringify(session.message, null, 2));

  // Only process messages
  if (session.message.type !== 'message') {
    return;
  }

  // Sanitze the message text
  session.message.text = sanitizeText(session.message.text);

  // If the user asked us to start over create a new context
  if (session.message.text.toLowerCase() === 'start over') {
    session.conversationData.WatsonSessionId = null;
  }

  // Check if we have a Watson Session
  if (session.conversationData.WatsonSessionId === null ||
    session.conversationData.WatsonSessionId === undefined) {

      // Fetch new session id and forward message to Watson
      watsonAdapter.getNewWatsonSession()
      .then((sessionId => {
        // Store Watson SessionId for this botbuilder conversation
        session.conversationData.WatsonSessionId = sessionId;
        sendMessageToWatson(session, sessionId);
      }),
      (rejectionReason) => {
        session.send(rejectionReason);
        console.log(`Error when fetching Watson SessionId: ${rejectionReason}`)
      });

    } else {
      // Use existing session id to forward message to Watson
      sendMessageToWatson(session, session.conversationData.WatsonSessionId);
    }
}

// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
const bot = new UniversalBot(connector, handleUserMessage)
.set('storage', botStorage);

const sendMessageToWatson = async (botbuilderSession: Session, watsonSessionId: string) => {
  const params = buildWatsonMessageParams(botbuilderSession.message.text, watsonSessionId);

  watsonAdapter.message(params)
  .then(response => watsonResponseToMessages(response).forEach((text) => {
    botbuilderSession.send(text);
  }))
  .catch(err => {
    // Log the error and show it to the user
    console.error(err);
    botbuilderSession.send(`Error when forwarding message to Watson: ${err.message}`);
  });
}
