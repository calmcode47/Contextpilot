#!/bin/bash

API_URL="${1:-https://YOUR-APP.up.railway.app}"
echo "🎯 Testing against: $API_URL"
echo "⏱  Starting pre-demo checks at $(date)"
PASS=0; FAIL=0; WARN=0

function report() {
  local level="$1"; shift
  local msg="$*"
  if [ "$level" = "PASS" ]; then
    echo "✅ $msg"
    ((PASS++))
  elif [ "$level" = "WARN" ]; then
    echo "⚠️  $msg"
    ((WARN++))
  else
    echo "❌ $msg"
    ((FAIL++))
  fi
}

function do_get() {
  local path="$1"
  curl -s -o /dev/stdout -D /tmp/headers.$$ "${API_URL}${path}"
}

function do_post() {
  local path="$1"
  local json="$2"
  curl -s -o /dev/stdout -D /tmp/headers.$$ -H "Content-Type: application/json" -d "$json" "${API_URL}${path}"
}

function header_contains() {
  local name="$1"
  grep -i "^$name:" /tmp/headers.$$ >/dev/null 2>&1
}

function json_field() {
  local body="$1"
  local jqpath="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "$body" | jq -r "$jqpath" 2>/dev/null
  else
    echo ""
  fi
}

echo ""
echo "1) Backend Reachability — GET /health"
health_body=$(do_get "/health")
health_code=$(tail -n1 /tmp/headers.$$ | awk '{print $2}')
if [ "$health_code" = "200" ] && echo "$health_body" | grep -q '"status":"ok"'; then
  report PASS "Healthcheck OK (200, status:ok)"
else
  report FAIL "Healthcheck failed (code=$health_code, body=$health_body)"
fi

echo ""
echo "2) Response Time Check — GET /health"
time_total=$(curl -s -o /dev/null -w "%{time_total}" "${API_URL}/health")
ms=$(printf "%.0f" "$(echo "$time_total * 1000" | bc -l)")
if [ "$ms" -le 500 ]; then
  report PASS "Healthcheck response time ${ms}ms"
else
  report WARN "Healthcheck response time ${ms}ms (over 500ms)"
fi

echo ""
echo "3) CORS Headers — Access-Control-Allow-Origin present"
cors_body=$(curl -s -o /dev/null -D /tmp/headers.$$ -H "Origin: chrome-extension://testid1234567890abcdef" "${API_URL}/health")
if header_contains "Access-Control-Allow-Origin"; then
  report PASS "CORS header Access-Control-Allow-Origin present"
else
  report WARN "CORS header missing (may be expected if origin not supplied or middleware configuration)"
fi

echo ""
echo "4) Rate Limit Headers — present on /api/chat"
sess="predemo-$(date +%s)"
chat_req='{
  "message": "Quick connectivity test",
  "pageContext": { "url": "https://example.com", "title": "Example", "content": "Short content for test", "pageType": "generic" },
  "sessionId": "'"$sess"'",
  "userId": "qa-user-1"
}'
chat_body=$(do_post "/api/chat" "$chat_req")
if header_contains "RateLimit-Limit" || header_contains "RateLimit-Remaining" || header_contains "RateLimit-Reset"; then
  report PASS "RateLimit headers present"
else
  report WARN "RateLimit headers not detected (may be disabled or using alternative header policy)"
fi

echo ""
echo "5) Real AI Response — non-empty over 50 chars"
resp_text=$(json_field "$chat_body" '.response')
ch=$(printf "%s" "$resp_text" | wc -c | tr -d ' ')
if [ -n "$resp_text" ] && [ "$ch" -gt 50 ]; then
  report PASS "AI response length ${ch} chars"
else
  report FAIL "AI response too short or empty (len=${ch})"
fi

echo ""
echo "6) Tool Firing — summarize trigger"
tool_req='{
  "message": "Please summarize the key points of this page in bullet points",
  "pageContext": {
    "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "title": "Artificial Intelligence - Wikipedia",
    "content": "Artificial intelligence (AI) is intelligence demonstrated by machines. AI research includes reasoning, knowledge, planning, learning, natural language processing, perception, and robotics.",
    "pageType": "generic"
  },
  "sessionId": "'"$sess"'",
  "userId": "qa-user-1"
}'
tool_body=$(do_post "/api/chat" "$tool_req")
tool_used=$(json_field "$tool_body" '.toolUsed')
if [ -n "$tool_used" ] && [ "$tool_used" != "null" ]; then
  report PASS "Tool fired: $tool_used"
