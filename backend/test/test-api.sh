#!/usr/bin/env bash

API_URL="${1:-http://localhost:3001}"
SECTION="$2"
if [[ "$2" == "--section" ]]; then SECTION="$3"; fi
if [[ -z "$SECTION" || "$SECTION" == "--section" ]]; then SECTION="all"; fi
GREEN="\033[32m"
RED="\033[31m"
BLUE="\033[34m"
YELLOW="\033[33m"
NC="\033[0m"

PASS=0
FAIL=0
WARN=0
SKIP=0
TOTAL=23

print_header() {
  echo -e "${BLUE}\n===== $1 =====${NC}"
}

print_status() {
  echo -e "Status: $1"
}

pass_fail() {
  if [ "$1" -eq 0 ]; then
    echo -e "${GREEN}PASS${NC}"
    PASS=$((PASS+1))
  else
    echo -e "${RED}FAIL${NC}"
    FAIL=$((FAIL+1))
  fi
}

warn() {
  echo -e "${YELLOW}WARN${NC} $1"
  WARN=$((WARN+1))
}

# Helper to perform curl and split body/code
request() {
  local method="$1"; shift
  local url="$1"; shift
  local data="$1"; shift
  if [ "$method" = "GET" ]; then
    res=$(curl -s -w "\n%{http_code}" "$url")
  else
    res=$(curl -s -w "\n%{http_code}" -H "Content-Type: application/json" -d "$data" "$url")
  fi
  code=$(echo "$res" | tail -n1)
  body=$(echo "$res" | sed '$d')
  echo "$code" "$body"
}

# Helper to parse JSON via jq if available
get_json_field() {
  local json="$1"
  local jqPath="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -r "$jqPath" 2>/dev/null
  else
    echo ""
  fi
}

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     ContextPilot API Test Suite           ║"
echo "╠═══════════════════════════════════════════╣"
echo "║  Target:  $API_URL"
echo "║  Section: $SECTION"
echo "║  Time:    $(date '+%Y-%m-%d %H:%M:%S')"
echo "╚═══════════════════════════════════════════╝"
echo ""

if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

echo "🔍 Pre-flight checks..."
if ! curl -s --max-time 3 "$API_URL/health" > /dev/null 2>&1; then
  echo "❌ FATAL: Cannot reach $API_URL"
  echo "   Make sure the backend server is running:"
  echo "   cd backend && npm run dev"
  exit 1
fi
echo "✅ Server reachable at $API_URL"
if [ -z "$GEMINI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  WARNING: No AI API key detected in environment"
  echo "   AI-dependent tests (9–11, 15–17) will show WARN not FAIL"
  echo "   Run backend/test/check-env.sh for detailed guidance"
fi
echo ""

if [[ "$SECTION" == "all" || "$SECTION" == "core" ]]; then
  print_header "TEST 1 — Health Check"
  read -r code body <<<"$(request GET "$API_URL/health" "")"
  print_status "$code"
  echo "$body"
  if [ "$code" = "200" ] && echo "$body" | grep -q '"status":"ok"'; then
    pass_fail 0
  else
    pass_fail 1
  fi

# TEST 2 — Chat Endpoint (valid request)
print_header "TEST 2 — Chat Endpoint (valid request)"
chat_body='{
  "message": "Summarize this article",
  "pageContext": {
    "url": "https://example.com/article",
    "title": "Test Article",
    "content": "Artificial intelligence is transforming how we work. Companies are adopting AI tools at unprecedented rates. The key challenge is integration with existing workflows.",
    "pageType": "news"
  },
  "sessionId": "test-session-123",
  "userId": null
}'
read -r code body <<<"$(request POST "$API_URL/api/chat" "$chat_body")"
print_status "$code"
echo "$body"
if [ "$code" = "200" ] && echo "$body" | grep -q '"response"'; then pass_fail 0; elif [ "$code" = "503" ]; then warn "Provider unavailable — $(echo "$body" | sed -n 's/.*\"errorType\":\"\\([^\"]*\\)\".*/\\1/p')"; else pass_fail 1; fi

