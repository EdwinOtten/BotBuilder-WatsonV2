import AssistantV2 = require("ibm-watson/assistant/v2");
import { getAuthenticatorFromEnvironment } from 'ibm-watson/auth';

export class WatsonAdapter extends AssistantV2 {

    constructor(env: NodeJS.ProcessEnv) {
        super({
            authenticator: getAuthenticatorFromEnvironment('ASSISTANT'),
            serviceUrl: process.env.SERVICE_URL || 'https://gateway.watsonplatform.net/assistant/api/',
            version: '2020-04-01'
          });
    }

    /**
     * Retrieves a new SessionId with IBM Watson.
     */
    getNewWatsonSession = async(): Promise<string> => {
        return new Promise((resolve, reject) => {
            this.createSession({
            assistantId: process.env.ASSISTANT_ID
        }).then(
            response => {
            if (!response.result.session_id) {
                reject('invalid SessionId (null or undefined)');
            } else {
                console.log(`Session created: ${response.result.session_id}`);
                resolve(response.result.session_id);
            }
            },
            reject
        );
        });
    }
}