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
import { UniversalBot, ChatConnector } from 'botbuilder';
import { AzureBotStorage, DocumentDbClient } from 'botbuilder-azure';
import * as AssistantV2 from 'ibm-watson/assistant/v2';
import { getAuthenticatorFromEnvironment } from 'ibm-watson/auth';
import { config } from "dotenv"

config({silent: true});

// set up Azure storegae for the bot
// storageKey and storageURL are required psrameters in the environment
const storageKey = process.env.storageKey;
if (storageKey) {
  console.log("process.env.storageKey "+ process.env.storageKey);
} else {
  console.error('storageKey must be specified in environment');
  process.exit(1);
}
const storageURL = process.env.storageURL;
if (storageURL) {
  console.log("process.env.storageURL "+ process.env.storageURL);
} else {
  console.error('storageURL must be specified in environment');
  process.exit(1);
}

const documentDbOptions = {
  host: storageURL,
  masterKey: storageKey,
  database: 'botdocs',
  collection: 'botdata'
};

const contexts= [];
const docDbClient = new DocumentDbClient(documentDbOptions);
const cosmosStorage = new AzureBotStorage({ gzipData: false }, docDbClient);

// Setup Restify Server
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
   console.log('%s listening to %s', server.name, server.url);
});

// Create the service wrapper
const assistant = new AssistantV2({
    authenticator: getAuthenticatorFromEnvironment('ASSISTANT'),
    serviceUrl: process.env.SERVICE_URL || 'https://gateway.watsonplatform.net/assistant/api/',
    version: '2020-04-01'
  });

console.log("process.env.appID "+ process.env.appId);
console.log("process.env.appPassword "+ process.env.appPassword);

// Create chat connector for communicating with the Bot Framework Service
const connector = new ChatConnector({
    appId: process.env.appId,
    appPassword: process.env.appPassword
});

// Listen for messages from users
server.post('/api/messages', connector.listen());

const BAD_CHARS_REGEX = /[\t\n\r]/g

// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
const bot = new UniversalBot(connector, (session) => {
    console.log("conversation ID "+ session.message.address.conversation.id);
    console.log("Message detail:\n"+JSON.stringify(session.message, null, 2));

    if (2048<session.message.text.length) {
      console.warn('Message length is too long '+session.message.text.length+' truncate to 2048');
      session.message.text = session.message.text.substring(0, 2047)
    }

    const badChars = session.message.text.match(BAD_CHARS_REGEX)
    if (badChars != null) {
      console.warn('Input contans bad characters', badChars);
      session.message.text = session.message.text.replace(BAD_CHARS_REGEX, " ");
    }

    // If the user asked us to start over create a new context
    if ((session.message.text.toLowerCase() === 'start over') || (session.message.text.toLowerCase() === 'start_over')) {
      const convId = session.message.address.conversation.id;
      console.log('Starting a new Conversation for '+convId);
      if (contexts[convId])
        delete contexts[convId];
    }

    findOrCreateContext(session.message.address.conversation.id).then(
      (sessionId) => {
        if (!sessionId) sessionId = '0';
        // contexts[convId] = response.result.session_id; // store id for later access

        const params = {
          input: { text: session.message.text},
          assistantId: process.env.ASSISTANT_ID,
          sessionId
        };

        assistant.message(params).then(
          response => {
            console.log(response.headers['x-global-transaction-id']);

            console.log("Response:\n"+JSON.stringify(response, null, 2));
            response.result.output.generic.forEach((runtimeResponseGeneric) => {
              if (runtimeResponseGeneric.response_type === 'text') {
                console.log('Sending: '+runtimeResponseGeneric.text);
                session.send(runtimeResponseGeneric.text);
              }
            });
          //  session.send(response.output.text);
          // conversationContext.watsonContext = response.result.context.skills;
          },
          err => {
            console.error(err);
            session.send("ERROR: "+err.message);
          }
        );
      },
      (rejectionReason) => {
        session.send(rejectionReason);
        console.log("fetch session id failed: "+rejectionReason)
      }
    );

}).set('storage', cosmosStorage);

function findOrCreateContext(convId) {

  // Let's see if we already have a session for the user convId
  if (contexts[convId]) {
    return Promise.resolve(contexts[convId]);
  }

  // No session found for user convId, let's fetch a new one
  return new Promise((resolve, reject) => {
    assistant.createSession({
      assistantId: process.env.ASSISTANT_ID
    }).then(
      response => {
        console.log('Session created: '+ response.result.session_id);
        resolve(response.result.session_id);
      },
      err => {
        console.error(err);
        delete contexts[convId];
        reject("ERROR: "+err.message);
      }
    );
  });
}
