import dotenv from 'dotenv';
dotenv.config();

const AI_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];
if (AI_PROVIDER === 'anthropic') {
  required.push('ANTHROPIC_API_KEY');
}
if (AI_PROVIDER === 'gemini') {
  required.push('GEMINI_API_KEY');
}

const missing = required.filter((k) => {
  const v = process.env[k];
  return v === undefined || v === null || String(v).trim() === '';
});

if (missing.length > 0) {
  const help = [
    'Missing required environment variables:',
    `- ${missing.join('\n- ')}`,
    '',
    'Where to find them:',
    AI_PROVIDER === 'anthropic'
      ? '- ANTHROPIC_API_KEY: Claude console -> API Keys'
      : '- GEMINI_API_KEY: Google AI Studio -> API Keys',
    '- SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY: Supabase project -> Settings -> API',
    '',
    'Add them to your environment or a .env file in the project root before starting the server.'
  ].join('\n');
  throw new Error(help);
}

const NODE_ENV = process.env.NODE_ENV || 'development';

let maxChars = Number.parseInt(process.env.MAX_PAGE_CONTENT_CHARS ?? '', 10);
if (Number.isNaN(maxChars)) {
  maxChars = 8000;
}

const config = Object.freeze({
  PORT: Number(process.env.PORT) || 3001,
  NODE_ENV,
  IS_PRODUCTION: NODE_ENV === 'production',
  AI_PROVIDER,

  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',

  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  // gemini-2.0-flash is the recommended default — it has stable function calling (tool use) support.
  // Do NOT use gemini-1.5-flash as it has inconsistent functionCall emission that breaks tool use.
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  EXTENSION_ORIGIN: process.env.EXTENSION_ORIGIN || '*',
  MAX_PAGE_CONTENT_CHARS: maxChars
});

export default config;

const GEMINI_TOOLS_CAPABLE_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-pro'
];

const GEMINI_UNRELIABLE_FOR_TOOLS = ['gemini-1.5-flash', 'gemini-1.0-pro'];

if (AI_PROVIDER === 'gemini') {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  if (GEMINI_UNRELIABLE_FOR_TOOLS.includes(model)) {
    // Warning only — guides operators to set a reliable tools-capable model
    console.warn(
      `[CONFIG WARNING] GEMINI_MODEL="${model}" has inconsistent function calling support. ` +
        `Tool use may silently fail. Recommended: gemini-2.0-flash. ` +
        `Set GEMINI_MODEL=gemini-2.0-flash in your environment.`
    );
  }
}
