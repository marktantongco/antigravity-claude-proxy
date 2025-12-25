/**
 * Format Converter
 * Converts between Anthropic Messages API format and Google Generative AI format
 * 
 * Based on patterns from:
 * - https://github.com/NoeFabris/opencode-antigravity-auth
 * - https://github.com/1rgs/claude-code-proxy
 */

import crypto from 'crypto';
import {
    MODEL_MAPPINGS,
    CLAUDE_THINKING_MAX_OUTPUT_TOKENS,
    MIN_SIGNATURE_LENGTH
} from './constants.js';

/**
 * Map Anthropic model name to Antigravity model name
 * @param {string} anthropicModel - Anthropic format model name (e.g., 'claude-3-5-sonnet-20241022')
 * @returns {string} Antigravity format model name (e.g., 'claude-sonnet-4-5')
 */
export function mapModelName(anthropicModel) {
    return MODEL_MAPPINGS[anthropicModel] || anthropicModel;
}

/**
 * Check if a part is a thinking block
 * @param {Object} part - Content part to check
 * @returns {boolean} True if the part is a thinking block
 */
function isThinkingPart(part) {
    return part.type === 'thinking' ||
        part.type === 'redacted_thinking' ||
        part.thinking !== undefined ||
        part.thought === true;
}

/**
 * Check if a thinking part has a valid signature (>= MIN_SIGNATURE_LENGTH chars)
 */
function hasValidSignature(part) {
    const signature = part.thought === true ? part.thoughtSignature : part.signature;
    return typeof signature === 'string' && signature.length >= MIN_SIGNATURE_LENGTH;
}

/**
 * Sanitize a thinking part by keeping only allowed fields
 */
function sanitizeThinkingPart(part) {
    // Gemini-style thought blocks: { thought: true, text, thoughtSignature }
    if (part.thought === true) {
        const sanitized = { thought: true };
        if (part.text !== undefined) sanitized.text = part.text;
        if (part.thoughtSignature !== undefined) sanitized.thoughtSignature = part.thoughtSignature;
        return sanitized;
    }

    // Anthropic-style thinking blocks: { type: "thinking", thinking, signature }
    if (part.type === 'thinking' || part.thinking !== undefined) {
        const sanitized = { type: 'thinking' };
        if (part.thinking !== undefined) sanitized.thinking = part.thinking;
        if (part.signature !== undefined) sanitized.signature = part.signature;
        return sanitized;
    }

    return part;
}

/**
 * Filter content array, keeping only thinking blocks with valid signatures.
 * Since signature_delta transmits signatures properly, cache is no longer needed.
 */
function filterContentArray(contentArray) {
    const filtered = [];

    for (const item of contentArray) {
        if (!item || typeof item !== 'object') {
            filtered.push(item);
            continue;
        }

        if (!isThinkingPart(item)) {
            filtered.push(item);
            continue;
        }

        // Keep items with valid signatures
        if (hasValidSignature(item)) {
            filtered.push(sanitizeThinkingPart(item));
            continue;
        }

        // Drop unsigned thinking blocks
        console.log('[FormatConverter] Dropping unsigned thinking block');
    }

    return filtered;
}

/**
 * Filter unsigned thinking blocks from contents (Gemini format)
 *
 * @param {Array<{role: string, parts: Array}>} contents - Array of content objects in Gemini format
 * @returns {Array<{role: string, parts: Array}>} Filtered contents with unsigned thinking blocks removed
 */
export function filterUnsignedThinkingBlocks(contents) {
    return contents.map(content => {
        if (!content || typeof content !== 'object') return content;

        if (Array.isArray(content.parts)) {
            return { ...content, parts: filterContentArray(content.parts) };
        }

        return content;
    });
}

/**
 * Remove trailing unsigned thinking blocks from assistant messages.
 * Claude/Gemini APIs require that assistant messages don't end with unsigned thinking blocks.
 * This function removes thinking blocks from the end of content arrays.
 *
 * @param {Array<Object>} content - Array of content blocks
 * @returns {Array<Object>} Content array with trailing unsigned thinking blocks removed
 */
