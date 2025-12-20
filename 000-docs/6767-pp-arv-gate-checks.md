# ARV Gate Checks

**Last Updated:** 2025-11-01
**Status:** Requirements Defined
**Workflow:** `.github/workflows/arv-gate.yml`

---

## Purpose

**ARV (Agent Readiness Verification)** gate ensures agents are production-ready before merge to main.

**Goal:** Catch integration issues, schema mismatches, and runtime errors before deployment.

---

## Gate Checks

### 1. Schema Validation

**Purpose:** Verify agent instruction and tool schemas are correct
**Script:** `scripts/validate_schema.py`
**Timeout:** 30 seconds

**Validates:**

**Agent Instruction Schema**
```python
{
  "role": "orchestrator",
  "model": "gemini-2.0-flash-exp",
  "temperature": 0.2,
  "output_format": "json",
  "required_fields": [
    "steps",
    "leads",
    "contacts",
    "email",
    "next_action"
  ]
}
```

**Tool Signature Schema**
```python
# Each tool must have:
- name: str
- description: str
- parameters: dict with JSON schema
- async def function
- return: dict with "error" field for failures
```

**JSON Output Schema**
```python
{
  "steps": ["string"],
  "leads": [{"company": "str", "domain": "str", ...}],
  "contacts": [{"name": "str", "email": "str", ...}],
  "email": {"subject": "str", "body": "str"},
  "next_action": "string"
}
```

**Pass Criteria:**
- Agent instruction contains all required fields
- All 4 tools have valid signatures
- Tools use async def
- JSON schema matches expected structure

**Failure Examples:**
```
❌ Missing required field: "next_action"
❌ Tool "clay_lookup" missing description
❌ Tool "apollo_people" not async
❌ Invalid JSON schema: "leads" should be array
```

**How to Fix:**
- Update `src/agents/orchestrator.py` instruction
- Add missing tool descriptions
- Convert sync functions to async
- Match JSON schema exactly

---

### 2. Golden File Tests

**Purpose:** Verify known inputs produce expected outputs
**Location:** `tests/golden/`
**Timeout:** 2 minutes

**Test Cases:**

**Golden Test 1: Clay Lookup**
```python
# Input
input = {
  "domain": "salesforce.com"
}

# Expected output contains
{
  "company": "Salesforce",
  "industry": "Software",
  "employees": "70000+",
  "founded": "1999"
}
```

**Golden Test 2: Apollo People**
```python
# Input
input = {
  "company": "salesforce.com",
  "titles": ["VP Sales", "Director Sales"]
}

# Expected output contains
{
  "people": [
    {"name": "...", "title": "...", "email": "..."}
  ]
}
```

**Golden Test 3: Clearbit Enrich**
```python
# Input
input = {
  "email": "john@salesforce.com"
}

# Expected output contains
{
  "name": "...",
  "title": "...",
  "linkedin": "...",
  "company": "Salesforce"
}
```

**Golden Test 4: Crunchbase Company**
```python
# Input
input = {
  "company": "salesforce"
}

# Expected output contains
{
  "funding": "...",
  "investors": [...],
  "last_round": "..."
}
```

**Pass Criteria:**
- All 4 tool tests pass
- Output matches expected schema
- No exceptions raised
- Timeout not exceeded

**Failure Examples:**
```
❌ Clay lookup returned None
❌ Apollo people missing "email" field
❌ Clearbit timeout exceeded
❌ Crunchbase invalid JSON response
```

**How to Fix:**
- Check API key in Secret Manager
- Verify tool error handling
- Add timeout configuration
- Fix JSON parsing

---

### 3. E2E Simulation

**Purpose:** Simulate full campaign workflow end-to-end
**Script:** `tests/e2e/simulate_campaign.py`
**Timeout:** 5 minutes

**Workflow:**

```
1. Query Agent with campaign input
   ↓
2. Agent calls clay_lookup
   ↓
3. Agent calls apollo_people
   ↓
4. Agent calls clearbit_enrich
   ↓
5. Agent calls crunchbase_company
   ↓
6. Agent returns JSON with all required fields
```

**Input:**
```json
{
  "icp": "B2B SaaS companies",
  "domains": ["example.com", "test.com"],
  "email": "contact@example.com"
}
```

**Expected Output:**
```json
{
  "steps": [
    "Research: Company info via Clay",
    "Search: Decision makers via Apollo",
    "Enrich: Contact details via Clearbit",
    "Analyze: Funding via Crunchbase",
    "Draft: Personalized outreach email"
  ],
  "leads": [
    {
      "company": "Example Corp",
      "domain": "example.com",
      "industry": "SaaS",
      "size": "50-100",
      "funding": "$10M Series A"
    }
  ],
  "contacts": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "title": "VP Sales",
      "linkedin": "https://linkedin.com/in/johndoe"
    }
  ],
  "email": {
    "subject": "Streamline your sales pipeline with PipelinePilot",
    "body": "Hi John,\n\nI noticed Example Corp..."
  },
  "next_action": "Follow up in 3 days, connect on LinkedIn, track email opens"
}
```

