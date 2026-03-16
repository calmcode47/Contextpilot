#!/usr/bin/env bash

BASE_URL="http://localhost:3001"

echo "🔍 Verifying Gemini tool use integration..."

payload='{
  "message": "Please summarize the key points of this page in bullet points",
  "pageContext": {
    "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "title": "Artificial Intelligence - Wikipedia",
    "content": "Artificial intelligence (AI) is intelligence demonstrated by machines. AI research includes reasoning, knowledge, planning, learning, natural language processing, perception, and robotics. Machine learning is a subset of AI; deep learning uses neural networks with many layers.",
    "pageType": "generic"
  },
  "sessionId": "verify-tool-001",
  "userId": null
}'

res=$(curl -s -w "\n%{http_code}" -H "Content-Type: application/json" -d "$payload" "$BASE_URL/api/chat")
code=$(echo "$res" | tail -n1)
body=$(echo "$res" | sed '$d')

if command -v jq >/dev/null 2>&1; then
  tool_used=$(echo "$body" | jq -r '.toolUsed // empty')
else
  tool_used=$(echo "$body" | sed -n 's/.*"toolUsed":"\([^"]*\)".*/\1/p')
fi

echo "HTTP status: $code"
echo "toolUsed: ${tool_used:-null}"

if [ "$code" != "200" ]; then
  echo "❌ Request failed. Ensure the backend is running and reachable at $BASE_URL"
  exit 1
fi

if [ -z "$tool_used" ] || [ "$tool_used" = "null" ]; then
  echo "❌ Tool calling did not activate."
  echo "Possible causes:"
  echo "A) Gemini path not using Chat API (still using generateContent)"
  echo "B) tools.js using input_schema instead of parameters for Gemini (schema transform missing)"
  echo "C) GEMINI_API_KEY not set or the chosen model does not support function calling"
  # Do not exit yet; continue to serialization test for more clues
else
  echo "✅ Tool calling is working! Tool used: $tool_used"
fi

echo ""
echo "🔬 TEST: Tool Result Serialization"
payload2='{
  "message": "Summarize the key points of this page in exactly 3 bullet points",
  "pageContext": {
    "url": "https://example.com/test",
    "title": "Serialization Test",
    "content": "Point 1: The system routes correctly. Point 2: Tools execute properly. Point 3: Results are synthesized accurately.",
    "pageType": "generic"
  },
  "sessionId": "serialization-test-001",
  "userId": null
}'
res2=$(curl -s -w "\n%{http_code}" -H "Content-Type: application/json" -d "$payload2" "$BASE_URL/api/chat")
code2=$(echo "$res2" | tail -n1)
body2=$(echo "$res2" | sed '$d')
if command -v jq >/dev/null 2>&1; then
  tool_used2=$(echo "$body2" | jq -r '.toolUsed // empty')
  iterations2=$(echo "$body2" | jq -r '.iterations // 0')
  response_preview=$(echo "$body2" | jq -r '.response // ""' | head -c 120)
else
  tool_used2=$(echo "$body2" | sed -n 's/.*"toolUsed":"\([^"]*\)".*/\1/p')
  iterations2=$(echo "$body2" | sed -n 's/.*"iterations":\([0-9][0-9]*\).*/\1/p')
  response_preview=$(echo "$body2" | sed -n 's/.*"response":"\([^"]*\)".*/\1/p' | head -c 120)
fi
echo "HTTP status (serialization): $code2"
if [ "$code2" = "200" ] && [ -n "$tool_used2" ] && [ "$tool_used2" != "null" ]; then
  echo "✅ Serialization OK — tool fired: $tool_used2"
  echo "✅ Iterations: ${iterations2:-unknown}"
  echo "📄 Response preview: ${response_preview}..."
  exit 0
else
  echo "❌ No tool fired or unexpected response during serialization test."
  echo "   Possible causes:"
  echo "   1. functionResponse.name mismatch in Gemini conversation"
  echo "   2. GEMINI_MODEL not set to a tools-capable model"
  echo "   3. convertMessagesToGeminiHistory not resolving tool names"
  echo "Full response: $body2"
  exit 2
fi

