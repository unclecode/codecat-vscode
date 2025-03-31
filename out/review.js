"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showReview = exports.reviewCode = exports.createReviewMarkdown = void 0;
const vscode = __importStar(require("vscode"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
/**
 * Get Anthropic API key from environment or user input
 */
async function getApiKey() {
    // Try to get from environment variable
    let apiKey = process.env.ANTHROPIC_API_KEY;
    // If not found, ask the user
    if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Anthropic API key',
            password: true,
            ignoreFocusOut: true,
            placeHolder: 'sk-ant-api...',
            validateInput: (value) => {
                if (!value || !value.startsWith('sk-ant-')) {
                    return 'API key should start with sk-ant-';
                }
                return null;
            }
        });
        if (apiKey) {
            // Store for future use in this session
            process.env.ANTHROPIC_API_KEY = apiKey;
            // Ask if the user wants to store it
            const shouldStore = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Would you like to store your API key for future sessions?'
            });
            if (shouldStore === 'Yes') {
                // This is a simple approach - in production, you might want to use a more secure storage mechanism
                await vscode.workspace.getConfiguration().update('codecat.anthropicApiKey', apiKey, vscode.ConfigurationTarget.Global);
            }
        }
    }
    return apiKey;
}
/**
 * Creates a markdown review document from the structured review result
 */
function createReviewMarkdown(result) {
    const md = [];
    // Add title and summary
    md.push('# Code Review Report');
    md.push('');
    md.push('## Summary');
    md.push('');
    md.push(result.summary);
    md.push('');
    // Group items by type
    const issues = result.items.filter(item => item.type === 'issue');
    const suggestions = result.items.filter(item => item.type === 'suggestion');
    const praise = result.items.filter(item => item.type === 'praise');
    // Helper function to get severity icon
    const getSeverityIcon = (severity) => {
        switch (severity) {
            case 'critical': return '✘'; // Heavy X
            case 'major': return '⚠'; // Warning sign
            case 'minor': return '▲'; // Up triangle
            case 'info': return 'ℹ'; // Info symbol
            default: return '•'; // Bullet point
        }
    };
    // Helper function to get type icon
    const getTypeIcon = (type) => {
        switch (type) {
            case 'issue': return '✗'; // X mark
            case 'suggestion': return '→'; // Right arrow
            case 'praise': return '✓'; // Check mark
            default: return '•'; // Bullet point
        }
    };
    // Add issues section if there are any
    if (issues.length > 0) {
        md.push('## ✗ Issues');
        md.push('');
        issues.forEach((item, index) => {
            const icon = getSeverityIcon(item.severity);
            const severityLabel = item.severity ? `**${item.severity.toUpperCase()}**` : '';
            const locationInfo = item.line_number ? `Line ${item.line_number}` : '';
            md.push(`### ${index + 1}. ${icon} ${item.title}`);
            md.push('');
            // Location and severity header line
            const headerParts = [];
            if (severityLabel)
                headerParts.push(severityLabel);
            if (item.file_path)
                headerParts.push(`**File:** \`${item.file_path}\``);
            if (locationInfo)
                headerParts.push(`**${locationInfo}**`);
            if (headerParts.length > 0) {
                md.push(headerParts.join(' | '));
                md.push('');
            }
            md.push(item.description);
            md.push('');
            if (item.code_snippet) {
                md.push('**Current Code:**');
                md.push('```');
                md.push(item.code_snippet);
                md.push('```');
                md.push('');
            }
            if (item.suggested_code) {
                md.push('**Suggested Solution:**');
                md.push('```');
                md.push(item.suggested_code);
                md.push('```');
                md.push('');
            }
            // Add a horizontal rule between items
            if (index < issues.length - 1) {
                md.push('<hr>');
                md.push('');
            }
        });
    }
    // Add suggestions section if there are any
    if (suggestions.length > 0) {
        md.push('## → Suggestions');
        md.push('');
        suggestions.forEach((item, index) => {
            const locationInfo = item.line_number ? `Line ${item.line_number}` : '';
            md.push(`### ${index + 1}. → ${item.title}`);
            md.push('');
            // Location header line
            const headerParts = [];
            if (item.file_path)
                headerParts.push(`**File:** \`${item.file_path}\``);
            if (locationInfo)
                headerParts.push(`**${locationInfo}**`);
            if (headerParts.length > 0) {
                md.push(headerParts.join(' | '));
                md.push('');
            }
            md.push(item.description);
            md.push('');
            if (item.code_snippet) {
                md.push('**Current Code:**');
                md.push('```');
                md.push(item.code_snippet);
                md.push('```');
                md.push('');
            }
            if (item.suggested_code) {
                md.push('**Suggested Improvement:**');
                md.push('```');
                md.push(item.suggested_code);
                md.push('```');
                md.push('');
            }
            // Add a horizontal rule between items
            if (index < suggestions.length - 1) {
                md.push('<hr>');
                md.push('');
            }
        });
    }
    // Add praise section if there are any
    if (praise.length > 0) {
        md.push('## ✓ Positive Aspects');
        md.push('');
        praise.forEach((item, index) => {
            md.push(`### ${index + 1}. ✓ ${item.title}`);
            md.push('');
            // Location header line
            const headerParts = [];
            if (item.file_path)
                headerParts.push(`**File:** \`${item.file_path}\``);
            if (item.line_number)
                headerParts.push(`**Line ${item.line_number}**`);
            if (headerParts.length > 0) {
                md.push(headerParts.join(' | '));
                md.push('');
            }
            md.push(item.description);
            md.push('');
            if (item.code_snippet) {
                md.push('**Code Example:**');
                md.push('```');
                md.push(item.code_snippet);
                md.push('```');
                md.push('');
            }
            // Add a horizontal rule between items
            if (index < praise.length - 1) {
                md.push('<hr>');
                md.push('');
            }
        });
    }
    // Add generation info
    const date = new Date().toISOString().split('T')[0];
    md.push('---');
    md.push('');
    md.push(`Generated on ${date} using Claude 3.7 Sonnet | ✗ Issues: ${issues.length} | → Suggestions: ${suggestions.length} | ✓ Positive Aspects: ${praise.length}`);
    return md.join('\n');
}
exports.createReviewMarkdown = createReviewMarkdown;
/**
 * Sends code to Anthropic API for review
 */
