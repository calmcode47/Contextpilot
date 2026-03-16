#!/usr/bin/env bash
echo "🔍 ContextPilot Environment Check"
echo "══════════════════════════════════"
ISSUES=0
PROVIDER="${AI_PROVIDER:-gemini}"
echo "AI_PROVIDER: $PROVIDER"
if [ "$PROVIDER" = "gemini" ]; then
  if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ GEMINI_API_KEY: NOT SET"
    echo "   → Get a free key at https://aistudio.google.com"
    ISSUES=$((ISSUES+1))
  else
    echo "✅ GEMINI_API_KEY: SET (${#GEMINI_API_KEY} chars)"
  fi
  echo "   GEMINI_MODEL: ${GEMINI_MODEL:-gemini-2.0-flash (default)}"
fi
if [ "$PROVIDER" = "anthropic" ]; then
  if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY: NOT SET"
    echo "   → Get a key at https://console.anthropic.com"
    ISSUES=$((ISSUES+1))
  else
    echo "✅ ANTHROPIC_API_KEY: SET (${#ANTHROPIC_API_KEY} chars)"
  fi
fi
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ SUPABASE_URL: NOT SET"
  ISSUES=$((ISSUES+1))
else
  echo "✅ SUPABASE_URL: ${SUPABASE_URL:0:40}..."
fi
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY: NOT SET"
  ISSUES=$((ISSUES+1))
else
  echo "✅ SUPABASE_SERVICE_ROLE_KEY: SET"
fi
echo ""
if [ "$ISSUES" -eq 0 ]; then
  echo "✅ Environment looks good — ready to run tests"
else
  echo "❌ $ISSUES issue(s) found — fix before running tests"
  exit 1
fi

