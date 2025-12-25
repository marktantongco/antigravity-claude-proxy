# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Antigravity Claude Proxy is a Node.js proxy server that exposes an Anthropic-compatible API backed by Antigravity's Cloud Code service. It enables using Claude models (`claude-sonnet-4-5-thinking`, `claude-opus-4-5-thinking`) with Claude Code CLI.

The proxy translates requests from Anthropic Messages API format → Google Generative AI format → Antigravity Cloud Code API, then converts responses back to Anthropic format with full thinking/streaming support.

## Commands

```bash
# Install dependencies
npm install

# Start server (runs on port 8080)
npm start

# Start with file watching for development
npm run dev

# Account management
npm run accounts         # Interactive account management
npm run accounts:add     # Add a new Google account via OAuth
npm run accounts:list    # List configured accounts
npm run accounts:verify  # Verify account tokens are valid

# Run all tests (server must be running on port 8080)
npm test

# Run individual tests
npm run test:signatures    # Thinking signatures
npm run test:multiturn     # Multi-turn with tools
npm run test:streaming     # Streaming SSE events
npm run test:interleaved   # Interleaved thinking
npm run test:images        # Image processing
npm run test:caching       # Prompt caching
```

## Architecture

**Request Flow:**
```
Claude Code CLI → Express Server (server.js) → CloudCode Client → Antigravity Cloud Code API
```

**Key Modules:**

- **src/server.js**: Express server exposing Anthropic-compatible endpoints (`/v1/messages`, `/v1/models`, `/health`, `/accounts`)
- **src/cloudcode-client.js**: Makes requests to Antigravity Cloud Code API with retry/failover logic, handles both streaming and non-streaming
- **src/format-converter.js**: Bidirectional conversion between Anthropic and Google Generative AI formats, including thinking blocks and tool calls
- **src/account-manager.js**: Multi-account pool with round-robin rotation, rate limit handling, and automatic cooldown
- **src/oauth.js**: Google OAuth implementation for adding accounts
- **src/token-extractor.js**: Extracts tokens from local Antigravity app installation (legacy single-account mode)
- **src/constants.js**: API endpoints, model mappings, OAuth config, and all configuration values
- **src/errors.js**: Custom error classes (`RateLimitError`, `AuthError`, `ApiError`, etc.) for structured error handling
- **src/utils/helpers.js**: Shared utility functions (`formatDuration`, `sleep`)

**Multi-Account Load Balancing:**
- Sticky account selection for prompt caching (stays on same account across turns)
- Automatic switch only when rate-limited for > 2 minutes
- Session ID derived from first user message hash for cache continuity
- Account state persisted to `~/.config/antigravity-proxy/accounts.json`

**Prompt Caching:**
- Cache is organization-scoped (requires same account + session ID)
- Session ID is SHA256 hash of first user message content (stable across turns)
- `cache_read_input_tokens` returned in usage metadata when cache hits
- Token calculation: `input_tokens = promptTokenCount - cachedContentTokenCount`

## Testing Notes

- Tests require the server to be running (`npm start` in separate terminal)
- Tests are CommonJS files (`.cjs`) that make HTTP requests to the local proxy
- Shared test utilities are in `tests/helpers/http-client.cjs`
- Test runner supports filtering: `node tests/run-all.cjs <filter>` to run matching tests

## Code Organization

**Constants:** All configuration values are centralized in `src/constants.js`:
- API endpoints and headers
- Model mappings
- OAuth configuration
- Rate limit thresholds
- Thinking model settings

**Error Handling:** Use custom error classes from `src/errors.js`:
- `RateLimitError` - 429/RESOURCE_EXHAUSTED errors
- `AuthError` - Authentication failures
- `ApiError` - Upstream API errors
- Helper functions: `isRateLimitError()`, `isAuthError()`

**Utilities:** Shared helpers in `src/utils/helpers.js`:
- `formatDuration(ms)` - Format milliseconds as "1h23m45s"
- `sleep(ms)` - Promise-based delay

## Maintenance

When making significant changes to the codebase (new modules, refactoring, architectural changes), update this CLAUDE.md and the README.md file to keep documentation in sync.