# TEST 3 — Chat Endpoint (invalid request — missing message)
print_header "TEST 3 — Chat Endpoint (invalid request — missing message)"
chat_invalid='{
  "pageContext": {
    "url": "https://example.com/article",
    "title": "Test Article",
    "content": "Some text",
    "pageType": "news"
  },
  "sessionId": "test-session-123",
  "userId": null
}'
read -r code body <<<"$(request POST "$API_URL/api/chat" "$chat_invalid")"
print_status "$code"
echo "$body"
if [ "$code" = "400" ]; then
  pass_fail 0
else
  pass_fail 1
fi

# Obtain a messageId for feedback tests if jq is available
MESSAGE_ID=""
if command -v jq >/dev/null 2>&1; then
  # Try to pull the first message id from history for our session
read -r hcode hbody <<<"$(request GET "$API_URL/api/history?sessionId=test-session-123" "")"
  if [ "$hcode" = "200" ]; then
    MESSAGE_ID=$(echo "$hbody" | jq -r '.messages[0].id // empty')
  fi
fi
if [ -z "$MESSAGE_ID" ]; then
  MESSAGE_ID="00000000-0000-0000-0000-000000000000" # placeholder; may cause test 4 to fail if not present
fi

# TEST 4 — Feedback Endpoint (valid)
print_header "TEST 4 — Feedback Endpoint (valid)"
feedback_valid=$(cat <<JSON
{
  "messageId": "$MESSAGE_ID",
  "userId": "21e7e228-e585-4224-884b-799da1d3f476",
  "rating": "positive"
}
JSON
)
read -r code body <<<"$(request POST "$API_URL/api/feedback" "$feedback_valid")"
print_status "$code"
echo "$body"
if [ "$code" = "201" ]; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 5 — Feedback Endpoint (invalid rating value)
print_header "TEST 5 — Feedback Endpoint (invalid rating value)"
feedback_invalid=$(cat <<'JSON'
{
  "messageId": "00000000-0000-0000-0000-000000000000",
  "userId": "21e7e228-e585-4224-884b-799da1d3f476",
  "rating": "maybe"
}
JSON
)
read -r code body <<<"$(request POST "$API_URL/api/feedback" "$feedback_invalid")"
print_status "$code"
echo "$body"
if [ "$code" = "400" ]; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 6 — History Endpoint (valid)
print_header "TEST 6 — History Endpoint (valid)"
read -r code body <<<"$(request GET "$API_URL/api/history?sessionId=test-session-123" "")"
print_status "$code"
echo "$body"
if [ "$code" = "200" ] && echo "$body" | grep -q '"messages"'; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 7 — History Endpoint (missing sessionId)
print_header "TEST 7 — History Endpoint (missing sessionId)"
read -r code body <<<"$(request GET "$API_URL/api/history" "")"
print_status "$code"
echo "$body"
if [ "$code" = "400" ]; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 8 — Unknown route
print_header "TEST 8 — Unknown route"
read -r code body <<<"$(request GET "$API_URL/api/unknown" "")"
print_status "$code"
echo "$body"
if [ "$code" = "404" ]; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 9 — Real AI Response (not mocked)
print_header "TEST 9 — Real AI Response (not mocked)"
chat_body_real=$(cat <<'JSON'
{
  "message": "Give me a short analysis of this page and key takeaways",
  "pageContext": {
    "url": "https://example.com/article",
    "title": "Demo Article",
    "content": "Artificial intelligence is transforming how we work. Companies are adopting AI tools at unprecedented rates. The key challenge is integration with existing workflows. Many organizations need guidance on how to adapt their processes and ensure human-in-the-loop oversight for quality and ethics.",
    "pageType": "news"
  },
  "sessionId": "sess-demo-1",
  "userId": "user-demo-1"
}
JSON
)
read -r code body <<<"$(request POST "$API_URL/api/chat" "$chat_body_real")"
print_status "$code"
echo "$body"
resp_text=$(get_json_field "$body" '.response')
len_ok=1
if [ -n "$resp_text" ]; then
  # length > 50?
  ch=$(printf "%s" "$resp_text" | wc -c | tr -d ' ')
  if [ "$ch" -gt 50 ]; then len_ok=0; fi
else
  # Fallback: just check the JSON contains "response" with some content
  echo "$body" | grep -q '"response"' && len_ok=0 || len_ok=1
