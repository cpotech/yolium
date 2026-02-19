#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${YOLIUM_E2E_SKIP_DOCKER_TESTS:-}" ]]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    export YOLIUM_E2E_SKIP_DOCKER_TESTS=0
  else
    export YOLIUM_E2E_SKIP_DOCKER_TESTS=1
  fi
fi

if [[ -n "${DISPLAY:-}" ]]; then
  exec npx playwright test --config config/playwright.config.ts "$@"
fi

if ! command -v Xvfb >/dev/null 2>&1; then
  echo "ERROR: DISPLAY is not set and Xvfb is unavailable." >&2
  exit 1
fi

display_num=99
while [[ -e "/tmp/.X${display_num}-lock" ]]; do
  ((display_num++))
done

display=":${display_num}"
Xvfb "${display}" -screen 0 1920x1080x24 -ac >/tmp/yolium-xvfb.log 2>&1 &
xvfb_pid=$!

cleanup() {
  kill "${xvfb_pid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

DISPLAY="${display}" npx playwright test --config config/playwright.config.ts "$@"
