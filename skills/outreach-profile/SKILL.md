---
name: outreach-profile
description: >-
  List, inspect, or scaffold a local Intent Outreach Report Profile JSON file. Use when a user wants to
  manage repeatable campaign settings while preserving existing files. Trigger with
  "/outreach-profile", "show my outreach profile", or "create an outreach profile".
allowed-tools:
  - Read
  - Glob
  - Write
  - AskUserQuestion
version: 0.2.0
author: Jeremy Longshore <jeremy@intentsolutions.io>
license: SEE LICENSE IN LICENSE
compatibility: Claude Code; local filesystem access required
tags:
  - sdr
  - profiles
  - configuration
argument-hint: "[list | show <name> | new <name>]"
model: inherit
effort: medium
user-invocable: true
disable-model-invocation: true
---

# Outreach Profile

## Purpose

Manage local JSON configuration files validated by `ReportProfileSchema`. A report profile records campaign
preferences, but only a documented subset is automatically mapped into `RunCampaignInput`; this skill
must not imply that every accepted field is currently executed.

## Prerequisites

- Read access for `./profiles/` and, when requested, `~/.intent-outreach/profiles/`.
- Write access only when the user explicitly requests `new` or approves replacing a specific file.
- Read [references/profile-contract.md](references/profile-contract.md) before creating a profile.

## Instructions

1. Parse the operation as `list`, `show NAME`, or `new NAME`. Default to `list` only when the user
   omitted an operation.
2. For `list`, Glob `./profiles/*.json` and `~/.intent-outreach/profiles/*.json`. Return each file's
   basename and full location; do not expose unrelated files.
3. For `show`, resolve an exact JSON filename from those two roots, Read it, and summarize its fields.
   Label every field as **runtime-mapped**, **renderer-consumed**, or **schema-only** according to the
   profile contract.
4. For `new`, normalize the requested name to a `.json` filename, reject traversal and absolute paths,
   then use AskUserQuestion for the required fields and desired optional knobs. Default to
   `./profiles/NAME.json`; use the user-global root only when requested.
5. Before writing, Glob or Read the exact destination. If it exists, stop and obtain explicit overwrite
   approval. Otherwise Write one valid JSON object with `name`, `description`, non-empty
   `output.formats`, and non-empty `delivery.targets`.
6. Read the completed file back, verify its JSON shape against the contract, and report its path plus
   the runtime status of every selected knob.

## File and execution boundaries

- Write only beneath `./profiles/` or `~/.intent-outreach/profiles/`.
- Never overwrite a starter or user profile silently.
- Never include API keys, tokens, contact records, or message bodies in a profile.
- Profile loading validates structure. It does not itself run connectors, render files, deliver output,
  or send messages.

## Output

- `list`: profile names and locations.
- `show`: a field summary with runtime-mapped/renderer-consumed/schema-only labels.
- `new`: the written path, selected knobs, and a warning for any schema-only setting.

## Error handling

- **No profiles found:** return an empty result and offer `new`; do not create a file automatically.
- **Ambiguous name:** show all matches and require the user to select one.
- **Invalid JSON or missing required field:** report the exact field and leave the file unchanged.
- **Existing destination:** stop before Write until the user explicitly approves replacement.
- **Unsafe name/path:** reject it and request a simple filename.

## Examples

> **User:** `/outreach-profile new founder-email`

Ask for a description, output formats, delivery targets, channel, threshold, and drafting constraints;
write `profiles/founder-email.json` only if absent; then report which settings the runtime currently maps.

- **Example: list profiles.** Search only the project and user-global profile roots, then report distinct
  locations for duplicate basenames.
- **Example: inspect a starter.** Read its JSON and label connector-selection and delivery fields
  schema-only rather than promising execution.
- **Example: existing destination.** Stop before Write, show the exact path, and wait for explicit
  replacement approval.

For troubleshooting invalid JSON, identify the parse location or missing required field and recommend a
minimal correction. Do not rewrite an existing file unless the user authorized that exact destination.

## Resources

- Read [Profile schema and runtime mapping](references/profile-contract.md) before writing or describing
  any profile field.
- Use `intent-outreach` only after the user selects a profile and confirms the campaign scope.
