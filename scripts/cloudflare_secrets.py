"""Upload only necessary secrets through Wrangler stdin; never print values."""

import argparse
import json
import os
import secrets
import subprocess
from pathlib import Path

from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("target", choices=["api", "web"])
args = parser.parse_args()
path = root / ".env"
values = {**dotenv_values(path), **os.environ}
if args.target == "api":
    names = ["LLM_API_KEY", "HINDSIGHT_API_KEY"]
    payload = {name: values.get(name) for name in names}
    if not all(payload.values()):
        raise SystemExit(
            "Configure LLM_API_KEY and HINDSIGHT_API_KEY in local .env first."
        )
else:
    password = values.get("DEMO_PASSWORD") or secrets.token_urlsafe(24)
    if not values.get("DEMO_PASSWORD"):
        with path.open("a") as file:
            file.write("\nDEMO_PASSWORD=" + password + "\n")
        path.chmod(0o600)
    payload = {"DEMO_PASSWORD": password}
    access = root / "deployment-access.txt"
    access.write_text(
        "IncidentMind hosted demo\nUsername: demo\nPassword: " + password + "\n"
    )
    access.chmod(0o600)
config = "wrangler.api.jsonc" if args.target == "api" else "wrangler.jsonc"
command = [
    str(root / "frontend/node_modules/.bin/wrangler"),
    "secret",
    "bulk",
    "--config",
    config,
]
result = subprocess.run(
    command,
    cwd=root / "frontend",
    input=json.dumps(payload),
    text=True,
    capture_output=True,
)
if result.returncode:
    # Provider errors can echo input; do not expose the captured output.
    raise SystemExit(
        "Secret upload failed. Check Cloudflare authentication and Worker existence; no secret values were printed."
    )
print(f"{args.target} Worker secrets uploaded securely.")