**Pass Criteria:**
- E2E simulation completes successfully
- All 4 tools executed
- JSON output matches schema
- No exceptions raised
- Execution time < 5 minutes

**Failure Examples:**
```
❌ Agent timeout after 300s
❌ Clay lookup failed: 401 Unauthorized
❌ Missing "contacts" array in output
❌ JSON parse error in response
```

**How to Fix:**
- Increase timeout if needed
- Verify all API keys are set
- Fix agent instruction to include all fields
- Add JSON validation before return

---

### 4. ADK Import Check

**Purpose:** Ensure clean imports with no errors
**Timeout:** 10 seconds

**Checks:**

**Orchestrator Import**
```bash
python -c "from src.agents.orchestrator import orchestrator_agent"
```

**Tools Import**
```bash
python -c "from src.agents.tools import clay_lookup, apollo_people, clearbit_enrich, crunchbase_company"
```

**Pass Criteria:**
- Both imports succeed
- No ImportError
- No circular dependencies
- No syntax errors

**Failure Examples:**
```
❌ ImportError: No module named 'agents'
❌ SyntaxError: invalid syntax in orchestrator.py
❌ NameError: name 'clay_lookup' is not defined
❌ Circular import detected
```

**How to Fix:**
- Verify PYTHONPATH includes `src/`
- Fix syntax errors
- Export all functions in `__init__.py`
- Remove circular imports

---

## ARV Gate Workflow

**File:** `.github/workflows/arv-gate.yml`

```yaml
name: ARV Gate

on:
  pull_request:
    branches: [main, develop]

jobs:
  arv-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Schema validation
        timeout-minutes: 1
        run: python scripts/validate_schema.py

      - name: Golden tests
        timeout-minutes: 3
        run: pytest tests/golden/ -v

      - name: E2E simulation
        timeout-minutes: 6
        env:
          PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_KEY }}
        run: python tests/e2e/simulate_campaign.py

      - name: ADK import check
        timeout-minutes: 1
        run: |
          python -c "from src.agents.orchestrator import orchestrator_agent"
          python -c "from src.agents.tools import clay_lookup, apollo_people, clearbit_enrich, crunchbase_company"
```

---

## Local ARV Testing

**Run all checks locally before pushing:**

```bash
# Schema validation
python scripts/validate_schema.py

# Golden tests
pytest tests/golden/ -v

# E2E simulation
PROJECT_ID=pipelinepilot-prod python tests/e2e/simulate_campaign.py

# Import check
python -c "from src.agents.orchestrator import orchestrator_agent"
python -c "from src.agents.tools import clay_lookup, apollo_people, clearbit_enrich, crunchbase_company"
```

**Quick check script:**
```bash
./scripts/arv_check.sh
```

---

## Bypassing ARV Gate (Emergency Only)

**NEVER bypass ARV gate without explicit approval.**

ARV gate ensures production readiness - bypassing it risks breaking deployed agents.

**If emergency bypass is required:**
1. Add `[skip-arv]` to commit message
2. Document reason in PR description
3. Create follow-up issue to fix
4. Run manual ARV checks before deploy

**Example:**
```bash
git commit -m "hotfix: critical production issue [skip-arv]"
```

---

## ARV Pass Summary

| Check | Purpose | Pass Criteria | Timeout |
|-------|---------|---------------|---------|
| **Schema validation** | Verify agent/tool schemas | All schemas valid | 30s |
| **Golden tests** | Known inputs → expected outputs | All 4 tools pass | 2m |
| **E2E simulation** | Full campaign workflow | Complete successfully | 5m |
| **ADK import** | Clean imports | No errors | 10s |

**Total ARV time:** ~8 minutes

---

## Troubleshooting

### Schema Validation Fails
```bash
# Check agent instruction
cat src/agents/orchestrator.py | grep -A 50 "instruction="

# Validate JSON manually
python scripts/validate_schema.py --verbose
```

### Golden Tests Fail
```bash
# Run single tool test
pytest tests/golden/test_clay.py -v -s

# Check API key
gcloud secrets versions access latest --secret="CLAY_API_KEY"

# Test tool directly
python -c "from src.agents.tools import clay_lookup; import asyncio; asyncio.run(clay_lookup(domain='salesforce.com'))"
```

### E2E Simulation Fails
```bash
# Run with debug logging
DEBUG=1 python tests/e2e/simulate_campaign.py

# Check all API keys
./scripts/check_secrets.sh

# Test Agent locally
python tests/e2e/test_agent_local.py
```

### Import Errors
```bash
# Check PYTHONPATH
echo $PYTHONPATH

# Verify module structure
tree src/

# Test imports manually
python -c "import sys; sys.path.insert(0, 'src'); from agents.orchestrator import orchestrator_agent"
```

---

## Resources

- **ARV workflow:** `.github/workflows/arv-gate.yml`
- **Schema validation:** `scripts/validate_schema.py`
- **Golden tests:** `tests/golden/`
- **E2E simulation:** `tests/e2e/simulate_campaign.py`
- **Local check script:** `scripts/arv_check.sh`

---

**Last Updated:** 2025-11-01
**Status:** Requirements defined, workflow pending creation
**Next Action:** Create ARV workflow and test scripts