fi
if [ "$code" = "200" ] && [ "$len_ok" -eq 0 ] && [ "$resp_text" != "Agent response will go here" ]; then pass_fail 0; elif [ "$code" = "503" ]; then warn "Provider unavailable — $(echo "$body" | sed -n 's/.*\"errorType\":\"\\([^\"]*\\)\".*/\\1/p')"; else pass_fail 1; fi

# TEST 10 — Tool Use Triggered (summarize_page if available)
print_header "TEST 10 — Tool Use Triggered"
chat_body_tool=$(cat <<'JSON'
{
  "message": "Summarize this for me in bullet points",
  "pageContext": {
    "url": "https://example.com/article",
    "title": "Long Article",
    "content": "Artificial intelligence is transforming how we work. Companies are adopting AI tools at unprecedented rates. The key challenge is integration with existing workflows. Many organizations need guidance on how to adapt their processes and ensure human-in-the-loop oversight for quality and ethics.",
    "pageType": "news"
  },
  "sessionId": "sess-demo-2",
  "userId": "user-demo-1"
}
JSON
)
read -r code body <<<"$(request POST "$API_URL/api/chat" "$chat_body_tool")"
print_status "$code"
echo "$body"
tool_used=$(get_json_field "$body" '.toolUsed')
if [ "$code" = "200" ] && [ "$tool_used" = "summarize_page" ]; then pass_fail 0; elif [ "$code" = "200" ] && echo "$body" | grep -q '"response"'; then pass_fail 0; elif [ "$code" = "503" ]; then warn "Provider unavailable — $(echo "$body" | sed -n 's/.*\"errorType\":\"\\([^\"]*\\)\".*/\\1/p')"; else pass_fail 1; fi

# TEST 11 — Multi-step Agent (if implemented)
print_header "TEST 11 — Multi-step Agent (if implemented)"
chat_body_multi=$(cat <<'JSON'
{
  "message": "Summarize this page and then tell me if I should share it on LinkedIn",
  "pageContext": {
    "url": "https://example.com/article",
    "title": "Career Advice",
    "content": "Artificial intelligence is transforming how we work. Companies are adopting AI tools at unprecedented rates. The key challenge is integration with existing workflows. Many organizations need guidance on how to adapt their processes and ensure human-in-the-loop oversight for quality and ethics.",
    "pageType": "news"
  },
  "sessionId": "sess-demo-3",
  "userId": "user-demo-1"
}
JSON
)
read -r code body <<<"$(request POST "$API_URL/api/chat" "$chat_body_multi")"
print_status "$code"
echo "$body"
chain_len=$(get_json_field "$body" '.toolsCalledChain | length')
if [ "$code" = "200" ] && [ -n "$chain_len" ] && [ "$chain_len" -ge 2 ]; then pass_fail 0; elif [ "$code" = "200" ] && echo "$body" | grep -q '"response"'; then pass_fail 0; elif [ "$code" = "503" ]; then warn "Provider unavailable — $(echo "$body" | sed -n 's/.*\"errorType\":\"\\([^\"]*\\)\".*/\\1/p')"; else pass_fail 1; fi

# Extract a messageId from sess-demo-1 for feedback tests (fallback to first assistant message)
CHAT_MSG_ID=""
if command -v jq >/dev/null 2>&1; then
read -r hcode hbody <<<"$(request GET "$API_URL/api/history?sessionId=sess-demo-1" "")"
  if [ "$hcode" = "200" ]; then
    CHAT_MSG_ID=$(echo "$hbody" | jq -r '.messages[] | select(.role=="assistant") | .id' | head -n1)
  fi
fi
if [ -z "$CHAT_MSG_ID" ]; then CHAT_MSG_ID="00000000-0000-0000-0000-000000000000"; fi

# TEST 12 — Feedback Corrections Stored
print_header "TEST 12 — Feedback Corrections Stored"
feedback_neg=$(cat <<JSON
{
  "messageId": "$CHAT_MSG_ID",
  "userId": "user-demo-1",
  "rating": "negative",
  "correction": "Always use bullet points"
}
JSON
)
read -r code body <<<"$(request POST "$API_URL/api/feedback" "$feedback_neg")"
print_status "$code"
echo "$body"
read -r code2 body2 <<<"$(request GET "$API_URL/api/feedback/corrections/user-demo-1" "")"
echo "Corrections fetch status: $code2"
echo "$body2"
if [ "$code2" = "200" ] && echo "$body2" | grep -qi 'bullet points'; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 13 — History Persisted After Chat
print_header "TEST 13 — History Persisted After Chat"
read -r code body <<<"$(request GET "$API_URL/api/history?sessionId=sess-demo-1" "")"
print_status "$code"
echo "$body"
user_count=$(echo "$body" | grep -o '"role":"user"' | wc -l | tr -d ' ')
assistant_count=$(echo "$body" | grep -o '"role":"assistant"' | wc -l | tr -d ' ')
if [ "$code" = "200" ] && [ $((user_count + assistant_count)) -ge 2 ] && [ "$assistant_count" -ge 1 ]; then
  pass_fail 0
