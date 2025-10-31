#!/usr/bin/env node
/**
 * ARV (Agent Readiness Validation) Script
 * Validates that agents meet ADK compliance requirements
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

const REQUIRED_CHECKS = [
  'schema_reference',
  'function_tool_wrappers',
  'sub_agent_routing',
  'json_schema_validity',
  'connector_not_configured'
];

const results = {
  passed: [],
  failed: [],
  warnings: []
};

console.log('🔍 ARV: Agent Readiness Validation');
console.log('═'.repeat(60));
console.log('');

// Check 1: YAML has $schema reference
console.log('✓ Checking $schema references in agent YAMLs...');
const agentFiles = fs.readdirSync('agents').filter(f => f.endsWith('.yaml'));

let schemasFound = 0;
for (const file of agentFiles) {
  const filePath = path.join('agents', file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const doc = yaml.parse(content);

  if (doc.$schema) {
    schemasFound++;
  } else {
    results.failed.push(`${file}: Missing $schema reference`);
  }
}

if (schemasFound === agentFiles.length) {
  results.passed.push(`schema_reference: All ${agentFiles.length} agents have $schema`);
} else {
  results.failed.push(`schema_reference: Only ${schemasFound}/${agentFiles.length} have $schema`);
}

// Check 2: FunctionTool wrappers in connectors
console.log('✓ Checking FunctionTool wrappers in connectors...');
const connectorFiles = fs.readdirSync('connectors').filter(f => f.endsWith('.tool.ts'));

let functionToolsFound = 0;
for (const file of connectorFiles) {
  const filePath = path.join('connectors', file);
  const content = fs.readFileSync(filePath, 'utf-8');

  if (content.includes('FunctionTool') && content.includes('inputSchema') && content.includes('outputSchema')) {
    functionToolsFound++;
  } else {
    results.failed.push(`${file}: Missing FunctionTool or schemas`);
  }
}

if (functionToolsFound === connectorFiles.length) {
  results.passed.push(`function_tool_wrappers: All ${connectorFiles.length} connectors use FunctionTool`);
} else {
  results.failed.push(`function_tool_wrappers: Only ${functionToolsFound}/${connectorFiles.length} use FunctionTool`);
}

// Check 3: Orchestrator routes sub-agents
console.log('✓ Checking orchestrator sub-agent routing...');
const orchestratorPath = 'agents/agent_0_orchestrator.yaml';
const orchestratorContent = fs.readFileSync(orchestratorPath, 'utf-8');
const orchestrator = yaml.parse(orchestratorContent);

const hasSubAgents = orchestrator.tools?.some(t => t.type === 'agent');
if (hasSubAgents) {
  const subAgentNames = orchestrator.tools.filter(t => t.type === 'agent').map(t => t.name);
  results.passed.push(`sub_agent_routing: Orchestrator routes to ${subAgentNames.length} sub-agents`);
} else {
  results.failed.push('sub_agent_routing: Orchestrator does not route to sub-agents');
}

// Check 4: JSON Schemas are valid (basic check)
console.log('✓ Checking JSON Schema validity...');
const schemaFiles = [
  'newsfeed-demo/news_story.schema.json',
  'agents/_schemas/AgentConfig.schema.json'
];

let validSchemas = 0;
for (const file of schemaFiles) {
  try {
    const schema = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (schema.$schema && schema.type) {
      validSchemas++;
    }
  } catch (err) {
    results.failed.push(`${file}: Invalid JSON - ${err.message}`);
  }
}

if (validSchemas === schemaFiles.length) {
  results.passed.push(`json_schema_validity: All ${schemaFiles.length} schemas are valid`);
} else {
  results.failed.push(`json_schema_validity: Only ${validSchemas}/${schemaFiles.length} schemas are valid`);
}

// Check 5: Connectors return NOT_CONFIGURED without keys
console.log('✓ Checking connector NOT_CONFIGURED behavior...');
let notConfiguredFound = 0;
for (const file of connectorFiles) {
  const filePath = path.join('connectors', file);
  const content = fs.readFileSync(filePath, 'utf-8');

  if (content.includes('not_configured') && content.includes('process.env')) {
    notConfiguredFound++;
  } else {
    results.warnings.push(`${file}: May not handle missing API keys properly`);
  }
}

if (notConfiguredFound === connectorFiles.length) {
  results.passed.push(`connector_not_configured: All ${connectorFiles.length} connectors handle missing keys`);
} else {
  results.warnings.push(`connector_not_configured: ${connectorFiles.length - notConfiguredFound} connectors may fail without keys`);
}

// Print results
console.log('');
console.log('═'.repeat(60));
console.log('📊 ARV Results');
console.log('═'.repeat(60));
console.log('');

console.log(`✅ PASSED (${results.passed.length}):`);
results.passed.forEach(p => console.log(`   ✓ ${p}`));
console.log('');

if (results.warnings.length > 0) {
  console.log(`⚠️  WARNINGS (${results.warnings.length}):`);
  results.warnings.forEach(w => console.log(`   ⚠ ${w}`));
  console.log('');
}

if (results.failed.length > 0) {
  console.log(`❌ FAILED (${results.failed.length}):`);
  results.failed.forEach(f => console.log(`   ✗ ${f}`));
  console.log('');
  process.exit(1);
} else {
  console.log('✅ All ARV checks passed!');
  console.log('');
  console.log('Ready for deployment:');
  console.log('  1. Configure GCP: ./scripts/enable_firestore.sh');
  console.log('  2. Deploy agents: ./scripts/deploy_agents.sh');
  console.log('  3. Run demo: npm run demo');
  process.exit(0);
}
