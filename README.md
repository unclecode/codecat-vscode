# CodeCat for AI - VSCode Extension

A powerful VSCode extension for preparing and analyzing your code with AI. Concatenate files, create skimmed versions, get AI code reviews, and run custom AI commands.

## Features

- **File Concatenation** - Combine multiple files with path headers
- **Skim Mode** - Generate a lightweight version that preserves structure but skips function bodies
- **Code Review** - Get detailed AI code reviews using Claude
- **Custom Commands** - Create your own AI prompts for specialized code analysis
- **Directory Tree** - Generate tree structure visualizations of your project directories
- **Multiple Output Options** - Copy to clipboard or open in editor

## Usage

### Basic Usage

1. Select files/folders in VSCode Explorer
2. Right-click and choose an option from the "CodeCat" menu:
   - **Generate Tree** - Create a directory structure tree visualization
   - **Concat to Clipboard** - Combine and copy to clipboard
   - **Concat to Editor** - Combine and open in a new editor
   - **Skim to Clipboard** - Create a lightweight version for clipboard
   - **Skim to Editor** - Create a lightweight version in editor
   - **Review Code** - Get an AI-powered code review
   - **Run Custom Command** - Execute a custom AI command

### Custom Commands

Create your own AI commands for specialized analysis:

1. Right-click and select "CodeCat → Create Sample Command" to create an example
2. Find the command file in the `.codecat/commands` directory
3. Edit the markdown file to customize your prompt
4. Select files and use "CodeCat → Run Custom Command" to execute

## Requirements

- Visual Studio Code 1.98.0 or higher
- Anthropic API key (for Code Review and Custom Commands)

## Feature Details

### Directory Tree

The Generate Tree command creates a visual representation of your project structure:

- Right-click on any folder in the Explorer and select "CodeCat → Generate Tree"
- The tree structure is copied to your clipboard
- Maximum depth is 10 levels to prevent excessive output
- Automatically respects `.gitignore` patterns
- Excludes common system directories (`.git`, `.vscode`, etc.)

## Configuration

- Set your Anthropic API key in Settings: `codecat.anthropicApiKey`
- Or set it as an environment variable: `ANTHROPIC_API_KEY`