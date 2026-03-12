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
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-flash',

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  EXTENSION_ORIGIN: process.env.EXTENSION_ORIGIN || '*',
  MAX_PAGE_CONTENT_CHARS: maxChars
});

export default config;
