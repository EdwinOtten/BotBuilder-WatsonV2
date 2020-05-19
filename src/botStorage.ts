import { AzureBotStorage, DocumentDbClient, IBotStorage } from 'botbuilder-azure';

export function setupBotStorage(env: NodeJS.ProcessEnv): IBotStorage {

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

    const docDbClient = new DocumentDbClient(documentDbOptions);

    return new AzureBotStorage({ gzipData: false }, docDbClient);
}