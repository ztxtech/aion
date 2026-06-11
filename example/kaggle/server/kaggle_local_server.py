#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import math
import socket
import sys
import threading
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public_data"
PRIVATE_DIR = BASE_DIR / "private_data"
RUNTIME_DIR = BASE_DIR / "runtime"
SUBMISSIONS_DIR = RUNTIME_DIR / "submissions"
LEADERBOARD_PATH = RUNTIME_DIR / "leaderboard.json"
SUBMISSION_RECORDS_PATH = RUNTIME_DIR / "submission_records.json"
BEST_SCORES_PATH = RUNTIME_DIR / "best_scores.json"
SERVER_LOG_PATH = RUNTIME_DIR / "server.log"

FILE_CONTENT_TYPES = {
    ".csv": "text/csv; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}

STATE_LOCK = threading.Lock()
LOGGER = logging.getLogger("kaggle_local_server")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_runtime() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    SUBMISSIONS_DIR.mkdir(parents=True, exist_ok=True)

    if not LEADERBOARD_PATH.exists():
        atomic_write_json(LEADERBOARD_PATH, default_collection_payload("submissions"))
    if not SUBMISSION_RECORDS_PATH.exists():
        atomic_write_json(SUBMISSION_RECORDS_PATH, default_collection_payload("submissions"))
    if not BEST_SCORES_PATH.exists():
        atomic_write_json(BEST_SCORES_PATH, default_collection_payload("best_scores"))


def configure_logging() -> None:
    ensure_runtime()
    if LOGGER.handlers:
        return

    LOGGER.setLevel(logging.INFO)
    LOGGER.propagate = False

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    LOGGER.addHandler(stream_handler)

    file_handler = logging.FileHandler(SERVER_LOG_PATH, encoding="utf-8")
    file_handler.setFormatter(formatter)
    LOGGER.addHandler(file_handler)


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    temp_path.write_text(json.dumps(payload, indent=2) + "\n")
    temp_path.replace(path)


def load_metadata() -> dict:
    return json.loads((PUBLIC_DIR / "competition.json").read_text())


def load_truth() -> dict[str, float]:
    truth: dict[str, float] = {}
    with (PRIVATE_DIR / "ground_truth.csv").open(newline="") as file_obj:
        reader = csv.DictReader(file_obj)
        for row in reader:
            truth[row["id"]] = float(row["sales"])
    return truth


def default_collection_payload(key: str) -> dict:
    return {
        "metric": "rmsle",
        "updated_at": utc_now_iso(),
        key: [],
    }


def read_collection(path: Path, key: str) -> list[dict]:
    ensure_runtime()
    if not path.exists():
        return []

    payload = json.loads(path.read_text())
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        value = payload.get(key, [])
        if isinstance(value, list):
            return value
    raise ValueError(f"unexpected data format in {path}")


def write_collection(path: Path, key: str, entries: list[dict]) -> None:
    atomic_write_json(
        path,
        {
            "metric": "rmsle",
            "updated_at": utc_now_iso(),
            key: entries,
        },
    )


def read_submission_records() -> list[dict]:
    return read_collection(SUBMISSION_RECORDS_PATH, "submissions")


def write_submission_records(entries: list[dict]) -> None:
    write_collection(SUBMISSION_RECORDS_PATH, "submissions", entries)


def read_leaderboard() -> list[dict]:
    return read_collection(LEADERBOARD_PATH, "submissions")


def write_leaderboard(entries: list[dict]) -> None:
    write_collection(LEADERBOARD_PATH, "submissions", entries)


def read_best_scores() -> list[dict]:
    return read_collection(BEST_SCORES_PATH, "best_scores")


def write_best_scores(entries: list[dict]) -> None:
    write_collection(BEST_SCORES_PATH, "best_scores", entries)


def rmsle(y_true: list[float], y_pred: list[float]) -> float:
    total = 0.0
    for truth, pred in zip(y_true, y_pred):
        total += (math.log1p(pred) - math.log1p(truth)) ** 2
    return math.sqrt(total / len(y_true))


def parse_submission(csv_bytes: bytes, expected_ids: set[str]) -> tuple[dict[str, float], list[str]]:
    text = csv_bytes.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames != ["id", "sales"]:
        raise ValueError("submission header must be exactly: id,sales")

    seen: dict[str, float] = {}
    ordered_ids: list[str] = []
    for row in reader:
        row_id = row["id"]
        if row_id in seen:
            raise ValueError(f"duplicate id: {row_id}")
        try:
            value = float(row["sales"])
        except ValueError as exc:
            raise ValueError(f"invalid sales value for id {row_id}: {row['sales']}") from exc
        if not math.isfinite(value):
            raise ValueError(f"non-finite sales value for id {row_id}")
        if value < 0:
            raise ValueError(f"negative sales value for id {row_id}")
        seen[row_id] = value
        ordered_ids.append(row_id)

    submitted_ids = set(seen)
    if submitted_ids != expected_ids:
        missing = sorted(expected_ids - submitted_ids)
        extra = sorted(submitted_ids - expected_ids)
        problems = []
        if missing:
            problems.append(f"missing ids: {missing[:5]}")
        if extra:
            problems.append(f"unexpected ids: {extra[:5]}")
        raise ValueError("; ".join(problems))

    return seen, ordered_ids


def is_valid_submitter_id(value: str) -> bool:
    if not value:
        return False
    allowed_extra = {"-", "_", "."}
    return all(char.isalnum() or char in allowed_extra for char in value)


def canonical_submission_record(record: dict) -> dict:
    return {
        "submission_id": record["submission_id"],
        "submitter_id": record["submitter_id"],
        "submission_name": record["submission_name"],
        "metric": record["metric"],
        "score": record["score"],
        "rows": record["rows"],
        "submitted_at": record["submitted_at"],
    }


def build_ranked_submissions(records: list[dict]) -> list[dict]:
    ranked = [canonical_submission_record(item) for item in records]
    ranked.sort(key=lambda item: (item["score"], item["submitted_at"]))
    for rank, item in enumerate(ranked, start=1):
        item["rank"] = rank
    return ranked


def build_best_scores(records: list[dict]) -> list[dict]:
    best_by_submitter: dict[str, dict] = {}
    for record in records:
        submitter_id = record["submitter_id"]
        current_best = best_by_submitter.get(submitter_id)
        candidate_key = (record["score"], record["submitted_at"])
        if current_best is None or candidate_key < (current_best["score"], current_best["submitted_at"]):
            best_by_submitter[submitter_id] = canonical_submission_record(record)

    best_scores = list(best_by_submitter.values())
    best_scores.sort(key=lambda item: (item["score"], item["submitted_at"], item["submitter_id"]))
    for rank, item in enumerate(best_scores, start=1):
        item["best_rank"] = rank
    return best_scores


def annotate_records(records: list[dict], ranked: list[dict], best_scores: list[dict]) -> list[dict]:
    rank_by_submission = {item["submission_id"]: item["rank"] for item in ranked}
    best_submission_ids = {item["submission_id"] for item in best_scores}

    annotated = []
    for record in records:
        item = canonical_submission_record(record)
        item["rank"] = rank_by_submission[item["submission_id"]]
        item["is_best_for_submitter"] = item["submission_id"] in best_submission_ids
        annotated.append(item)

    annotated.sort(key=lambda item: item["submitted_at"], reverse=True)
    return annotated


def dashboard_html(api_base_url: str) -> str:
    template = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Local Competition Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f2;
      --card: #ffffff;
      --ink: #1d2a31;
      --muted: #56656d;
      --accent: #0f766e;
      --line: #d7dedb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(180deg, #eef7f4 0%, var(--bg) 100%);
      color: var(--ink);
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }
    h1, h2 { margin: 0 0 12px; }
    p { margin: 0; color: var(--muted); }
    .hero {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(15, 118, 110, 0.08);
      margin-bottom: 20px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      overflow: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th { color: var(--muted); font-weight: 600; }
    code {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      background: #edf2f1;
      padding: 2px 6px;
      border-radius: 999px;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 12px;
      color: var(--muted);
      font-size: 14px;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.12);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Local Competition Dashboard</h1>
      <p>Auto-refreshes every 3 seconds.</p>
      <div class="meta">
        <div id="summary">Loading...</div>
        <div id="updated-at"></div>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Best Scores By Submitter</h2>
        <table>
          <thead>
            <tr><th>ID</th><th>Best Score</th><th>Rank</th><th>Submission</th></tr>
          </thead>
          <tbody id="best-scores-body"></tbody>
        </table>
      </div>

      <div class="panel">
        <h2>Leaderboard</h2>
        <table>
          <thead>
            <tr><th>Rank</th><th>ID</th><th>Score</th><th>Submission</th></tr>
          </thead>
          <tbody id="leaderboard-body"></tbody>
        </table>
      </div>
    </section>

    <section class="panel" style="margin-top: 16px;">
      <h2>Submission Records</h2>
      <table>
        <thead>
          <tr><th>Time</th><th>ID</th><th>Score</th><th>Rank</th><th>Submission</th><th>Status</th></tr>
        </thead>
        <tbody id="records-body"></tbody>
      </table>
    </section>
  </main>

  <script>
    const API_BASE_URL = __API_BASE_URL__;

    function formatScore(value) {
      return Number(value).toFixed(6);
    }

    function row(cells) {
      return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
    }

    function renderTable(bodyId, rows) {
      document.getElementById(bodyId).innerHTML = rows.length ? rows.join("") : row(["-", "-", "-", "-"]);
    }

    async function refresh() {
      const response = await fetch(`${API_BASE_URL}/api/dashboard-data`, { cache: 'no-store' });
      const data = await response.json();

      document.getElementById('summary').textContent = `Total submissions: ${data.submission_records.length} | Unique IDs: ${data.best_scores.length}`;
      document.getElementById('updated-at').textContent = `Updated: ${data.generated_at}`;

      renderTable('best-scores-body', data.best_scores.map((item) => row([
        `<code>${item.submitter_id}</code>`,
        formatScore(item.score),
        item.best_rank,
        `<code>${item.submission_id}</code>`,
      ])));

      renderTable('leaderboard-body', data.leaderboard.map((item) => row([
        item.rank,
        `<code>${item.submitter_id}</code>`,
        formatScore(item.score),
        `<code>${item.submission_id}</code>`,
      ])));

      renderTable('records-body', data.submission_records.map((item) => row([
        item.submitted_at,
        `<code>${item.submitter_id}</code>`,
        formatScore(item.score),
        item.rank,
        `<code>${item.submission_id}</code>`,
        item.is_best_for_submitter ? '<span class="pill">best</span>' : '',
      ])));
    }

    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>
"""
    return template.replace("__API_BASE_URL__", json.dumps(api_base_url))


class KaggleLocalHandler(BaseHTTPRequestHandler):
    server_version = "KaggleLocal/0.2"
    truth = load_truth()
    truth_ids = set(truth)
    metadata = load_metadata()

    def log_message(self, format: str, *args) -> None:
        LOGGER.info("%s - %s", self.client_address[0], format % args)

    def log_error(self, format: str, *args) -> None:
        LOGGER.error("%s - %s", self.client_address[0], format % args)

    def _write_response(self, data: bytes) -> None:
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, socket.timeout) as exc:
            LOGGER.warning(
                "client disconnected before response completed: method=%s path=%s client=%s error=%s",
                self.command,
                self.path,
                self.client_address[0],
                exc,
            )

    def _send_bytes(self, data: bytes, content_type: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self._write_response(data)

    def _send_json(self, payload: dict | list, status: HTTPStatus = HTTPStatus.OK) -> None:
        self._send_bytes(json.dumps(payload, indent=2).encode("utf-8"), FILE_CONTENT_TYPES[".json"], status)

    def _send_html(self, html: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        self._send_bytes(html.encode("utf-8"), FILE_CONTENT_TYPES[".html"], status)

    def _send_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self._send_json({"error": "file not found"}, HTTPStatus.NOT_FOUND)
            return

        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", FILE_CONTENT_TYPES.get(path.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        self.end_headers()
        self._write_response(data)

    def _dashboard_payload(self) -> dict:
        submission_records = read_submission_records()
        leaderboard = read_leaderboard()
        best_scores = read_best_scores()
        return {
            "metric": self.metadata["metric"],
            "generated_at": utc_now_iso(),
            "submission_records": submission_records,
            "leaderboard": leaderboard,
            "best_scores": best_scores,
        }

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path in {"/", "/dashboard"}:
            self._send_json({"error": "dashboard is served on a separate web port"}, HTTPStatus.NOT_FOUND)
            return
        if parsed.path == "/healthz":
            self._send_json({"status": "ok"})
            return
        if parsed.path == "/api/competition":
            self._send_json(self.metadata)
            return
        if parsed.path == "/api/files":
            files = []
            for path in sorted(PUBLIC_DIR.iterdir()):
                if path.is_file():
                    files.append({
                        "name": path.name,
                        "size": path.stat().st_size,
                        "url": f"/api/download/{path.name}",
                    })
            self._send_json({"files": files})
            return
        if parsed.path.startswith("/api/download/"):
            filename = unquote(parsed.path.removeprefix("/api/download/"))
            if "/" in filename or filename.startswith("."):
                self._send_json({"error": "invalid filename"}, HTTPStatus.BAD_REQUEST)
                return
            self._send_file(PUBLIC_DIR / filename)
            return
        if parsed.path == "/api/leaderboard":
            self._send_json({"metric": self.metadata["metric"], "submissions": read_leaderboard()})
            return
        if parsed.path == "/api/submission-records":
            self._send_json({"metric": self.metadata["metric"], "submissions": read_submission_records()})
            return
        if parsed.path == "/api/best-scores":
            self._send_json({"metric": self.metadata["metric"], "best_scores": read_best_scores()})
            return
        if parsed.path == "/api/dashboard-data":
            self._send_json(self._dashboard_payload())
            return
        if parsed.path.startswith("/api/submissions/"):
            submission_id = parsed.path.removeprefix("/api/submissions/")
            for entry in read_submission_records():
                if entry["submission_id"] == submission_id:
                    self._send_json(entry)
                    return
            self._send_json({"error": "submission not found"}, HTTPStatus.NOT_FOUND)
            return

        self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/submit":
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            self._send_json({"error": "empty request body"}, HTTPStatus.BAD_REQUEST)
            return

        body = self.rfile.read(content_length)
        submitter_id = self.headers.get("X-Submitter-Id", "").strip()
        submission_name = self.headers.get("X-Submission-Name", "submission.csv").strip() or "submission.csv"

        if not is_valid_submitter_id(submitter_id):
            self._send_json(
                {"error": "submitter id is required and may contain only letters, numbers, '-', '_' or '.'"},
                HTTPStatus.BAD_REQUEST,
            )
            return

        try:
            submitted, ordered_ids = parse_submission(body, self.truth_ids)
        except ValueError as exc:
            LOGGER.warning(
                "submission rejected: client=%s submitter_id=%s reason=%s",
                self.client_address[0],
                submitter_id,
                exc,
            )
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        y_true = [self.truth[row_id] for row_id in ordered_ids]
        y_pred = [submitted[row_id] for row_id in ordered_ids]
        score = rmsle(y_true, y_pred)
        timestamp = utc_now_iso()
        submission_id = uuid.uuid4().hex[:12]

        record = {
            "submission_id": submission_id,
            "submitter_id": submitter_id,
            "submission_name": submission_name,
            "metric": self.metadata["metric"],
            "score": score,
            "rows": len(ordered_ids),
            "submitted_at": timestamp,
        }

        ensure_runtime()
        with STATE_LOCK:
            submission_path = SUBMISSIONS_DIR / f"{submission_id}.csv"
            submission_path.write_bytes(body)

            submission_records = read_submission_records()
            submission_records.append(record)

            ranked = build_ranked_submissions(submission_records)
            best_scores = build_best_scores(submission_records)
            annotated_records = annotate_records(submission_records, ranked, best_scores)

            write_submission_records(annotated_records)
            write_leaderboard(ranked)
            write_best_scores(best_scores)

            created_record = next(item for item in annotated_records if item["submission_id"] == submission_id)

        LOGGER.info(
            "submission accepted: submitter_id=%s submission_id=%s score=%.6f rank=%s rows=%s",
            submitter_id,
            submission_id,
            score,
            created_record["rank"],
            len(ordered_ids),
        )

        self._send_json(created_record, HTTPStatus.CREATED)


def make_dashboard_handler(api_base_url: str) -> type[BaseHTTPRequestHandler]:
    class DashboardHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args) -> None:
            LOGGER.info("dashboard %s - %s", self.client_address[0], format % args)

        def log_error(self, format: str, *args) -> None:
            LOGGER.error("dashboard %s - %s", self.client_address[0], format % args)

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path not in {"/", "/dashboard"}:
                self.send_response(HTTPStatus.NOT_FOUND)
                self.send_header("Content-Type", FILE_CONTENT_TYPES[".json"])
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "not found"}')
                return

            data = dashboard_html(api_base_url).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", FILE_CONTENT_TYPES[".html"])
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return DashboardHandler


def start_dashboard_server(host: str, port: int, api_base_url: str) -> tuple[ThreadingHTTPServer, threading.Thread]:
    handler_cls = make_dashboard_handler(api_base_url)
    server = ThreadingHTTPServer((host, port), handler_cls)
    thread = threading.Thread(target=server.serve_forever, name="dashboard-server", daemon=True)
    thread.start()
    return server, thread


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local Kaggle-like evaluation server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19999)
    parser.add_argument("--dashboard-port", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_runtime()
    configure_logging()
    api_server = ThreadingHTTPServer((args.host, args.port), KaggleLocalHandler)
    host, port = api_server.server_address[:2]
    api_base_url = f"http://{host}:{port}"
    dashboard_server, _dashboard_thread = start_dashboard_server(args.host, args.dashboard_port, api_base_url)
    dashboard_host, dashboard_port = dashboard_server.server_address[:2]
    LOGGER.info(
        json.dumps(
            {
                "host": host,
                "port": port,
                "status": "serving",
                "server_url": api_base_url,
                "dashboard_url": f"http://{dashboard_host}:{dashboard_port}/dashboard",
                "log_path": str(SERVER_LOG_PATH),
            }
        )
    )
    try:
        api_server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        dashboard_server.shutdown()
        dashboard_server.server_close()
        LOGGER.info("server stopped: host=%s port=%s dashboard_port=%s", host, port, dashboard_port)
        api_server.server_close()


if __name__ == "__main__":
    main()
