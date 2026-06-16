/**
 * pipeline_core/connectors/registry.ts — deterministic connector registry.
 *
 * Insertion order IS the call order (Map preserves it), which is what makes the
 * pipeline deterministic: for the same input + same registered connectors, the
 * connector call sequence is identical across runs (017-AT-DECR acceptance #6).
 *
 * Users extend the system by calling registerConnector() — no core edits needed.
 */

import type { Connector, ConnectorPhase } from "./types.js";

const REGISTRY = new Map<string, Connector>();

/** Register (or replace) a connector. Last registration of a name wins. */
export function registerConnector(connector: Connector): void {
  REGISTRY.set(connector.name, connector);
}

/** All registered connectors, in registration order. */
export function getConnectors(): Connector[] {
  return [...REGISTRY.values()];
}

/** Look up one connector by name. */
export function getConnector(name: string): Connector | undefined {
  return REGISTRY.get(name);
}

/** Remove all connectors. Tests only. */
export function _clearRegistry(): void {
  REGISTRY.clear();
}

/**
 * Connectors that (a) participate in `phase` and (b) are configured, in
 * deterministic registration order. This is exactly what the pipeline iterates.
 */
export function getConfiguredConnectors(phase: ConnectorPhase): Connector[] {
  return getConnectors().filter(
    (c) => c.phases.includes(phase) && c.isConfigured(),
  );
}

/** Connectors for a phase that are NOT configured — reported as skipped. */
export function getSkippedConnectors(phase: ConnectorPhase): Connector[] {
  return getConnectors().filter(
    (c) => c.phases.includes(phase) && !c.isConfigured(),
  );
}
