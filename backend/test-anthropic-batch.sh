#!/usr/bin/env bash

# Tests Anthropic Message Batches API using curl.
# Requires ANTHROPIC_API_KEY or API_KEY in your environment.

set -euo pipefail

API_KEY="${API_KEY:-${ANTHROPIC_API_KEY:-}}"
if [ -z "${API_KEY}" ]; then
  echo "ERROR: Set API_KEY or ANTHROPIC_API_KEY in your environment."
  exit 1
fi

URL="https://api.anthropic.com/v1/messages/batches"
BETA="message-batches-2024-09-24"

GREEN="\033[32m"
RED="\033[31m"
BLUE="\033[34m"
NC="\033[0m"

echo -e "${BLUE}Calling Anthropic Message Batches API...${NC}"

read -r BODY CODE < <(
  curl -s -w "\n%{http_code}" "$URL" \
    --header "anthropic-version: 2023-06-01" \
    --header "content-type: application/json" \
    --header "x-api-key: $API_KEY" \
    --header "anthropic-beta: $BETA" \
    --data '{
      "requests": [
        {
          "custom_id": "first-prompt-in-my-batch",
          "params": {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 100,
            "messages": [
              {"role": "user", "content": "Hey Claude, tell me a short fun fact about video games!"}
            ]
          }
        },
        {
          "custom_id": "second-prompt-in-my-batch",
          "params": {
            "model": "claude-sonnet-4-6",
            "max_tokens": 100,
            "messages": [
              {"role": "user", "content": "Hey Claude, tell me a short fun fact about bees!"}
            ]
          }
        }
      ]
    }'
)

echo "HTTP $CODE"
echo "$BODY"

if [[ "$CODE" == "200" || "$CODE" == "202" ]]; then
  echo -e "${GREEN}PASS: Anthropic batches request accepted${NC}"
else
  echo -e "${RED}NOTE: Non-2xx status. This can happen with invalid model names or insufficient credits.${NC}"
  echo -e "${RED}Check the error message above for details (e.g., billing or model access).${NC}"
fi