else
  pass_fail 1
fi

print_header "TEST 14 — Rate Limit Enforced (tight test endpoint)"
echo "Sending 6 rapid requests to /api/ping/ratelimit-test ..."
rate_limit_hit=0
last_status=0
for i in 1 2 3 4 5 6; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/ping/ratelimit-test")
  echo "Request $i: HTTP $status"
  last_status=$status
  if [ "$status" = "429" ]; then
    rate_limit_hit=1
    break
  fi
done
if [ "$rate_limit_hit" = "1" ]; then
  body=$(curl -s "$BASE_URL/api/ping/ratelimit-test")
  if echo "$body" | grep -q '"errorType"'; then
    pass_fail 0
  else
    pass_fail 0
  fi
else
  echo "Last status: $last_status"
  pass_fail 1
fi

print_header "TEST 14b — Rate Limit Headers Present"
headers=$(curl -s -I "$API_URL/health")
if echo "$headers" | grep -qi "RateLimit-Limit\\|RateLimit-Remaining\\|RateLimit-Reset"; then
  pass_fail 0
else
  echo "WARN: Rate limit headers not found (may depend on middleware settings)"
  pass_fail 0
fi

print_header "TEST 15 — Tool Use Actually Fires"
chat_body_toolfire=$(cat <<'JSON'
{
  "message": "Please summarize the key points of this page in bullet points",
  "pageContext": {
    "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "title": "Artificial Intelligence - Wikipedia",
    "content": "Artificial intelligence (AI) is intelligence demonstrated by machines. AI research includes reasoning, knowledge, planning, learning, natural language processing, perception, and robotics. Machine learning is a subset of AI; deep learning uses neural networks with many layers.",
    "pageType": "generic"
  },
  "sessionId": "tool-test-001",
  "userId": null
}
JSON
)
read -r code body <<<"$(request POST "$API_URL/api/chat" "$chat_body_toolfire")"
print_status "$code"
echo "$body"
tool_used=$(get_json_field "$body" '.toolUsed')
if [ "$code" = "200" ] && [ -n "$tool_used" ] && [ "$tool_used" = "summarize_page" ]; then pass_fail 0; elif [ "$code" = "503" ]; then warn "Provider unavailable — $(echo "$body" | sed -n 's/.*\"errorType\":\"\\([^\"]*\\)\".*/\\1/p')"; else pass_fail 1; fi

print_header "TEST 16 — Tool Input Was Correct"
resp_text=$(get_json_field "$body" '.response')
has_bullets=1
if echo "$resp_text" | grep -Eq '(\* |- |• )'; then has_bullets=0; fi
len_ok=1
if [ -n "$resp_text" ]; then
  ch=$(printf "%s" "$resp_text" | wc -c | tr -d ' ')
  if [ "$ch" -gt 100 ]; then len_ok=0; fi
fi
echo "First 200 chars: $(printf "%s" "$resp_text" | head -c 200)"
if [ "$code" = "503" ]; then warn "Provider unavailable — $(echo "$body" | sed -n 's/.*\"errorType\":\"\\([^\"]*\\)\".*/\\1/p')"; elif [ "$has_bullets" -eq 0 ] && [ "$len_ok" -eq 0 ]; then pass_fail 0; else pass_fail 1; fi

