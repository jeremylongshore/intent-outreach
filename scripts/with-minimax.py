#!/usr/bin/env python3
"""Run an explicit command with MiniMax M3 credentials decrypted in memory."""
import argparse
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

MODEL = "MiniMax-M3"
BASE_URL = "https://api.minimax.io/v1"


def load_key(path):
    result = subprocess.run(
        ["sops", "--decrypt", "--output-type", "json", str(path)],
        capture_output=True, check=False, timeout=30,
    )
    if result.returncode or len(result.stdout) > 16 * 1024 * 1024:
        raise ValueError("SOPS decryption failed; decrypted output and diagnostics withheld")
    try:
        key = json.loads(result.stdout)["minimax"]["key"]
    except (KeyError, TypeError, json.JSONDecodeError):
        raise ValueError("SOPS file must contain minimax.key") from None
    if not isinstance(key, str) or len(key.strip()) < 8 or key.strip().startswith("${"):
        raise ValueError("SOPS minimax.key is missing or invalid")
    return key.strip()


def child_environment(key):
    env = os.environ.copy()
    # Remove the retired route from this command, without modifying stored credentials.
    for name in ("XAI_API_KEY", "GROK_API_KEY", "KILO_API_KEY"):
        env.pop(name, None)
    env.update({
        "MINIMAX_API_KEY": key, "MINIMAX_BASE_URL": BASE_URL,
        "LLM_API_KEY": key, "LLM_BASE_URL": BASE_URL, "LLM_MODEL": MODEL, "LLM_PROVIDER": "minimax",
        "JRIG_EVAL_API_KEY": key, "JRIG_AGENT_API_KEY": key,
    })
    return env


def answer_text(content):
    if not isinstance(content, str):
        return ""
    # Match the native MiniMax middleware: reasoning is not answer content.
    text = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    if "<think>" in text:
        return ""  # An unterminated reasoning block is not a successful answer.
    return text.strip()


def probe(key):
    body = json.dumps({"model": MODEL, "messages": [
        {"role": "user", "content": "Reply with only READY."}
    ], "max_tokens": 512}).encode()
    request = urllib.request.Request(BASE_URL + "/chat/completions", body,
        {"Content-Type": "application/json", "Authorization": "Bearer " + key})
    # No redirects, retries or provider fallback: do not forward a bearer elsewhere.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        print(json.dumps({"provider": "minimax", "requestedModel": MODEL,
                          "httpStatus": error.code, "passed": False}))
        return 1
    choices = data.get("choices", [])
    message = choices[0].get("message", {}) if choices else {}
    content = message.get("content", "")
    passed = (data.get("model") == MODEL and isinstance(content, str)
              and answer_text(content) == "READY" and choices[0].get("finish_reason") == "stop")
    print(json.dumps({"provider": "minimax", "requestedModel": MODEL,
        "observedModel": data.get("model"), "httpStatus": 200, "passed": passed,
        "finishReason": choices[0].get("finish_reason") if choices else None,
        "usage": data.get("usage"), "scope": "availability_only_not_workflow_qualification"}))
    return 0 if passed else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--secrets-file", type=Path,
        default=Path.home() / ".config/intentsolutions/api-providers.sops.json")
    parser.add_argument("--probe", action="store_true", help="One 512-token availability call; no workflow verdict")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="-- command [arguments]")
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if args.probe and command:
        parser.error("--probe and a command are mutually exclusive")
    if not args.probe and not command:
        parser.error("supply --probe or -- command [arguments]")
    try:
        key = load_key(args.secrets_file.expanduser().resolve())
        if args.probe:
            return probe(key)
        # The key never appears in argv or a plaintext file; command is not shell-expanded.
        os.execvpe(command[0], command, child_environment(key))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        print("MiniMax launcher failed; check SOPS access, minimax.key and command availability. Secret diagnostics withheld.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
