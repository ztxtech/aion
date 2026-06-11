#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-19999}"
WEB_PORT="${WEB_PORT:-}"

port_is_bindable() {
  local host="$1"
  local port="$2"

  PORT_CHECK_HOST="${host}" PORT_CHECK_PORT="${port}" python3 - <<'PY'
import os
import socket
import sys

host = os.environ["PORT_CHECK_HOST"]
port = int(os.environ["PORT_CHECK_PORT"])
family = socket.AF_INET6 if ":" in host else socket.AF_INET

sock = socket.socket(family)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

try:
    sock.bind((host, port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
}

find_free_port() {
  local host="$1"

  PORT_CHECK_HOST="${host}" python3 - <<'PY'
import os
import socket

host = os.environ["PORT_CHECK_HOST"]
family = socket.AF_INET6 if ":" in host else socket.AF_INET

sock = socket.socket(family)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind((host, 0))
print(sock.getsockname()[1])
sock.close()
PY
}

collect_port_pids() {
  local port="$1"

  {
    if command -v lsof >/dev/null 2>&1; then
      lsof -tiTCP:"${port}" 2>/dev/null || true
    fi
    if command -v fuser >/dev/null 2>&1; then
      fuser -n tcp "${port}" 2>/dev/null | tr ' ' '\n' || true
    fi
  } | awk 'NF' | sort -u
}

wait_for_port_release() {
  local host="$1"
  local port="$2"
  local attempts="${3:-10}"
  local delay_seconds="${4:-1}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if port_is_bindable "${host}" "${port}"; then
      return 0
    fi
    sleep "${delay_seconds}"
  done

  return 1
}

print_port_diagnostics() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    echo "lsof diagnostics for port ${port}:"
    lsof -nP -iTCP:"${port}" 2>/dev/null || true
  fi

  if command -v fuser >/dev/null 2>&1; then
    echo "fuser diagnostics for port ${port}:"
    fuser -v -n tcp "${port}" 2>/dev/null || true
  fi

  if command -v ss >/dev/null 2>&1; then
    echo "ss diagnostics for port ${port}:"
    ss -ltnp "( sport = :${port} )" 2>/dev/null || true
  fi
}

cleanup_port() {
  local host="$1"
  local port="$2"
  local pids=""

  if port_is_bindable "${host}" "${port}"; then
    return 0
  fi

  pids="$(collect_port_pids "${port}")"
  if [[ -n "${pids//[$'\t\r\n ']}" ]]; then
    echo "Port ${port} is in use, stopping existing process(es): $(echo "${pids}" | xargs)"
    while IFS= read -r pid; do
      [[ -z "${pid}" ]] && continue
      kill "${pid}" 2>/dev/null || true
    done <<< "${pids}"

    if ! wait_for_port_release "${host}" "${port}" 3 1; then
      echo "Force killing remaining process(es) on port ${port}: $(echo "${pids}" | xargs)"
      while IFS= read -r pid; do
        [[ -z "${pid}" ]] && continue
        kill -9 "${pid}" 2>/dev/null || true
      done <<< "${pids}"
    fi
  fi

  if wait_for_port_release "${host}" "${port}" 5 1; then
    return 0
  fi

  echo "Unable to free port ${port} on host ${host}."
  print_port_diagnostics "${port}"
  return 1
}

if [[ $# -ge 1 && -n "${1:-}" ]]; then
  PORT="$1"
fi

if [[ $# -ge 2 && -n "${2:-}" ]]; then
  HOST="$2"
fi

if [[ -z "${WEB_PORT}" ]]; then
  WEB_PORT="$(find_free_port "${HOST}")"
fi

cleanup_port "${HOST}" "${PORT}"
cleanup_port "${HOST}" "${WEB_PORT}"

if [[ "${WEB_PORT}" == "${PORT}" ]]; then
  WEB_PORT="$(find_free_port "${HOST}")"
fi

echo "Starting local competition server"
echo "Server URL: http://${HOST}:${PORT}"
echo "Dashboard URL: http://${HOST}:${WEB_PORT}/dashboard"
echo "Log Path: ${SCRIPT_DIR}/runtime/server.log"

server_pid=""

cleanup() {
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
    wait "${server_pid}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

python3 "${SCRIPT_DIR}/kaggle_local_server.py" --host "${HOST}" --port "${PORT}" --dashboard-port "${WEB_PORT}" &
server_pid=$!

wait "${server_pid}"
