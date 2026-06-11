#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="${SCRIPT_DIR}/runtime"
SUBMISSIONS_DIR="${RUNTIME_DIR}/submissions"
LEADERBOARD_PATH="${RUNTIME_DIR}/leaderboard.json"
SUBMISSION_RECORDS_PATH="${RUNTIME_DIR}/submission_records.json"
BEST_SCORES_PATH="${RUNTIME_DIR}/best_scores.json"
SERVER_LOG_PATH="${RUNTIME_DIR}/server.log"

mkdir -p "${SUBMISSIONS_DIR}"

find "${SUBMISSIONS_DIR}" -mindepth 1 -maxdepth 1 -type f -name '*.csv' -delete
rm -f "${SERVER_LOG_PATH}"

cat <<'EOF' > "${LEADERBOARD_PATH}"
{
  "metric": "rmsle",
  "updated_at": null,
  "submissions": []
}
EOF

cat <<'EOF' > "${SUBMISSION_RECORDS_PATH}"
{
  "metric": "rmsle",
  "updated_at": null,
  "submissions": []
}
EOF

cat <<'EOF' > "${BEST_SCORES_PATH}"
{
  "metric": "rmsle",
  "updated_at": null,
  "best_scores": []
}
EOF

echo "Reset local competition runtime state"
echo "Cleared submissions: ${SUBMISSIONS_DIR}"
echo "Reset files:"
echo "  - ${LEADERBOARD_PATH}"
echo "  - ${SUBMISSION_RECORDS_PATH}"
echo "  - ${BEST_SCORES_PATH}"
echo "Removed log: ${SERVER_LOG_PATH}"
