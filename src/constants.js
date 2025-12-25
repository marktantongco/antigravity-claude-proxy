/**
 * Constants for Antigravity Cloud Code API integration
 * Based on: https://github.com/NoeFabris/opencode-antigravity-auth
 */

import { homedir } from 'os';
import { join } from 'path';

// Cloud Code API endpoints (in fallback order)
const ANTIGRAVITY_ENDPOINT_DAILY = 'https://daily-cloudcode-pa.sandbox.googleapis.com';
const ANTIGRAVITY_ENDPOINT_PROD = 'https://cloudcode-pa.googleapis.com';

// Endpoint fallback order (daily → prod)
export const ANTIGRAVITY_ENDPOINT_FALLBACKS = [
    ANTIGRAVITY_ENDPOINT_DAILY,
    ANTIGRAVITY_ENDPOINT_PROD
];

// Required headers for Antigravity API requests
export const ANTIGRAVITY_HEADERS = {
    'User-Agent': 'antigravity/1.11.5 darwin/arm64',
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'Client-Metadata': JSON.stringify({
        ideType: 'IDE_UNSPECIFIED',
        platform: 'PLATFORM_UNSPECIFIED',
        pluginType: 'GEMINI'
    })
};

// Model name mappings: Anthropic format → Antigravity format
export const MODEL_MAPPINGS = {
    // Claude models
    'claude-3-opus-20240229': 'claude-opus-4-5-thinking',
    'claude-3-5-opus-20240229': 'claude-opus-4-5-thinking',
    'claude-3-5-sonnet-20241022': 'claude-sonnet-4-5',
    'claude-3-5-sonnet-20240620': 'claude-sonnet-4-5',
    'claude-3-sonnet-20240229': 'claude-sonnet-4-5',
    'claude-sonnet-4-5': 'claude-sonnet-4-5',
    'claude-sonnet-4-5-thinking': 'claude-sonnet-4-5-thinking',
    'claude-opus-4-5-thinking': 'claude-opus-4-5-thinking'
};

// Available models exposed by this proxy
export const AVAILABLE_MODELS = [
    {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5 (Antigravity)',
        description: 'Claude Sonnet 4.5 via Antigravity Cloud Code',
        context: 200000,
        output: 64000
    },
    {
        id: 'claude-sonnet-4-5-thinking',
        name: 'Claude Sonnet 4.5 Thinking (Antigravity)',
        description: 'Claude Sonnet 4.5 with extended thinking via Antigravity',
        context: 200000,
        output: 64000
    },
    {
        id: 'claude-opus-4-5-thinking',
        name: 'Claude Opus 4.5 Thinking (Antigravity)',
        description: 'Claude Opus 4.5 with extended thinking via Antigravity',
        context: 200000,
        output: 64000
    }
];

// Default project ID if none can be discovered
export const DEFAULT_PROJECT_ID = 'rising-fact-p41fc';

export const TOKEN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const REQUEST_BODY_LIMIT = '50mb';
export const ANTIGRAVITY_AUTH_PORT = 9092;
export const DEFAULT_PORT = 8080;

// Multi-account configuration
export const ACCOUNT_CONFIG_PATH = join(
    homedir(),
    '.config/antigravity-proxy/accounts.json'
);

// Antigravity app database path (for legacy single-account token extraction)
export const ANTIGRAVITY_DB_PATH = join(
    homedir(),
    'Library/Application Support/Antigravity/User/globalStorage/state.vscdb'
);

export const DEFAULT_COOLDOWN_MS = 60 * 1000; // 1 minute default cooldown
export const MAX_RETRIES = 5; // Max retry attempts across accounts
export const MAX_ACCOUNTS = 10; // Maximum number of accounts allowed

// Rate limit wait thresholds
export const MAX_WAIT_BEFORE_ERROR_MS = 120000; // 2 minutes - throw error if wait exceeds this

// Thinking model constants
export const CLAUDE_THINKING_MAX_OUTPUT_TOKENS = 64000; // Max output tokens for thinking models
export const MIN_SIGNATURE_LENGTH = 50; // Minimum valid thinking signature length

// Google OAuth configuration (from opencode-antigravity-auth)
export const OAUTH_CONFIG = {
    clientId: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
    clientSecret: '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',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v1/userinfo',
    callbackPort: 51121,
    scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/cclog',
        'https://www.googleapis.com/auth/experimentsandconfigs'
    ]
};
export const OAUTH_REDIRECT_URI = `http://localhost:${OAUTH_CONFIG.callbackPort}/oauth-callback`;

export default {
    ANTIGRAVITY_ENDPOINT_FALLBACKS,
    ANTIGRAVITY_HEADERS,
    MODEL_MAPPINGS,
    AVAILABLE_MODELS,
    DEFAULT_PROJECT_ID,
    TOKEN_REFRESH_INTERVAL_MS,
    REQUEST_BODY_LIMIT,
    ANTIGRAVITY_AUTH_PORT,
    DEFAULT_PORT,
    ACCOUNT_CONFIG_PATH,
    ANTIGRAVITY_DB_PATH,
    DEFAULT_COOLDOWN_MS,
    MAX_RETRIES,
    MAX_ACCOUNTS,
    MAX_WAIT_BEFORE_ERROR_MS,
    CLAUDE_THINKING_MAX_OUTPUT_TOKENS,
    MIN_SIGNATURE_LENGTH,
    OAUTH_CONFIG,
    OAUTH_REDIRECT_URI
};
