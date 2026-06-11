#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Submit a local CSV prediction file to the local Kaggle server.")
    parser.add_argument("submission_path", type=Path)
    parser.add_argument("--url", required=True)
    parser.add_argument("--submitter-id", required=True)
    parser.add_argument("--submission-name", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data = args.submission_path.read_bytes()
    request = urllib.request.Request(
        url=f"{args.url.rstrip('/')}/api/submit",
        data=data,
        method="POST",
        headers={
            "Content-Type": "text/csv; charset=utf-8",
            "X-Submitter-Id": args.submitter_id,
            "X-Submission-Name": args.submission_name or args.submission_path.name,
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"submission failed: HTTP {exc.code} {body}") from exc

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
