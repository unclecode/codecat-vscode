# CodeCat - Claude Integration Guide

This document explains how CodeCat integrates with Claude AI for code review and custom commands.

## Setting Up Your API Key

To use the Claude-powered features (Code Review and Custom Commands), you need to provide an Anthropic API key in one of two ways:

1. **Environment Variable**: Set `ANTHROPIC_API_KEY` in your environment
2. **VS Code Settings**: Add your key to the `codecat.anthropicApiKey` setting

When you first use a Claude-powered feature, if no API key is found, you'll be prompted to enter one.

## Code Review Feature

The Code Review feature sends your code to Claude 3.7 Sonnet and requests a structured analysis including:

- Overall summary of code quality
- Issues (with severity levels)
- Improvement suggestions
- Positive aspects

### How It Works

1. Your selected files are concatenated with file headers
2. Code is sent to Claude with a specialized prompt
3. Claude analyzes the code and returns a structured JSON response with:
   - Summary
   - Issues (with severity, descriptions, code snippets, and suggested fixes)
   - Suggestions
   - Positive aspects
4. Results are formatted into a clean Markdown document

## Custom Commands

Custom Commands let you create your own specialized AI prompts for code analysis.

### Creating Custom Commands

1. Right-click and select "CodeCat → Create Sample Command" or "CodeCat → Create Custom Command"
2. This creates a markdown file in `.codecat/commands/` directory
3. Edit the markdown file to customize your prompt
4. Use "CodeCat → Run Custom Command" to execute it on selected files

### Sample Commands

The sample command (summarize.md) creates a high-level summary of your code including:
- Main purpose
- Key components
- Important patterns
- Potential issues

### How Custom Commands Work

1. Command files are detected from the `.codecat/commands/` directory
2. The file content is used as the prompt for Claude
3. Selected code is sent to Claude with your custom prompt
4. Results appear in a new editor tab

## Technical Implementation

CodeCat uses the Anthropic Messages API with Claude 3.7 Sonnet. For code review, it uses the tool use feature to ensure structured output in a consistent JSON format.

### Code Review API Call

```javascript
const response = await client.messages.create({
  model: "claude-3-7-sonnet-20250219",
  max_tokens: 4000,
  tools: [{
    name: "code_review",
    description: "Provide a structured code review with specific issues, suggestions, and positive aspects",
    input_schema: {
      // JSON schema for review format
    }
  }],
  tool_choice: { type: "tool", name: "code_review" },
  system: "You're a world-class software engineer...",
  messages: [{ role: "user", content: "Please review the following code..." }]
});
```

### Custom Commands API Call

```javascript
const response = await client.messages.create({
  model: "claude-3-7-sonnet-20250219",
  max_tokens: 4000,
  messages: [{
    role: "user", 
    content: `\`\`\`\n${code}\n\`\`\`\n\n${command.prompt}`
  }]
});
```