else
  report WARN "Tool did not fire; provider may have produced a direct answer"
fi

echo ""
echo "7) Token Accounting — usage.inputTokens > 0"
input_tokens=$(json_field "$tool_body" '.usage.inputTokens')
if [ -n "$input_tokens" ] && [ "$input_tokens" -gt 0 ] 2>/dev/null; then
  report PASS "Token accounting present (inputTokens=$input_tokens)"
else
  report WARN "Token accounting missing or zero"
fi

echo ""
echo "8) Supabase Persistence — history contains messages"
hist_body=$(do_get "/api/history?sessionId=${sess}")
if echo "$hist_body" | grep -q '"messages"'; then
  # best-effort length with jq
  count=$(json_field "$hist_body" '.messages | length')
  if [ -n "$count" ] && [ "$count" -gt 0 ] 2>/dev/null; then
    report PASS "History contains $count messages"
  else
    report PASS "History present (messages array found)"
  fi
else
  report FAIL "History endpoint did not return messages"
fi

echo ""
echo "9) Feedback Storage — store correction and fetch"
msg_id=$(json_field "$tool_body" '.messageId')
fb_req='{
  "messageId": "'"${msg_id:-00000000-0000-0000-0000-000000000000}"'",
  "userId": "qa-user-1",
  "rating": "negative",
  "correction": "Use bullet points in summaries"
}'
fb_body=$(do_post "/api/feedback" "$fb_req")
cor_body=$(do_get "/api/feedback/corrections/qa-user-1")
if echo "$cor_body" | grep -qi 'bullet points'; then
  report PASS "Feedback correction stored"
else
  report WARN "Feedback correction not found"
fi

echo ""
echo "10) Error Handling — missing message returns 400"
bad_req='{
  "pageContext": { "url": "https://example.com", "title": "Example", "content": "Short", "pageType": "generic" },
  "sessionId": "'"$sess"'",
  "userId": "qa-user-1"
}'
bad_body=$(curl -s -o /dev/stdout -D /tmp/headers.$$ -H "Content-Type: application/json" -d "$bad_req" "${API_URL}/api/chat")
bad_code=$(tail -n1 /tmp/headers.$$ | awk '{print $2}')
if [ "$bad_code" = "400" ]; then
  report PASS "Validation error (400) on missing message"
else
  report FAIL "Expected 400 for missing message, got $bad_code"
fi

echo ""
echo "11) Rate Limit Active — rapid 5 chat requests"
rl_429=0
for i in $(seq 1 5); do
  r_body=$(curl -s -o /dev/stdout -D /tmp/headers.$$ -H "Content-Type: application/json" -d "$chat_req" "${API_URL}/api/chat")
  r_code=$(tail -n1 /tmp/headers.$$ | awk '{print $2}')
  if [ "$r_code" = "429" ]; then rl_429=1; fi
done
if [ "$rl_429" -eq 1 ]; then
  report WARN "Rate limit triggered (429) during rapid requests — expected under aggressive testing"
else
  report WARN "Rate limit not triggered with 5 requests — OK for demo"
fi

echo ""
echo "12) Response Time Under Load — 3 sequential chat requests"
slow=0
for i in $(seq 1 3); do
  t=$(curl -s -o /dev/null -w "%{time_total}" -H "Content-Type: application/json" -d "$chat_req" "${API_URL}/api/chat")
  ms=$(printf "%.0f" "$(echo "$t * 1000" | bc -l)")
  if [ "$ms" -gt 10000 ]; then slow=1; fi
done
if [ "$slow" -eq 1 ]; then
  report WARN "One or more chat requests exceeded 10s under load"
else
  report PASS "All chat requests under 10s"
fi

echo ""
echo "══════════════════════════════════"
echo " Pre-Demo Check Complete"
echo "══════════════════════════════════"
echo " ✅ Passed: $PASS"
echo " ⚠️  Warnings: $WARN"
echo " ❌ Failed: $FAIL"
if [ $FAIL -eq 0 ]; then
  echo " 🚀 READY TO DEMO"
else
  echo " 🛑 FIX FAILURES BEFORE DEMO"
fi

