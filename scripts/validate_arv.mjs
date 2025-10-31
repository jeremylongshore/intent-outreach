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

    // Check FunctionTool references
    if (parsed.tools) {
      for (const tool of parsed.tools) {
        if (tool.type === "function_tool") {
          const toolPath = path.join(__dirname, "..", tool.path);
          if (!fs.existsSync(toolPath)) {
            errors.push(`${file}: FunctionTool path not found – ${tool.path}`);
          }
        }
      }
    }

    // Check orchestrator routing
    if (file.includes("orchestrator")) {
      if (!parsed.routing || !Array.isArray(parsed.routing)) {
        errors.push(`${file}: Orchestrator must have routing array`);
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
