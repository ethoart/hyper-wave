import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const options = { apiKey: 'dummy' };
console.log("Options:", options);
let ai;
try {
   ai = new GoogleGenAI(options);
} catch(e) {
  console.log("INIT ERROR:", e);
}

async function run() {
  if (!ai) return;
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: 'hello',
    });
    console.log("SUCCESS:", response.text);
  } catch (e) {
    console.log("ERROR:", e.message);
  }
}
run();