export function removeTrailingThinkingBlocks(content) {
    if (!Array.isArray(content)) return content;
    if (content.length === 0) return content;

    // Work backwards from the end, removing thinking blocks
    let endIndex = content.length;
    for (let i = content.length - 1; i >= 0; i--) {
        const block = content[i];
        if (!block || typeof block !== 'object') break;

        // Check if it's a thinking block (any format)
        const isThinking = isThinkingPart(block);

        if (isThinking) {
            // Check if it has a valid signature
            if (!hasValidSignature(block)) {
                endIndex = i;
            } else {
                break; // Stop at signed thinking block
            }
        } else {
            break; // Stop at first non-thinking block
        }
    }

    if (endIndex < content.length) {
        console.log('[FormatConverter] Removed', content.length - endIndex, 'trailing unsigned thinking blocks');
        return content.slice(0, endIndex);
    }

    return content;
}

/**
 * Sanitize a thinking block by removing extra fields like cache_control.
 * Only keeps: type, thinking, signature (for thinking) or type, data (for redacted_thinking)
 */
function sanitizeAnthropicThinkingBlock(block) {
    if (!block) return block;

    if (block.type === 'thinking') {
        const sanitized = { type: 'thinking' };
        if (block.thinking !== undefined) sanitized.thinking = block.thinking;
        if (block.signature !== undefined) sanitized.signature = block.signature;
        return sanitized;
    }

    if (block.type === 'redacted_thinking') {
        const sanitized = { type: 'redacted_thinking' };
        if (block.data !== undefined) sanitized.data = block.data;
        return sanitized;
    }

    return block;
}

/**
 * Filter thinking blocks: keep only those with valid signatures.
 * Blocks without signatures are dropped (API requires signatures).
 * Also sanitizes blocks to remove extra fields like cache_control.
 *
 * @param {Array<Object>} content - Array of content blocks
 * @returns {Array<Object>} Filtered content with only valid signed thinking blocks
 */
export function restoreThinkingSignatures(content) {
    if (!Array.isArray(content)) return content;

    const originalLength = content.length;
    const filtered = [];

    for (const block of content) {
        if (!block || block.type !== 'thinking') {
            filtered.push(block);
            continue;
        }

        // Keep blocks with valid signatures (>= MIN_SIGNATURE_LENGTH chars), sanitized
        if (block.signature && block.signature.length >= MIN_SIGNATURE_LENGTH) {
            filtered.push(sanitizeAnthropicThinkingBlock(block));
        }
        // Unsigned thinking blocks are dropped
    }

    if (filtered.length < originalLength) {
        console.log(`[FormatConverter] Dropped ${originalLength - filtered.length} unsigned thinking block(s)`);
    }

    return filtered;
}

/**
 * Reorder content so that:
 * 1. Thinking blocks come first (required when thinking is enabled)
 * 2. Text blocks come in the middle (filtering out empty/useless ones)
 * 3. Tool_use blocks come at the end (required before tool_result)
 *
 * Claude API requires that when thinking is enabled, assistant messages must start with thinking.
 *
 * @param {Array<Object>} content - Array of content blocks
 * @returns {Array<Object>} Reordered content array
 */
export function reorderAssistantContent(content) {
    if (!Array.isArray(content)) return content;

    // Even for single-element arrays, we need to sanitize thinking blocks
    if (content.length === 1) {
        const block = content[0];
        if (block && (block.type === 'thinking' || block.type === 'redacted_thinking')) {
            return [sanitizeAnthropicThinkingBlock(block)];
        }
        return content;
    }

    const thinkingBlocks = [];
    const textBlocks = [];
    const toolUseBlocks = [];
    let droppedEmptyBlocks = 0;

    for (const block of content) {
        if (!block) continue;

        if (block.type === 'thinking' || block.type === 'redacted_thinking') {
            // Sanitize thinking blocks to remove cache_control and other extra fields
            thinkingBlocks.push(sanitizeAnthropicThinkingBlock(block));
        } else if (block.type === 'tool_use') {
            toolUseBlocks.push(block);
        } else if (block.type === 'text') {
            // Only keep text blocks with meaningful content
            if (block.text && block.text.trim().length > 0) {
                textBlocks.push(block);
            } else {
                droppedEmptyBlocks++;
            }
        } else {
            // Other block types go in the text position
            textBlocks.push(block);
        }
    }

    if (droppedEmptyBlocks > 0) {
        console.log(`[FormatConverter] Dropped ${droppedEmptyBlocks} empty text block(s)`);
    }

    const reordered = [...thinkingBlocks, ...textBlocks, ...toolUseBlocks];

    // Log only if actual reordering happened (not just filtering)
    if (reordered.length === content.length) {
        const originalOrder = content.map(b => b?.type || 'unknown').join(',');
        const newOrder = reordered.map(b => b?.type || 'unknown').join(',');
        if (originalOrder !== newOrder) {
            console.log('[FormatConverter] Reordered assistant content');
        }
    }

    return reordered;
}