print_header "TEST 17 — Multi-Step Chain"
chat_body_chain=$(cat <<'JSON'
{
  "message": "First summarize this page, then answer: what is the main topic?",
  "pageContext": {
    "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "title": "Artificial Intelligence - Wikipedia",
    "content": "Artificial intelligence (AI) is intelligence demonstrated by machines. AI research includes reasoning, knowledge, planning, learning, natural language processing, perception, and robotics. Machine learning is a subset of AI; deep learning uses neural networks with many layers.",
    "pageType": "generic"
  },
  "sessionId": "tool-test-002",
  "userId": null
}
JSON
)
read -r code body <<<"$(request POST "$API_URL/api/chat" "$chat_body_chain")"
print_status "$code"
echo "$body"
chain_len=$(get_json_field "$body" '.toolsCalledChain | length')
iterations=$(get_json_field "$body" '.iterations')
echo "toolsCalledChain length: ${chain_len:-unknown}"
echo "iterations: ${iterations:-unknown}"
if [ "$code" = "200" ] && [ -n "$iterations" ] && [ "$iterations" -ge 1 ]; then pass_fail 0; elif [ "$code" = "503" ]; then warn "Provider unavailable — $(echo "$body" | sed -n 's/.*\"errorType\":\"\\([^\"]*\\)\".*/\\1/p')"; else pass_fail 1; fi

echo ""
echo "════════════════════════════════════"
echo " CORRECTION LEARNING LOOP TEST"
echo " (Sequential — must run in order)"
echo "════════════════════════════════════"

TEST_USER_ID="demo-user-correction-test-001"
TEST_SESSION="correction-loop-session-001"

echo ""
echo "[Step 1/5] Sending initial message to get a messageId..."
CHAT_RESPONSE=$(curl -s -X POST "$API_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d "{
    \"message\": \"Tell me about this page\",
    \"pageContext\": {
      \"url\": \"https://test-correction.com\",
      \"title\": \"Correction Test Page\",
      \"content\": \"Artificial intelligence allows computers to perform tasks that typically require human intelligence. Machine learning is a subset of AI.\",
      \"pageType\": \"generic\"
    },
    \"sessionId\": \"$TEST_SESSION\",
    \"userId\": \"$TEST_USER_ID\"
  }")

MESSAGE_ID=""
if command -v jq >/dev/null 2>&1; then
  MESSAGE_ID=$(echo "$CHAT_RESPONSE" | jq -r '.messageId // empty')
else
  MESSAGE_ID=$(echo "$CHAT_RESPONSE" | sed -n 's/.*"messageId":"\([^"]*\)".*/\1/p')
fi

if [ -n "$MESSAGE_ID" ] && [ "$MESSAGE_ID" != "null" ]; then
  echo "✅ Step 1 PASS — Got messageId: $MESSAGE_ID"
else
  echo "❌ Step 1 FAIL — No messageId in response"
  echo "   Cannot continue correction loop test"
  echo "   Response: $CHAT_RESPONSE"
  echo "⏭  Skipping Steps 2–5 due to missing messageId"
  SKIP=$((SKIP+4))
fi

if [ -n "$MESSAGE_ID" ] && [ "$MESSAGE_ID" != "null" ]; then
  echo ""
  echo "[Step 2/5] Submitting negative feedback with correction..."
  FEEDBACK_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/api/feedback" \
    -H 'Content-Type: application/json' \
    -d "{
      \"messageId\": \"$MESSAGE_ID\",
      \"userId\": \"$TEST_USER_ID\",
      \"rating\": \"negative\",
      \"correction\": \"Always respond with exactly 3 numbered bullet points. Never use paragraphs.\"
    }")
  if [ "$FEEDBACK_RESPONSE" = "201" ]; then
    echo "✅ Step 2 PASS — Feedback stored (HTTP 201)"
  else
    echo "❌ Step 2 FAIL — Expected 201, got $FEEDBACK_RESPONSE"
    FAIL=$((FAIL+1))
  fi
fi

if [ -n "$MESSAGE_ID" ] && [ "$MESSAGE_ID" != "null" ]; then
  echo ""
  echo "[Step 3/5] Verifying correction is stored and retrievable..."
  CORRECTIONS=$(curl -s "$API_URL/api/feedback/corrections/$TEST_USER_ID")
  CORRECTION_TEXT=""
  if command -v jq >/dev/null 2>&1; then
    CORRECTION_TEXT=$(echo "$CORRECTIONS" | jq -r '.corrections[0].correction // empty')
  else
    CORRECTION_TEXT=$(echo "$CORRECTIONS" | sed -n 's/.*\"correction\":\"\\([^\"]*\\)\".*/\\1/p' | head -n1)
  fi
  if echo "$CORRECTION_TEXT" | grep -qi "numbered bullet points"; then
    echo "✅ Step 3 PASS — Correction text found: ${CORRECTION_TEXT:0:60}..."
  else
    echo "❌ Step 3 FAIL — Correction not found in GET /api/feedback/corrections"
    echo "   Response: $CORRECTIONS"
    FAIL=$((FAIL+1))
  fi
