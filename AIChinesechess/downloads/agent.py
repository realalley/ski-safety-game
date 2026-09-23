#!/usr/bin/env python3
"""Runnable transport example, NOT a competitive AI. Replace choose_move().
AGENT_API_KEY must come from your own registered Agent. Python 3.10+; no dependencies.
"""
import argparse
import json
import os
import random
import time
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def choose_move(game):
    """Replace with your model/engine; coordinates are [file, rank], top-left [0,0]."""
    return random.choice(game["legalMoves"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:9000/api/v1")
    parser.add_argument("--games", type=int, default=1)
    args = parser.parse_args()
    key = os.environ.get("AGENT_API_KEY")
    if not key:
        raise SystemExit("Set AGENT_API_KEY to your registered Agent's API key.")

    def call(method, path, payload=None):
        # The payload (including requestId) remains identical on transport retries.
        data = json.dumps(payload).encode() if payload is not None else None
        for attempt in range(5):
            req = Request(args.base.rstrip("/") + path, data=data, method=method,
                          headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
            try:
                with urlopen(req, timeout=10) as response:
                    return json.load(response)
            except HTTPError as exc:
                error = json.load(exc)
                if exc.code not in (429, 503) or attempt == 4:
                    raise RuntimeError(error) from None
            except (URLError, TimeoutError):
                if attempt == 4:
                    raise
            time.sleep(min(0.25 * 2 ** attempt, 2))

    me = call("GET", "/me")
    print("Connected:", me["name"], me["version"])
    completed = 0
    try:
        while completed < args.games:
            match_id = call("GET", "/me")["activeMatch"]
            last_join = 0
            while not match_id:
                if time.monotonic() - last_join >= 20:
                    queued = call("POST", "/queue")
                    match_id = queued["matchId"]
                    last_join = time.monotonic()
                if not match_id:
                    time.sleep(1)
                    match_id = call("GET", "/me")["activeMatch"]
            print("Matched:", match_id)
            game = call("POST", f"/matches/{match_id}/ready")
            side = "red" if game["players"]["red"]["id"] == me["id"] else "black"
            while game["status"] in ("waiting", "active"):
                if game["status"] == "active" and game["turn"] == side:
                    move = choose_move(game)
                    try:
                        call("POST", f"/matches/{match_id}/moves", {
                            **move, "version": game["version"], "requestId": str(uuid.uuid4())})
                        print(game["version"] + 1, side, move)
                    except RuntimeError as exc:
                        # Illegal/stale/finished: reload authoritative state, never reset time locally.
                        print("Move rejected:", exc)
                time.sleep(0.5)
                game = call("GET", f"/matches/{match_id}")
            print("Result:", game.get("result"))
            completed += 1
    except KeyboardInterrupt:
        call("DELETE", "/queue")
        print("Stopped; an active game will still time out unless you reconnect.")


if __name__ == "__main__":
    main()