/**
 * Convert Anthropic message content to Google Generative AI parts
 */
function convertContentToParts(content, isClaudeModel = false) {
    if (typeof content === 'string') {
        return [{ text: content }];
    }

    if (!Array.isArray(content)) {
        return [{ text: String(content) }];
    }

    const parts = [];

    for (const block of content) {
        if (block.type === 'text') {
            // Skip empty text blocks - they cause API errors
            if (block.text && block.text.trim()) {
                parts.push({ text: block.text });
            }
        } else if (block.type === 'image') {
            // Handle image content
            if (block.source?.type === 'base64') {
                // Base64-encoded image
                parts.push({
                    inlineData: {
                        mimeType: block.source.media_type,
                        data: block.source.data
                    }
                });
            } else if (block.source?.type === 'url') {
                // URL-referenced image
                parts.push({
                    fileData: {
                        mimeType: block.source.media_type || 'image/jpeg',
                        fileUri: block.source.url
                    }
                });
            }
        } else if (block.type === 'document') {
            // Handle document content (e.g. PDF)
            if (block.source?.type === 'base64') {
                parts.push({
                    inlineData: {
                        mimeType: block.source.media_type,
                        data: block.source.data
                    }
                });
            } else if (block.source?.type === 'url') {
                parts.push({
                    fileData: {
                        mimeType: block.source.media_type || 'application/pdf',
                        fileUri: block.source.url
                    }
                });
            }
        } else if (block.type === 'tool_use') {
            // Convert tool_use to functionCall (Google format)
            // For Claude models, include the id field
            const functionCall = {
                name: block.name,
                args: block.input || {}
            };

            if (isClaudeModel && block.id) {
                functionCall.id = block.id;
            }

            parts.push({ functionCall });
        } else if (block.type === 'tool_result') {
            // Convert tool_result to functionResponse (Google format)
            let responseContent = block.content;
            if (typeof responseContent === 'string') {
                responseContent = { result: responseContent };
            } else if (Array.isArray(responseContent)) {
                const texts = responseContent
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
                responseContent = { result: texts };
            }

            const functionResponse = {
                name: block.tool_use_id || 'unknown',
                response: responseContent
            };

            // For Claude models, the id field must match the tool_use_id
            if (isClaudeModel && block.tool_use_id) {
                functionResponse.id = block.tool_use_id;
            }

            parts.push({ functionResponse });
        } else if (block.type === 'thinking') {
            // Handle thinking blocks - only those with valid signatures
            if (block.signature && block.signature.length >= MIN_SIGNATURE_LENGTH) {
                // Convert to Gemini format with signature
                parts.push({
                    text: block.thinking,
                    thought: true,
                    thoughtSignature: block.signature
                });
            }
            // Unsigned thinking blocks are dropped upstream
        }
    }

    return parts;
}

/**
 * Convert Anthropic role to Google role
 */
function convertRole(role) {
    if (role === 'assistant') return 'model';
    if (role === 'user') return 'user';
    return 'user'; // Default to user
}

/**
 * Convert Anthropic Messages API request to the format expected by Cloud Code
 * 
 * Uses Google Generative AI format, but for Claude models:
 * - Keeps tool_result in Anthropic format (required by Claude API)
 * 
 * @param {Object} anthropicRequest - Anthropic format request
 * @returns {Object} Request body for Cloud Code API
 */
