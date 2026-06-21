---
name: outreach-profile
description: >-
  Inspect or scaffold an Intent Outreach Report Profile — the local file of deterministic knobs
  (intake, filtering, tone/length, output formats, delivery) that shape a campaign. Use when the user
  wants to list existing profiles, see a named profile, or create a new one. Triggers:
  "/outreach-profile", "list report profiles", "show a report profile", "create an outreach profile".
allowed-tools:
  - Read
  - Glob
  - Write
  - AskUserQuestion
version: 0.1.0
author: Jeremy Longshore
license: SEE LICENSE IN LICENSE
compatibility: Claude Code (and any MCP-capable client for the bundled server)
tags:
  - sdr
  - profiles
  - configuration
argument-hint: "[list | show NAME | new NAME]"
model: inherit
user-invocable: true
---

# Outreach Profile — manage Report Profiles

## Overview

A **Report Profile** is a local file (under `profiles/` or `~/.intent-outreach/profiles/`) that owns
the deterministic choices for a campaign — intake, filtering, tone/length, output formats, and
delivery — while the model owns the creative drafting. This skill lists profiles, shows a named
profile's knobs, or scaffolds a new one. It is a local-file utility; it sends nothing.

## Prerequisites

- Read/Glob/Write access to the project (and optionally the user-global
  `~/.intent-outreach/profiles/` directory).
- The Report Profile knob reference, shipped at the path
  `skills/intent-outreach/references/report-profiles.md` (read it before scaffolding a new profile).

## Instructions

Read the argument: one of `list`, `show NAME`, or `new NAME` (default to `list`).

- **list** — Glob `profiles/*` and `~/.intent-outreach/profiles/*`; show the available profiles by name.
- **show NAME** — Read the named profile and summarize its knobs (intake, filtering, tone/length,
  output formats, delivery).
- **new NAME** — Read the knob reference for the schema, ask the user for the key knobs via
  AskUserQuestion, then Write a new profile. Default location `profiles/NAME`; offer
  `~/.intent-outreach/profiles/NAME` if the user wants it user-global. Never overwrite an existing
  profile without confirming first.

## Output

- **list** — a bullet list of profile names + their locations.
- **show** — a short summary of the named profile's knobs.
- **new** — the path of the profile written, plus a one-line recap of the knobs chosen.

```
Profiles:
- default            (profiles/default)
- residential-re     (~/.intent-outreach/profiles/residential-re)
```

## Error Handling

- **No profiles found (list)** — not an error; say so and offer to scaffold one with `new`.
- **show NAME not found** — report it and list the names that DO exist.
- **new NAME already exists** — stop and confirm before overwriting; never clobber silently.
- **Knob reference missing** — proceed with the documented defaults and note the reference was absent.

## Examples

> **User:** "/outreach-profile new residential-re"
>
> Reads the knob reference, asks for intake/filtering/tone/output/delivery via AskUserQuestion, writes
> `profiles/residential-re`, and confirms the path + chosen knobs.

## Resources

- Knob reference + shipped starters: `skills/intent-outreach/references/report-profiles.md`.
- Full campaign that consumes a profile: the `intent-outreach` skill.