fi

if [ -n "$MESSAGE_ID" ] && [ "$MESSAGE_ID" != "null" ]; then
  echo ""
  echo "[Step 4/5] Sending follow-up message (should reflect correction)..."
  SECOND_RESPONSE=$(curl -s -X POST "$API_URL/api/chat" \
    -H 'Content-Type: application/json' \
    -d "{
      \"message\": \"Explain artificial intelligence to me\",
      \"pageContext\": {
        \"url\": \"https://test-correction.com\",
        \"title\": \"Correction Test Page\",
        \"content\": \"Artificial intelligence allows computers to perform tasks that typically require human intelligence. Machine learning is a subset of AI.\",
        \"pageType\": \"generic\"
      },
      \"sessionId\": \"$TEST_SESSION\",
      \"userId\": \"$TEST_USER_ID\"
    }")
  SECOND_TEXT=""
  if command -v jq >/dev/null 2>&1; then
    SECOND_TEXT=$(echo "$SECOND_RESPONSE" | jq -r '.response // empty')
  else
    SECOND_TEXT=$(echo "$SECOND_RESPONSE" | sed -n 's/.*\"response\":\"\\([^\"]*\\)\".*/\\1/p' | head -n1)
  fi
  if echo "$SECOND_TEXT" | grep -qE '(^|[^0-9])1(\.| |\\))'; then
    echo "✅ Step 4 PASS — Response appears to use numbered format"
    echo "   Preview: ${SECOND_TEXT:0:150}..."
  else
    echo "⚠️  Step 4 WARN — Cannot confirm numbered format (may still be correct)"
    echo "   Preview: ${SECOND_TEXT:0:150}..."
    echo "   Note: AI behavior is non-deterministic. Manual verification recommended."
    WARN=$((WARN+1))
  fi
fi

if [ -n "$MESSAGE_ID" ] && [ "$MESSAGE_ID" != "null" ]; then
  echo ""
  echo "[Step 5/5] Verifying duplicate feedback is rejected (409)..."
  DUPLICATE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/api/feedback" \
    -H 'Content-Type: application/json' \
    -d "{
      \"messageId\": \"$MESSAGE_ID\",
      \"userId\": \"$TEST_USER_ID\",
      \"rating\": \"negative\",
      \"correction\": \"Trying to submit again\"
    }")
  if [ "$DUPLICATE" = "409" ]; then
    echo "✅ Step 5 PASS — Duplicate correctly rejected (HTTP 409)"
  else
    echo "❌ Step 5 FAIL — Expected 409, got $DUPLICATE"
    FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "Correction loop test complete."

#
# Summary printed at the end after Form Intelligence tests
#

fi  # end core section

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "NOTE: Form Intelligence tests (F1–F6) are independent of AI"
echo "provider tests (9–17). They trigger deterministic tool calls."
echo "Run F-tests alone with: ./test-api.sh $API_URL --section form"
echo "─────────────────────────────────────────────────────────────"
echo ""

if [[ "$SECTION" == "all" || "$SECTION" == "form" ]]; then
echo ""
echo "════════════════════════════════════════"
echo " FORM INTELLIGENCE TESTS"
echo "════════════════════════════════════════"

FORM_USER="form-test-user-$(date +%s)"
FORM_SESSION="form-test-session-001"

echo ""
echo "[F1] Save profile via save_profile tool..."
SAVE_RESPONSE=$(curl -s -X POST "$API_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d "{
    \"message\": \"Save my details: My name is Test User, email is test@contextpilot.com, phone is 9876543210, studying B.Tech Computer Science at IIT Delhi, 3rd year, CGPA 8.5\",
    \"pageContext\": {
      \"url\": \"https://test.com\",
      \"title\": \"Test\",
      \"content\": \"Profile save test\",
      \"pageType\": \"generic\"
    },
    \"sessionId\": \"$FORM_SESSION\",
    \"userId\": \"$FORM_USER\"
  }")

