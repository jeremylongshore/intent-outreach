#!/usr/bin/env node
// ARV (Agent Readiness Validation) – ensures agents/*.yaml meet ADK + PipelinePilot standards
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import yaml from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.join(__dirname, "..", "agents");
const schemaPath = path.join(agentsDir, "_schemas", "AgentConfig.schema.json");

const ajv = new Ajv2020({ allErrors: true, verbose: true, strict: false });
addFormats(ajv);

const agentSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const validate = ajv.compile(agentSchema);

function checkARV() {
  const errors = [];
  const yamls = fs.readdirSync(agentsDir).filter(f => f.endsWith(".yaml") && !f.startsWith("_"));

  for (const file of yamls) {
    const fullPath = path.join(agentsDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    let parsed;
    try {
      parsed = yaml.parse(raw);
    } catch (err) {
      errors.push(`${file}: YAML parse error – ${err.message}`);
      continue;
    }

    // Check $schema field
    if (!parsed.$schema) {
      errors.push(`${file}: Missing $schema field`);
    }

    // Validate against schema
    const valid = validate(parsed);
    if (!valid) {
      errors.push(`${file}: Schema validation failed – ${ajv.errorsText(validate.errors)}`);
    }

    // Check instructions field (required, minimum 20 chars)
    if (!parsed.instructions || typeof parsed.instructions !== "string" || parsed.instructions.trim().length < 20) {
      errors.push(`${file}: Missing or insufficient instructions field (minimum 20 chars required)`);
    }

    // Check examples array (at least 1 example with user/assistant)
    if (!parsed.examples || !Array.isArray(parsed.examples) || parsed.examples.length === 0) {
      errors.push(`${file}: Missing examples array (at least 1 example required)`);
    } else {
      for (let i = 0; i < parsed.examples.length; i++) {
        const ex = parsed.examples[i];
        if (!ex.user || typeof ex.user !== "string" || ex.user.trim().length === 0) {
          errors.push(`${file}: Example ${i} missing valid 'user' field`);
        }
        if (!ex.assistant || typeof ex.assistant !== "string" || ex.assistant.trim().length === 0) {
          errors.push(`${file}: Example ${i} missing valid 'assistant' field`);
        }
      }
    }

    // Check FunctionTool references
    if (parsed.tools) {
      for (const tool of parsed.tools) {
        if (tool.type === "FunctionTool" && tool.ref) {
          const toolFile = tool.ref.split("#")[0];
          const toolPath = path.join(__dirname, "..", toolFile);
          if (!fs.existsSync(toolPath)) {
            errors.push(`${file}: FunctionTool ref not found – ${tool.ref}`);
          }
        }
      }
    }

    // Check orchestrator routing and parallel branch
    if (file.includes("orchestrator")) {
      if (!parsed.routing || typeof parsed.routing !== "object") {
        errors.push(`${file}: Orchestrator must have routing object`);
      } else {
        if (!parsed.routing.type || parsed.routing.type !== "sequential") {
          errors.push(`${file}: Orchestrator routing.type must be 'sequential'`);
        }
        if (!Array.isArray(parsed.routing.steps)) {
          errors.push(`${file}: Orchestrator routing.steps must be an array`);
        }
        if (!parsed.routing.parallel || !Array.isArray(parsed.routing.parallel) || parsed.routing.parallel.length === 0) {
          errors.push(`${file}: Orchestrator must have routing.parallel array with at least 1 item`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("❌ ARV FAILED:\n" + errors.join("\n"));
    process.exit(1);
  }

  console.log("✅ ARV PASSED – All agents validated");
}

checkARV();