async function reviewCode(code, description = '') {
    try {
        // Get API key
        const apiKey = await getApiKey();
        if (!apiKey) {
            vscode.window.showErrorMessage('API key required for code review');
            return null;
        }
        // Setup Anthropic client
        const client = new sdk_1.default({
            apiKey
        });
        // Show progress indicator
        const progressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing code...',
            cancellable: false
        };
        return await vscode.window.withProgress(progressOptions, async () => {
            // Work with the current SDK version by using direct API call
            // Note: This bypasses the TypeScript type checking
            const anthropicClient = client;
            // Prepare the request with tools
            const requestBody = {
                model: "claude-3-7-sonnet-20250219",
                max_tokens: 4000,
                system: "You're a world-class software engineer tasked with reviewing code and providing constructive feedback. For each issue and suggestion, include a complete working solution that can be directly copied and used.",
                tools: [{
                        name: "code_review",
                        description: "Provide a structured code review with specific issues, suggestions, and positive aspects",
                        input_schema: {
                            type: "object",
                            properties: {
                                summary: {
                                    type: "string",
                                    description: "A concise summary of the overall code quality and main findings"
                                },
                                items: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            type: {
                                                type: "string",
                                                enum: ["issue", "suggestion", "praise"],
                                                description: "Type of review item: issue (problem to fix), suggestion (improvement idea), or praise (good practice)"
                                            },
                                            title: {
                                                type: "string",
                                                description: "Short title for this review item"
                                            },
                                            description: {
                                                type: "string",
                                                description: "Detailed explanation of the issue/suggestion/praise"
                                            },
                                            severity: {
                                                type: "string",
                                                enum: ["critical", "major", "minor", "info"],
                                                description: "Severity level for issues (optional for suggestions and praise)"
                                            },
                                            code_snippet: {
                                                type: "string",
                                                description: "Relevant code snippet that illustrates the point (if applicable)"
                                            },
                                            suggested_code: {
                                                type: "string",
                                                description: "Suggested code to replace the problematic code (provide a complete, working solution)"
                                            },
                                            file_path: {
                                                type: "string",
                                                description: "Path to the relevant file (if applicable)"
                                            },
                                            line_number: {
                                                type: "number",
                                                description: "Line number in the file (if applicable)"
                                            }
                                        },
                                        required: ["type", "title", "description"]
                                    }
                                }
                            },
                            required: ["summary", "items"]
                        }
                    }],
                tool_choice: { type: "tool", name: "code_review" },
                messages: [{
                        role: "user",
                        content: `${description ? `Context: ${description}\n\n` : ''}Please review the following code and provide a thorough, constructive code review. Focus on:
- Code structure and organization
- Potential bugs or edge cases
- Performance considerations  
- Security vulnerabilities
- Maintainability and readability
- Best practices for the language/framework

Identify:
1. Issues: Problems in the code that need to be fixed (with severity)
2. Suggestions: Ways to improve the code that are not critical issues
3. Positive aspects: Things the developer did well

Code:
\`\`\`
${code}
\`\`\``
                    }]
            };
            // Make the API call directly
            const response = await anthropicClient.messages.create(requestBody);
            // Process the response (looking for tool_use type)
            if (response.content) {
                for (const block of response.content) {
                    if (block.type === 'tool_use') {
                        // Extract the structured data
                        return block.input;
                    }
                }
            }
            throw new Error('Failed to get structured review from Claude');
        });
    }
    catch (error) {
        vscode.window.showErrorMessage(`Review failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
exports.reviewCode = reviewCode;
/**
 * Show review in a new untitled editor
 */
async function showReview(review) {
    try {
        // Generate markdown
        const markdown = createReviewMarkdown(review);
        // Create an untitled document with the content directly
        const document = await vscode.workspace.openTextDocument({
            content: markdown,
            language: 'markdown'
        });
        // Open the document in an editor
        const editor = await vscode.window.showTextDocument(document);
        return editor;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to display review: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
exports.showReview = showReview;
//# sourceMappingURL=review.js.map