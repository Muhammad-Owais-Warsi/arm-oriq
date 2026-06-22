import { GoogleGenAI } from "@google/genai";

export class GeminiLayer {
    ai: GoogleGenAI;

    constructor(config: { apikey: string }) {
        this.ai = new GoogleGenAI({
            apiKey: config.apikey,
        });
    }
}
