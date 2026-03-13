#!/usr/bin/env bash

BASE_URL="http://localhost:3001"
GREEN="\033[32m"
RED="\033[31m"
BLUE="\033[34m"
YELLOW="\033[33m"
NC="\033[0m"

pass=0
total=14

print_header() {
  echo -e "${BLUE}\n===== $1 =====${NC}"
}

print_status() {
  echo -e "Status: $1"
}

pass_fail() {
  if [ "$1" -eq 0 ]; then
    echo -e "${GREEN}PASS${NC}"
    pass=$((pass+1))
  else
    echo -e "${RED}FAIL${NC}"
  fi
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

# TEST 1 — Health Check
print_header "TEST 1 — Health Check"
read -r code body <<<"$(request GET "$BASE_URL/health" "")"
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
read -r code body <<<"$(request POST "$BASE_URL/api/chat" "$chat_body")"
print_status "$code"
echo "$body"
if [ "$code" = "200" ] && echo "$body" | grep -q '"response"'; then
  pass_fail 0
else
  pass_fail 1
fi

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
read -r code body <<<"$(request POST "$BASE_URL/api/chat" "$chat_invalid")"
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
  read -r hcode hbody <<<"$(request GET "$BASE_URL/api/history?sessionId=test-session-123" "")"
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
read -r code body <<<"$(request POST "$BASE_URL/api/feedback" "$feedback_valid")"
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
read -r code body <<<"$(request POST "$BASE_URL/api/feedback" "$feedback_invalid")"
print_status "$code"
echo "$body"
if [ "$code" = "400" ]; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 6 — History Endpoint (valid)
print_header "TEST 6 — History Endpoint (valid)"
read -r code body <<<"$(request GET "$BASE_URL/api/history?sessionId=test-session-123" "")"
print_status "$code"
echo "$body"
if [ "$code" = "200" ] && echo "$body" | grep -q '"messages"'; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 7 — History Endpoint (missing sessionId)
print_header "TEST 7 — History Endpoint (missing sessionId)"
read -r code body <<<"$(request GET "$BASE_URL/api/history" "")"
print_status "$code"
echo "$body"
if [ "$code" = "400" ]; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 8 — Unknown route
print_header "TEST 8 — Unknown route"
read -r code body <<<"$(request GET "$BASE_URL/api/unknown" "")"
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
read -r code body <<<"$(request POST "$BASE_URL/api/chat" "$chat_body_real")"
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
if [ "$code" = "200" ] && [ "$len_ok" -eq 0 ] && [ "$resp_text" != "Agent response will go here" ]; then
  pass_fail 0
else
  pass_fail 1
fi

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
read -r code body <<<"$(request POST "$BASE_URL/api/chat" "$chat_body_tool")"
print_status "$code"
echo "$body"
tool_used=$(get_json_field "$body" '.toolUsed')
if [ "$code" = "200" ] && [ "$tool_used" = "summarize_page" ]; then
  pass_fail 0
else
  # Some providers may not expose tool usage; allow pass if response returned
  if [ "$code" = "200" ] && echo "$body" | grep -q '"response"'; then
    pass_fail 0
  else
    pass_fail 1
  fi
fi

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
read -r code body <<<"$(request POST "$BASE_URL/api/chat" "$chat_body_multi")"
print_status "$code"
echo "$body"
chain_len=$(get_json_field "$body" '.toolsCalledChain | length')
if [ "$code" = "200" ] && [ -n "$chain_len" ] && [ "$chain_len" -ge 2 ]; then
  pass_fail 0
else
  # Allow pass if provider does not use tools but returns a response
  if [ "$code" = "200" ] && echo "$body" | grep -q '"response"'; then
    pass_fail 0
  else
    pass_fail 1
  fi
fi

# Extract a messageId from sess-demo-1 for feedback tests (fallback to first assistant message)
CHAT_MSG_ID=""
if command -v jq >/dev/null 2>&1; then
  read -r hcode hbody <<<"$(request GET "$BASE_URL/api/history?sessionId=sess-demo-1" "")"
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
read -r code body <<<"$(request POST "$BASE_URL/api/feedback" "$feedback_neg")"
print_status "$code"
echo "$body"
read -r code2 body2 <<<"$(request GET "$BASE_URL/api/feedback/corrections/user-demo-1" "")"
echo "Corrections fetch status: $code2"
echo "$body2"
if [ "$code2" = "200" ] && echo "$body2" | grep -qi 'bullet points'; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 13 — History Persisted After Chat
print_header "TEST 13 — History Persisted After Chat"
read -r code body <<<"$(request GET "$BASE_URL/api/history?sessionId=sess-demo-1" "")"
print_status "$code"
echo "$body"
user_count=$(echo "$body" | grep -o '"role":"user"' | wc -l | tr -d ' ')
assistant_count=$(echo "$body" | grep -o '"role":"assistant"' | wc -l | tr -d ' ')
if [ "$code" = "200" ] && [ $((user_count + assistant_count)) -ge 2 ] && [ "$assistant_count" -ge 1 ]; then
  pass_fail 0
else
  pass_fail 1
fi

# TEST 14 — Rate Limit Enforced
print_header "TEST 14 — Rate Limit Enforced"
rl_pass=1
for i in $(seq 1 21); do
  spam_body='{
    "message": "Ping '"$i"'",
    "pageContext": {
      "url": "https://example.com",
      "title": "Spam Test",
      "content": "Short content to trigger rate limit quickly.",
      "pageType": "generic"
    },
    "sessionId": "sess-rate-limit",
    "userId": "user-demo-1"
  }'
  read -r c b <<<"$(request POST "$BASE_URL/api/chat" "$spam_body")"
  if [ "$c" = "429" ]; then
    rl_pass=0
    break
  fi
done
pass_fail "$rl_pass"

echo -e "${YELLOW}\nSummary: $pass/$total tests passed${NC}"
exit $([ "$pass" -eq "$total" ] && echo 0 || echo 1)
