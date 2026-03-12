#!/usr/bin/env bash

BASE_URL="http://localhost:3001"
GREEN="\033[32m"
RED="\033[31m"
BLUE="\033[34m"
YELLOW="\033[33m"
NC="\033[0m"

pass=0
total=8

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

echo -e "${YELLOW}\nSummary: $pass/$total tests passed${NC}"
exit $([ "$pass" -eq "$total" ] && echo 0 || echo 1)