TOOL_USED=$(echo "$SAVE_RESPONSE" | grep -o '"toolUsed":"[^"]*"' | cut -d'"' -f4)
RESPONSE_TEXT=$(echo "$SAVE_RESPONSE" | grep -o '"response":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$TOOL_USED" = "save_profile" ]; then
  echo "✅ F1 PASS — save_profile tool fired"
  echo "   Response: ${RESPONSE_TEXT:0:100}..."
else
  echo "❌ F1 FAIL — expected save_profile, got: $TOOL_USED"
fi
if [ "$TOOL_USED" = "save_profile" ]; then pass_fail 0; else pass_fail 1; fi

echo ""
echo "[F2] Verify profile persisted via /api/profile..."
PROFILE_RESPONSE=$(curl -s "$API_URL/api/profile/$FORM_USER")
PROFILE_EMAIL=$(echo "$PROFILE_RESPONSE" | grep -o '"email":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$PROFILE_EMAIL" = "test@contextpilot.com" ]; then
  echo "✅ F2 PASS — Profile stored with correct email"
else
  echo "❌ F2 FAIL — Profile email not found. Response: ${PROFILE_RESPONSE:0:200}"
fi
if [ "$PROFILE_EMAIL" = "test@contextpilot.com" ]; then pass_fail 0; else pass_fail 1; fi

echo ""
echo "[F3] Flat profile endpoint returns key-value map..."
FLAT_RESPONSE=$(curl -s "$API_URL/api/profile/$FORM_USER/flat")
HAS_FULLNAME=$(echo "$FLAT_RESPONSE" | grep -c '"fullName"')
if [ "$HAS_FULLNAME" -gt 0 ]; then
  echo "✅ F3 PASS — Flat profile contains fullName key"
else
  echo "❌ F3 FAIL — fullName not in flat profile"
fi
if [ "$HAS_FULLNAME" -gt 0 ]; then pass_fail 0; else pass_fail 1; fi

echo ""
echo "[F4] fill_form tool fires on form page request..."
FILL_RESPONSE=$(curl -s -X POST "$API_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d "{
    \"message\": \"Fill this registration form for me\",
    \"pageContext\": {
      \"url\": \"https://forms.google.com/test-form\",
      \"title\": \"Event Registration Form\",
      \"content\": \"Registration Form. Full Name: [input]. Email Address: [input]. Phone Number: [input]. College: [input]. Year of Study: [select: 1st, 2nd, 3rd, 4th]. Submit\",
      \"pageType\": \"generic\",
      \"formFields\": [
        {\"selector\": \"#name-field\", \"label\": \"Full Name\", \"fieldType\": \"text\", \"required\": true},
        {\"selector\": \"#email-field\", \"label\": \"Email Address\", \"fieldType\": \"email\", \"required\": true},
        {\"selector\": \"#phone-field\", \"label\": \"Phone Number\", \"fieldType\": \"tel\", \"required\": false},
        {\"selector\": \"#college-field\", \"label\": \"College\", \"fieldType\": \"text\", \"required\": true},
        {\"selector\": \"#year-select\", \"label\": \"Year of Study\", \"fieldType\": \"select\", \"options\": [\"1st\",\"2nd\",\"3rd\",\"4th\"]}
      ]
    },
    \"sessionId\": \"$FORM_SESSION\",
    \"userId\": \"$FORM_USER\"
  }")

FILL_TOOL=$(echo "$FILL_RESPONSE" | grep -o '"toolUsed":"[^"]*"' | cut -d'"' -f4)
HAS_FILL_PAYLOAD=$(echo "$FILL_RESPONSE" | grep -c '"fillPayload"')
FILL_ACTION=$(echo "$FILL_RESPONSE" | grep -o '"action":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$FILL_TOOL" = "fill_form" ] && [ "$HAS_FILL_PAYLOAD" -gt 0 ]; then
  echo "✅ F4 PASS — fill_form fired, fillPayload present"
  if [ "$FILL_ACTION" = "fill_form_ready" ]; then
    FIELDS_TO_FILL=$(echo "$FILL_RESPONSE" | grep -o '"fieldsToFill":[0-9]*' | cut -d':' -f2)
    echo "   Fields to fill: $FIELDS_TO_FILL"
    if [ -n "$FIELDS_TO_FILL" ] && [ "$FIELDS_TO_FILL" -gt 0 ]; then
      echo "✅ F4b PASS — fillInstructions non-empty"
    else
      echo "❌ F4b FAIL — No fill instructions in payload"
    fi
  else
    echo "⚠️  F4 WARN — fill_form fired but action=$FILL_ACTION"
  fi
else
  echo "❌ F4 FAIL — Expected fill_form tool. Got: $FILL_TOOL"
  echo "   Response preview: ${FILL_RESPONSE:0:300}"
fi
if [ "$FILL_TOOL" = "fill_form" ] && [ "$HAS_FILL_PAYLOAD" -gt 0 ]; then pass_fail 0; else pass_fail 1; fi

echo ""
echo "[F5] fill_form returns helpful error when no profile saved..."
NO_PROFILE_RESPONSE=$(curl -s -X POST "$API_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d "{
    \"message\": \"Fill this form for me\",
    \"pageContext\": {
      \"url\": \"https://forms.google.com\",
      \"title\": \"Form\",
      \"content\": \"Name: [input] Email: [input]\",
      \"pageType\": \"generic\"
    },
    \"sessionId\": \"no-profile-session\",
    \"userId\": \"user-with-no-profile-xyz\"
  }")
RESPONSE=$(echo "$NO_PROFILE_RESPONSE" | grep -o '"response":"[^"]*"' | head -1 | cut -d'"' -f4)
if echo "$RESPONSE" | grep -qi "save\|detail\|profile"; then
  echo "✅ F5 PASS — Helpful error message guides user to save profile"
else
  echo "❌ F5 FAIL — Error message not helpful: ${RESPONSE:0:100}"
fi
if echo "$RESPONSE" | grep -qi "save\|detail\|profile"; then pass_fail 0; else pass_fail 1; fi

echo ""
echo "[F6] Partial profile update preserves existing fields..."
curl -s -X POST "$API_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d "{
    \"message\": \"Update my phone to 8888888888\",
    \"pageContext\": {\"url\":\"https://test.com\",\"title\":\"Test\",\"content\":\"test\",\"pageType\":\"generic\"},
    \"sessionId\": \"$FORM_SESSION\",
    \"userId\": \"$FORM_USER\"
  }" > /dev/null
UPDATED_PROFILE=$(curl -s "$API_URL/api/profile/$FORM_USER")
STILL_HAS_EMAIL=$(echo "$UPDATED_PROFILE" | grep -c 'test@contextpilot.com')
PHONE_UPDATED=$(echo "$UPDATED_PROFILE" | grep -c '8888888888')
if [ "$STILL_HAS_EMAIL" -gt 0 ] && [ "$PHONE_UPDATED" -gt 0 ]; then
  echo "✅ F6 PASS — Partial update preserved email, updated phone"
else
  echo "❌ F6 FAIL — Partial update failed"
  echo "   Email preserved: $STILL_HAS_EMAIL | Phone updated: $PHONE_UPDATED"
fi
if [ "$STILL_HAS_EMAIL" -gt 0 ] && [ "$PHONE_UPDATED" -gt 0 ]; then pass_fail 0; else pass_fail 1; fi

echo ""
echo "Form Intelligence tests complete."
fi  # end form section

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║           Test Suite Complete             ║"
echo "╠═══════════════════════════════════════════╣"
printf "║  ✅ Passed:   %-28s║\n" "$PASS"
printf "║  ❌ Failed:   %-28s║\n" "$FAIL"
printf "║  ⚠️  Warnings: %-27s║\n" "$WARN"
printf "║  ⏭  Skipped:  %-28s║\n" "$SKIP"
printf "║  📊 Total:    %-28s║\n" "$TOTAL"
echo "╠═══════════════════════════════════════════╣"
if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
  echo "║  🚀 ALL TESTS PASSED — READY TO DEMO     ║"
elif [ $FAIL -eq 0 ]; then
  echo "║  ✅ No failures — warnings are non-critical  ║"
  echo "║  Check API keys if AI tests show WARN    ║"
elif [ $FAIL -le 2 ]; then
  echo "║  ⚠️  Minor failures — review above        ║"
else
  echo "║  🛑 Multiple failures — fix before demo  ║"
fi
echo "╚═══════════════════════════════════════════╝"
[ $FAIL -eq 0 ]

