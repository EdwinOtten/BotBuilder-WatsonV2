/**
 * Copyright 2017 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var restify = require('restify');
var builder = require('botbuilder');
const AssistantV2 = require('ibm-watson/assistant/v2');
const watsonAuth = require('ibm-watson/auth');

require('dotenv').config({silent: true});

// set up Azure storegae for the bot
var azure = require('botbuilder-azure'); 

// storageKey and storageURL are required psrameters in the environment
var storageKey=process.env.storageKey;
if (storageKey) {
  console.log("process.env.storageKey "+ process.env.storageKey); 
} else {
  console.error('storageKey must be specified in environment');
  process.exit(1);
}
var storageURL=process.env.storageURL;
if (storageURL) {
  console.log("process.env.storageURL "+ process.env.storageURL); 
} else {
  console.error('storageURL must be specified in environment');
  process.exit(1);
}

var documentDbOptions = {
  host: storageURL, 
  masterKey: storageKey, 
  database: 'botdocs',   
  collection: 'botdata'
};

var contexts= [];
var docDbClient = new azure.DocumentDbClient(documentDbOptions);
var cosmosStorage = new azure.AzureBotStorage({ gzipData: false }, docDbClient);

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});

// Create the service wrapper
var workspace = process.env.WORKSPACE_ID || '';
var serviceUrl = process.env.SERVICE_URL || 'https://gateway.watsonplatform.net/assistant/api/';

const assistant = new AssistantV2({
    authenticator: new watsonAuth.getAuthenticatorFromEnvironment('ASSISTANT'),
    serviceUrl: serviceUrl,
    version: '2020-04-01'
  });

console.log("process.env.WORKSPACE_ID "+ workspace); 
console.log("process.env.appID "+ process.env.appId); 
console.log("process.env.appPassword "+ process.env.appPassword); 

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.appId,
    appPassword: process.env.appPassword
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
var bot = new builder.UniversalBot(connector, function (session) {
    console.log("conversation ID "+ session.message.address.conversation.id);
    console.log("Message detail:\n"+JSON.stringify(session.message, null, 2));

    if (2048<session.message.text.length) {
      console.warn('Message length is too long '+session.message.text.length+' truncate to 2048');
      session.message.text = session.message.text.substring(0, 2047)
    }

    var regex = /[\t\n\r]/g
    if (null != (bad_chars = session.message.text.match(regex))) {
      console.warn('Input contans bad characters', bad_chars);
      session.message.text = session.message.text.replace(regex, " ");
    // } else {
    //   console.log('No illegal characters in the input: '+session.message.text);
    }

    // If the user asked us to start over create a new context
    if ((session.message.text.toLowerCase() == 'start over') || (session.message.text.toLowerCase() == 'start_over')) {
      var convId = session.message.address.conversation.id;
      console.log('Starting a new Conversation for '+convId);
      if (contexts[convId]) 
        delete contexts[convId];
    }
  
    findOrCreateContext(session.message.address.conversation.id).then(
      function (sessionId) {
        if (!sessionId) sessionId = '0';
        // contexts[convId] = response.result.session_id; // store id for later access

        const params = {
          input: { text: session.message.text},
          assistantId: process.env.ASSISTANT_ID,
          sessionId: sessionId
        };

        assistant.message(params).then(
          response => {
            console.log(response.headers['x-global-transaction-id']);

            console.log("Response:\n"+JSON.stringify(response, null, 2));
            response.result.output.generic.forEach(function(runtimeResponseGeneric) {
              if (runtimeResponseGeneric.response_type === 'text') {
                console.log('Sending: '+runtimeResponseGeneric.text);
                session.send(runtimeResponseGeneric.text);
              }
            });
          //  session.send(response.output.text);
            conversationContext.watsonContext = response.result.context.skills;
          },
          err => {
            console.error(err);
            session.send("ERROR: "+err.message);
          }
        );
      }.bind(this),
      (rejectionReason) => {
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
        session.send("ERROR: "+err.message);
        delete contexts[convId];
        reject();
      }
    );
  });
}