export function convertAnthropicToGoogle(anthropicRequest) {
    const { messages, system, max_tokens, temperature, top_p, top_k, stop_sequences, tools, tool_choice, thinking } = anthropicRequest;
    const modelName = anthropicRequest.model || '';
    const isClaudeModel = modelName.toLowerCase().includes('claude');
    const isClaudeThinkingModel = isClaudeModel && modelName.toLowerCase().includes('thinking');

    const googleRequest = {
        contents: [],
        generationConfig: {}
    };

    // Handle system instruction
    if (system) {
        let systemParts = [];
        if (typeof system === 'string') {
            systemParts = [{ text: system }];
        } else if (Array.isArray(system)) {
            // Filter for text blocks as system prompts are usually text
            // Anthropic supports text blocks in system prompts
            systemParts = system
                .filter(block => block.type === 'text')
                .map(block => ({ text: block.text }));
        }

        if (systemParts.length > 0) {
            googleRequest.systemInstruction = {
                parts: systemParts
            };
        }
    }

    // Add interleaved thinking hint for Claude thinking models with tools
    if (isClaudeThinkingModel && tools && tools.length > 0) {
        const hint = 'Interleaved thinking is enabled. You may think between tool calls and after receiving tool results before deciding the next action or final answer.';
        if (!googleRequest.systemInstruction) {
            googleRequest.systemInstruction = { parts: [{ text: hint }] };
        } else {
            const lastPart = googleRequest.systemInstruction.parts[googleRequest.systemInstruction.parts.length - 1];
            if (lastPart && lastPart.text) {
                lastPart.text = `${lastPart.text}\n\n${hint}`;
            } else {
                googleRequest.systemInstruction.parts.push({ text: hint });
            }
        }
    }

    // Convert messages to contents, then filter unsigned thinking blocks
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        let msgContent = msg.content;

        // For assistant messages, process thinking blocks and reorder content
        if ((msg.role === 'assistant' || msg.role === 'model') && Array.isArray(msgContent)) {
            // First, try to restore signatures for unsigned thinking blocks from cache
            msgContent = restoreThinkingSignatures(msgContent);
            // Remove trailing unsigned thinking blocks
            msgContent = removeTrailingThinkingBlocks(msgContent);
            // Reorder: thinking first, then text, then tool_use
            msgContent = reorderAssistantContent(msgContent);
        }

        const parts = convertContentToParts(msgContent, isClaudeModel);
        const content = {
            role: convertRole(msg.role),
            parts: parts
        };
        googleRequest.contents.push(content);
    }

    // Filter unsigned thinking blocks for Claude models
    if (isClaudeModel) {
        googleRequest.contents = filterUnsignedThinkingBlocks(googleRequest.contents);
    }

    // Generation config
    if (max_tokens) {
        googleRequest.generationConfig.maxOutputTokens = max_tokens;
    }
    if (temperature !== undefined) {
        googleRequest.generationConfig.temperature = temperature;
    }
    if (top_p !== undefined) {
        googleRequest.generationConfig.topP = top_p;
    }
    if (top_k !== undefined) {
        googleRequest.generationConfig.topK = top_k;
    }
    if (stop_sequences && stop_sequences.length > 0) {
        googleRequest.generationConfig.stopSequences = stop_sequences;
    }

    // Enable thinking for Claude thinking models
    if (isClaudeThinkingModel) {
        const thinkingConfig = {
            include_thoughts: true
        };

        // Only set thinking_budget if explicitly provided
        const thinkingBudget = thinking?.budget_tokens;
        if (thinkingBudget) {
            thinkingConfig.thinking_budget = thinkingBudget;

            // Ensure maxOutputTokens is large enough when budget is specified
            if (!googleRequest.generationConfig.maxOutputTokens ||
                googleRequest.generationConfig.maxOutputTokens <= thinkingBudget) {
                googleRequest.generationConfig.maxOutputTokens = CLAUDE_THINKING_MAX_OUTPUT_TOKENS;
            }

            console.log('[FormatConverter] Thinking enabled with budget:', thinkingBudget);
        } else {
            console.log('[FormatConverter] Thinking enabled (no budget specified)');
        }

        googleRequest.generationConfig.thinkingConfig = thinkingConfig;
    }

    // Convert tools to Google format
    if (tools && tools.length > 0) {
        const functionDeclarations = tools.map((tool, idx) => {
            // Extract name from various possible locations
            const name = tool.name || tool.function?.name || tool.custom?.name || `tool-${idx}`;

            // Extract description from various possible locations
            const description = tool.description || tool.function?.description || tool.custom?.description || '';

            // Extract schema from various possible locations
            const schema = tool.input_schema
                || tool.function?.input_schema
                || tool.function?.parameters
                || tool.custom?.input_schema
                || tool.parameters
                || { type: 'object' };

            return {
                name: String(name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
                description: description,
                parameters: sanitizeSchema(schema)
            };
        });

        googleRequest.tools = [{ functionDeclarations }];
        console.log('[FormatConverter] Tools:', JSON.stringify(googleRequest.tools).substring(0, 300));
    }

    return googleRequest;
}

/**
 * Sanitize JSON Schema for Antigravity API compatibility.
 * Uses allowlist approach - only permit known-safe JSON Schema features.
 * Converts "const" to equivalent "enum" for compatibility.
 * Generates placeholder schema for empty tool schemas.
 */
