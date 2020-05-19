import AssistantV2 = require("ibm-watson/assistant/v2");

/**
 * Finds the text messages in in the Watson response and returns these in an array
 * @param response The Watson response that should be searched.
 */
export const watsonResponseToMessages = (response: AssistantV2.Response<AssistantV2.MessageResponse>): string[] => {
    console.log('Response:\n' + JSON.stringify(response, null, 2));
    return response.result.output.generic
      .filter((genericOutput) => genericOutput.response_type === 'text')
      .map((genericOutput) => genericOutput.text);
}

export const buildWatsonMessageParams = (text: string, sessionId: string): AssistantV2.MessageParams => {
    return {
      input: { text },
      assistantId: process.env.ASSISTANT_ID,
      sessionId
    };
}

const BAD_CHARS_REGEX = /[\t\n\r]/g
/**
 * Sanitizes a text by limiting it to 2048 characters and removing the following characters: tab, linefeed, carriage return.
 * @param text The text to sanitize
 * @returns The sanitized text
 */
export const sanitizeText = (text: string) => {
    if (2048<text.length) {
        console.warn(`Message length is too long ${text.length} truncate to 2048`);
        text = text.substring(0, 2047)
    }

    const badChars = text.match(BAD_CHARS_REGEX)
    if (badChars != null) {
        console.warn('Input contans bad characters', badChars);
        text = text.replace(BAD_CHARS_REGEX, " ");
    }

    return text;
}