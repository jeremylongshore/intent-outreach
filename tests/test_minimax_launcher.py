"""Credential routing and failure isolation; no real keys or network."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("minimax_launcher", Path(__file__).parents[1] / "scripts/with-minimax.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class MiniMaxLauncherTests(unittest.TestCase):
    def test_only_minimax_key_reaches_command_and_retired_route_is_removed(self):
        with patch.dict(launcher.os.environ, {"XAI_API_KEY": "retired", "KILO_API_KEY": "retired", "PATH": "/bin"}, clear=True):
            env = launcher.child_environment("synthetic-minimax-key")
        for name in ["MINIMAX_API_KEY", "LLM_API_KEY", "JRIG_EVAL_API_KEY", "JRIG_AGENT_API_KEY"]:
            self.assertEqual(env[name], "synthetic-minimax-key")
        self.assertEqual(env["LLM_MODEL"], "MiniMax-M3")
        self.assertEqual(env["LLM_PROVIDER"], "minimax")
        self.assertEqual(env["LLM_BASE_URL"], "https://api.minimax.io/v1")
        self.assertNotIn("XAI_API_KEY", env)
        self.assertNotIn("KILO_API_KEY", env)
        self.assertNotIn("OPENAI_API_KEY", env)

    def test_probe_distinguishes_completed_reasoning_from_a_truncated_answer(self):
        self.assertEqual(launcher.answer_text("<think>reasoning</think>\nREADY"), "READY")
        self.assertEqual(launcher.answer_text("<think>READY"), "")
        self.assertEqual(launcher.answer_text(None), "")
        self.assertEqual(launcher.answer_text("not READY"), "not READY")

    def test_decryption_failures_do_not_echo_sensitive_diagnostics(self):
        result = subprocess.CompletedProcess([], 1, b"sensitive-value", b"sensitive-value")
        with patch.object(launcher.subprocess, "run", return_value=result):
            with self.assertRaises(ValueError) as context:
                launcher.load_key(Path("encrypted.json"))
        self.assertNotIn("sensitive-value", str(context.exception))

    def test_wrong_selector_cannot_fall_back_to_another_provider(self):
        result = subprocess.CompletedProcess([], 0, json.dumps({"kilo": {"key": "other-key"}}).encode(), b"")
        with patch.object(launcher.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(ValueError, "minimax.key"):
                launcher.load_key(Path("encrypted.json"))

    def test_valid_key_read_in_memory_with_bounded_noninteractive_decryption(self):
        result = subprocess.CompletedProcess([], 0, b'{"minimax":{"key":"synthetic-key"}}', b"")
        with patch.object(launcher.subprocess, "run", return_value=result) as run:
            self.assertEqual(launcher.load_key(Path("encrypted.json")), "synthetic-key")
        self.assertEqual(run.call_args.args[0], ["sops", "--decrypt", "--output-type", "json", "encrypted.json"])
        self.assertTrue(run.call_args.kwargs["capture_output"])
        self.assertEqual(run.call_args.kwargs["timeout"], 30)


if __name__ == "__main__":
    unittest.main()
