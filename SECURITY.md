# Security and trust model

Maps, commands, compiled programs and replays are validated JSON. They contain no executable
plugins or URLs to load. The SDK checks versions, finite values, bounds, references and roles.
Inputs are bounded, but do not expose the development MCP/admin service directly to an untrusted
network. A hosting application must supply authentication, quotas and process isolation if needed.

`Session` is a trusted host object. Give other callers a `SessionClient` with a fixed capability.
Player handles cannot register actors, inspect checkpoints or modify another actor. Director
handles can submit validated future entities; they cannot set score or force hits. Time control is
separately delegated. The default stdio MCP role is admin for a local development agent.

Custom in-process policies/adapters are trusted code. They can block or access the process; try/catch
is not a sandbox. The reference renderer and simulation use separate workers. Imported compiled
programs resolve only registered policy ID/version pairs. Hashes detect changed data relative to a
recorded digest; they are not signatures or proof against a replay author who replaces everything.

Filesystem adapters use hashed filenames in host-owned directories. They are not designed to
share those directories with an adversary capable of replacing files with symbolic links.

Report a vulnerability through the eventual repository's private advisory channel if enabled.
Otherwise ask the maintainer for a private reporting route without posting exploitable details.
