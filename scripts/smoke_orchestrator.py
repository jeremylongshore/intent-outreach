#!/usr/bin/env python3
"""
Smoke test for PipelinePilot Orchestrator Wrapper

Tests the ADK-compliant query(**kwargs) method locally without deployment.
This validates that the wrapper shape is correct for Reasoning Engine.
"""

import sys
import json
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.orchestrator_wrapper import OrchestratorWrapper


def test_ping():
    """Test ping/health check."""
    print("=" * 60)
    print("TEST 1: Ping (health check)")
    print("=" * 60)

    wrapper = OrchestratorWrapper()
    result = wrapper.query(action="ping", user_id="smoke_test")

    print(f"✅ Response: {json.dumps(result, indent=2)}")

    assert result["ok"] is True, "Ping should return ok=True"
    assert "message" in result, "Ping should include message"
    assert "tools" in result, "Ping should list available tools"
    assert result["tools"] == ["clay", "apollo", "clearbit", "crunchbase"], "Should list all 4 tools"

    print("✅ Ping test passed!\n")
    return result


def test_unknown_action():
    """Test unknown action handling."""
    print("=" * 60)
    print("TEST 2: Unknown action (error handling)")
    print("=" * 60)

    wrapper = OrchestratorWrapper()
    result = wrapper.query(action="invalid_action")

    print(f"✅ Response: {json.dumps(result, indent=2)}")

    assert result["ok"] is False, "Unknown action should return ok=False"
    assert "error" in result, "Unknown action should include error"
    assert "valid_actions" in result, "Unknown action should list valid actions"

    print("✅ Unknown action test passed!\n")
    return result


def test_missing_parameter():
    """Test missing required parameter."""
    print("=" * 60)
    print("TEST 3: Missing parameter (validation)")
    print("=" * 60)

    wrapper = OrchestratorWrapper()
    result = wrapper.query(action="clay")  # Missing required 'domain' parameter

    print(f"✅ Response: {json.dumps(result, indent=2)}")

    assert result["ok"] is False, "Missing param should return ok=False"
    assert "error" in result, "Missing param should include error"
    assert "domain" in result["error"], "Error should mention missing parameter"

    print("✅ Missing parameter test passed!\n")
    return result


def test_query_method_exists():
    """Test that wrapper has query method with correct signature."""
    print("=" * 60)
    print("TEST 4: ADK compliance (method signature)")
    print("=" * 60)

    wrapper = OrchestratorWrapper()

    # Check query method exists
    assert hasattr(wrapper, "query"), "Wrapper must have query method"

    # Check it's callable
    assert callable(wrapper.query), "query must be callable"

    # Check it accepts **kwargs
    import inspect
    sig = inspect.signature(wrapper.query)
    has_kwargs = any(
        param.kind == inspect.Parameter.VAR_KEYWORD
        for param in sig.parameters.values()
    )
    assert has_kwargs, "query must accept **kwargs"

    print("✅ Wrapper has query(**kwargs) method")
    print("✅ ADK compliance test passed!\n")


def main():
    """Run all smoke tests."""
    print("\n" + "=" * 60)
    print("ORCHESTRATOR WRAPPER SMOKE TESTS")
    print("=" * 60 + "\n")

    try:
        # Run all tests
        test_query_method_exists()
        test_ping()
        test_unknown_action()
        test_missing_parameter()

        print("=" * 60)
        print("✅ ALL SMOKE TESTS PASSED!")
        print("=" * 60)
        print("\nThe OrchestratorWrapper is ADK-compliant and ready for deployment.")
        print("Deploy with: python3 src/deploy_with_wrapper.py")
        return 0

    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {str(e)}")
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
