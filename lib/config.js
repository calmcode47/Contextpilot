import dotenv from 'dotenv';
dotenv.config();

const required = [
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

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
    '- ANTHROPIC_API_KEY: Claude console -> API Keys',
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

  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  EXTENSION_ORIGIN: process.env.EXTENSION_ORIGIN || '*',
  MAX_PAGE_CONTENT_CHARS: maxChars
});

export default config;
