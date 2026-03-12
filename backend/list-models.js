import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    const models = await genAI.listModels();
    console.log('Available models:');
    for (const m of models) {
      console.log(`- ${m.name} (${m.displayName})`);
    }
  } catch (e) {
    console.error('Error listing models:', e.message);
  }
}

listModels();