function sanitizeSchema(schema) {
    if (!schema || typeof schema !== 'object') {
        // Empty/missing schema - generate placeholder with reason property
        return {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'Reason for calling this tool'
                }
            },
            required: ['reason']
        };
    }

    // Allowlist of permitted JSON Schema fields
    const ALLOWED_FIELDS = new Set([
        'type',
        'description',
        'properties',
        'required',
        'items',
        'enum',
        'title'
    ]);

    const sanitized = {};

    for (const [key, value] of Object.entries(schema)) {
        // Convert "const" to "enum" for compatibility
        if (key === 'const') {
            sanitized.enum = [value];
            continue;
        }

        // Skip fields not in allowlist
        if (!ALLOWED_FIELDS.has(key)) {
            continue;
        }

        if (key === 'properties' && value && typeof value === 'object') {
            sanitized.properties = {};
            for (const [propKey, propValue] of Object.entries(value)) {
                sanitized.properties[propKey] = sanitizeSchema(propValue);
            }
        } else if (key === 'items' && value && typeof value === 'object') {
            if (Array.isArray(value)) {
                sanitized.items = value.map(item => sanitizeSchema(item));
            } else {
                sanitized.items = sanitizeSchema(value);
            }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            sanitized[key] = sanitizeSchema(value);
        } else {
            sanitized[key] = value;
        }
    }

    // Ensure we have at least a type
    if (!sanitized.type) {
        sanitized.type = 'object';
    }

    // If object type with no properties, add placeholder
    if (sanitized.type === 'object' && (!sanitized.properties || Object.keys(sanitized.properties).length === 0)) {
        sanitized.properties = {
            reason: {
                type: 'string',
                description: 'Reason for calling this tool'
            }
        };
        sanitized.required = ['reason'];
    }

    return sanitized;
}

/**
 * Convert Google Generative AI response to Anthropic Messages API format
 *
 * @param {Object} googleResponse - Google format response (the inner response object)
 * @param {string} model - The model name used
 * @returns {Object} Anthropic format response
 */
export function convertGoogleToAnthropic(googleResponse, model) {
    // Handle the response wrapper
    const response = googleResponse.response || googleResponse;

    const candidates = response.candidates || [];
    const firstCandidate = candidates[0] || {};
    const content = firstCandidate.content || {};
    const parts = content.parts || [];

    // Convert parts to Anthropic content blocks
    const anthropicContent = [];
    let hasToolCalls = false;

    for (const part of parts) {
        if (part.text !== undefined) {
            // Handle thinking blocks
            if (part.thought === true) {
                const signature = part.thoughtSignature || '';

                // Include thinking blocks in the response for Claude Code
                anthropicContent.push({
                    type: 'thinking',
                    thinking: part.text,
                    signature: signature
                });
            } else {
                anthropicContent.push({
                    type: 'text',
                    text: part.text
                });
            }
        } else if (part.functionCall) {
            // Convert functionCall to tool_use
            // Use the id from the response if available, otherwise generate one
            anthropicContent.push({
                type: 'tool_use',
                id: part.functionCall.id || `toolu_${crypto.randomBytes(12).toString('hex')}`,
                name: part.functionCall.name,
                input: part.functionCall.args || {}
            });
            hasToolCalls = true;
        }
    }

    // Determine stop reason
    const finishReason = firstCandidate.finishReason;
    let stopReason = 'end_turn';
    if (finishReason === 'STOP') {
        stopReason = 'end_turn';
    } else if (finishReason === 'MAX_TOKENS') {
        stopReason = 'max_tokens';
    } else if (finishReason === 'TOOL_USE' || hasToolCalls) {
        stopReason = 'tool_use';
    }

    // Extract usage metadata
    // Note: Antigravity's promptTokenCount is the TOTAL (includes cached),
    // but Anthropic's input_tokens excludes cached. We subtract to match.
    const usageMetadata = response.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const cachedTokens = usageMetadata.cachedContentTokenCount || 0;

    return {
        id: `msg_${crypto.randomBytes(16).toString('hex')}`,
        type: 'message',
        role: 'assistant',
        content: anthropicContent.length > 0 ? anthropicContent : [{ type: 'text', text: '' }],
        model: model,
        stop_reason: stopReason,
        stop_sequence: null,
        usage: {
            input_tokens: promptTokens - cachedTokens,
            output_tokens: usageMetadata.candidatesTokenCount || 0,
            cache_read_input_tokens: cachedTokens,
            cache_creation_input_tokens: 0
        }
    };
}

export default {
    mapModelName,
    convertAnthropicToGoogle,
    convertGoogleToAnthropic
};
