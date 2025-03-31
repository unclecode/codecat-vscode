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
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const review_1 = require("./review");
const customCommands_1 = require("./customCommands");
const LANGUAGE_CONFIGS = {
    // C-like languages (JavaScript, TypeScript, Java, C#, C++, etc.)
    'js': {
        functionStart: [
            /function\s+[\w$]+\s*\([^)]*\)\s*{/g,
            /[\w$]+\s*=\s*function\s*\([^)]*\)\s*{/g,
            /[\w$]+\s*:\s*function\s*\([^)]*\)\s*{/g,
            /(?:async\s+)?(?:[\w$]+|\[[\w$]+\])\s*\([^)]*\)\s*=>\s*{/g,
            /(?:class|interface)\s+[\w$]+(?:\s+extends\s+[\w$]+)?(?:\s+implements\s+[\w$]+(?:\s*,\s*[\w$]+)*)?\s*{/g,
            /(?:get|set)\s+[\w$]+\s*\(\)\s*{/g,
            /[\w$]+\s*\([^)]*\)\s*{/g // method() {
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    },
    'ts': {
        functionStart: [
            /function\s+[\w$]+\s*(?:<[^>]*>)?\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*{/g,
            /[\w$]+\s*=\s*function\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*{/g,
            /[\w$]+\s*:\s*function\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*{/g,
            /(?:async\s+)?(?:[\w$]+|\[[\w$]+\])\s*(?:<[^>]*>)?\s*\([^)]*\)(?:\s*:\s*[^{=]+)?\s*=>\s*{/g,
            /(?:class|interface)\s+[\w$]+(?:\s+extends\s+[\w$]+)?(?:\s+implements\s+[\w$]+(?:\s*,\s*[\w$]+)*)?\s*{/g,
            /(?:get|set)\s+[\w$]+\s*\(\)(?:\s*:\s*[^{]+)?\s*{/g,
            /[\w$]+\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*{/g // method(...): ReturnType {
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    },
    'java': {
        functionStart: [
            /(?:public|protected|private|static|final|abstract|synchronized)?\s+(?:[\w$<>,\s]+\s+)[\w$]+\s*\([^)]*\)(?:\s+throws\s+[\w$,\s]+)?\s*{/g
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    },
    'c': {
        functionStart: [
            /(?:\w+\s+)+\w+\s*\([^)]*\)\s*{/g // return_type name(...) {
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    },
    'cpp': {
        functionStart: [
            /(?:\w+::\s*)?(?:\w+\s+)+\w+\s*\([^)]*\)(?:\s+const)?\s*{/g,
            /(?:\w+\s+)+\w+\s*\([^)]*\)(?:\s+const)?\s*{/g // return_type name(...) const {
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    },
    'cs': {
        functionStart: [
            /(?:public|protected|private|internal|static|virtual|abstract|override|sealed|new|partial|async)?\s+(?:[\w$<>,\s\[\]]+\s+)[\w$]+\s*\([^)]*\)\s*(?:where\s+[\w$]+\s*:\s*[\w$,\s<>]+)?\s*{/g
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    },
    // Indentation-based languages
    'py': {
        functionStart: [
            /def\s+[\w$]+\s*\([^)]*\)(?:\s*->\s*[^:]+)?\s*:/g,
            /class\s+[\w$]+(?:\([^)]*\))?\s*:/g // class Name(BaseClass):
        ],
        bodyStartChar: ':',
        isIndentBased: true
    },
    'rb': {
        functionStart: [
            /def\s+[\w$?!]+(?:\([^)]*\))?\s*(?:$|do)/g,
            /class\s+[\w$]+(?:\s+<\s+[\w$:]+)?/g // class Name or class Name < BaseClass
        ],
        bodyStartChar: 'def',
        bodyEndChar: 'end',
        isIndentBased: true
    },
    // Shell scripts
    'sh': {
        functionStart: [
            /function\s+[\w$-]+\s*(?:\(\))?\s*{/g,
            /[\w$-]+\s*\(\)\s*{/g // name() {
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    }
};
// File extension to language mapping
const FILE_EXTENSIONS = {
    // JavaScript and TypeScript
    '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js',
    '.ts': 'ts', '.tsx': 'ts',
    // Java
    '.java': 'java',
    // C/C++
    '.c': 'c', '.h': 'c',
    '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
    '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp',
    // C#
    '.cs': 'cs',
    // Python
    '.py': 'py', '.pyw': 'py',
    // Ruby
    '.rb': 'rb',
    // Shell
    '.sh': 'sh', '.bash': 'sh', '.zsh': 'sh'
};
/**
 * Process a file in skim mode (strip function bodies)
 */
function processFileInSkimMode(content, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const language = FILE_EXTENSIONS[ext];
    if (!language || !LANGUAGE_CONFIGS[language]) {
        return content; // Unsupported language, return as is
    }
    const config = LANGUAGE_CONFIGS[language];
    if (config.isIndentBased) {
        return processIndentBasedLanguage(content, config);
    }
    else {
        return processBracesBasedLanguage(content, config);
    }
}
/**
 * Process languages that use braces for blocks (C-like)
 */
function processBracesBasedLanguage(content, config) {
    let result = content;
    // For each function pattern
    for (const pattern of config.functionStart) {
        result = result.replace(pattern, (match) => {
            // Keep the function signature (including the opening brace if applicable)
            const openingBraceIndex = match.lastIndexOf(config.bodyStartChar);
            if (openingBraceIndex === -1)
                return match;
            return match.substring(0, openingBraceIndex + 1) + ' /* ... */ }';
        });
    }
    return result;
}
/**
 * Process languages that use indentation for blocks (Python-like)
 */
function processIndentBasedLanguage(content, config) {
    const lines = content.split('\n');
    const resultLines = [];
    let inFunctionBody = false;
    let functionIndent = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        // Count leading spaces to determine indentation level
        const indentMatch = line.match(/^(\s*)/);
        const currentIndent = indentMatch ? indentMatch[1].length : 0;
        // Check if this line starts a function
        let isFunctionStart = false;
        for (const pattern of config.functionStart) {
            if (pattern.test(trimmedLine)) {
                isFunctionStart = true;
                pattern.lastIndex = 0; // Reset regex state
                break;
            }
        }
        if (isFunctionStart) {
            // Always include the function definition line
            resultLines.push(line);
            inFunctionBody = true;
            functionIndent = currentIndent;
            // For Python-like languages, add a placeholder next line
            if (config.isIndentBased && i < lines.length - 1) {
                const nextLine = lines[i + 1];
                const matches = nextLine.match(/^(\s*)/);
                if (matches) {
                    const nextIndent = matches[1].length;
                    if (nextIndent > currentIndent) {
                        // Add a placeholder with proper indentation
                        const indentation = ' '.repeat(nextIndent);
                        resultLines.push(`${indentation}# ...`);
                    }
                }
            }
        }
        else if (inFunctionBody) {
            // Check if we're still in the function body
            if (config.isIndentBased) {
                // For indent-based, we exit the function when the indent level returns to the same or less
                if (currentIndent <= functionIndent && trimmedLine.length > 0) {
                    inFunctionBody = false;
                    resultLines.push(line); // Include this line as it's outside the function
                }
                // Otherwise, still in function body, skip line
            }
            else if (config.bodyEndChar && trimmedLine.includes(config.bodyEndChar)) {
                // For brace-based, we exit when we hit the closing brace
                inFunctionBody = false;
                // We don't add the line because the closing brace was already added
            }
            // Skip lines in the function body
        }
        else {
            // Not in a function body, include the line
            resultLines.push(line);
        }
    }
    return resultLines.join('\n');
}
/**
 * Recursively gets all files in a directory
 */
async function getAllFiles(dirPath) {
    const readdir = (0, util_1.promisify)(fs.readdir);
    const stat = (0, util_1.promisify)(fs.stat);
    const files = [];
    const items = await readdir(dirPath);
    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await stat(itemPath);
        if (stats.isDirectory()) {
            const subFiles = await getAllFiles(itemPath);
            files.push(...subFiles);
        }
        else {
            files.push(itemPath);
        }
    }
    return files;
}
/**
 * Process files for concatenation (regular or skim mode)
 */
async function processFiles(filesToProcess, skimMode = false, asMarkdown = false) {
    // Expand any directories into their files
    let allFiles = [];
    for (const fileUri of filesToProcess) {
        const stats = await fs.promises.stat(fileUri.fsPath);
        if (stats.isDirectory()) {
            // If it's a directory, get all files recursively
            const dirFiles = await getAllFiles(fileUri.fsPath);
            allFiles.push(...dirFiles.map(file => vscode.Uri.file(file)));
        }
        else {
            // It's a regular file
            allFiles.push(fileUri);
        }
    }
    // Read all files
    const fileContents = await Promise.all(allFiles.map(async (fileUri) => {
        try {
            let content = await fs.promises.readFile(fileUri.fsPath, 'utf8');
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
            let relativePath = fileUri.fsPath;
            if (workspaceFolder) {
                relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
            }
            // Apply skim mode processing if enabled
            if (skimMode) {
                content = processFileInSkimMode(content, fileUri.fsPath);
            }
            // Format based on output type (markdown or plain text)
            if (asMarkdown) {
                const ext = path.extname(fileUri.fsPath).toLowerCase().substring(1);
                return `## File: ${relativePath}\n\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
            }
            else {
                return `// ==== File: ${relativePath} ====\n\n${content}\n\n`;
            }
        }
        catch (err) {
            // Skip binary files or files that can't be read as text
            return '';
        }
    }));
    // Combine all contents, filtering out empty strings
    const combinedContent = fileContents.filter(content => content !== '').join('\n');
    // Add header if markdown
    if (asMarkdown) {
        const date = new Date().toISOString().split('T')[0];
        const title = skimMode ? 'Code Summary (Skim Mode)' : 'Code Concatenation';
        return `# ${title}\n\nGenerated on ${date}\n\n${combinedContent}`;
    }
    return combinedContent;
}
/**
 * Show content in a new untitled editor
 */
async function showInEditor(content, filename) {
    try {
        // Create a file name with timestamp (will be used as the tab title)
        const date = new Date();
        const dateString = date.toISOString().split('T')[0];
        const timeString = date.toTimeString().split(' ')[0].replace(/:/g, '-');
        const contextFilename = `${filename}-${dateString}-${timeString}.md`;
        // Create an untitled document with the content directly
        const document = await vscode.workspace.openTextDocument({
            content: content,
            language: 'markdown'
        });
        // Open the document in an editor
        const editor = await vscode.window.showTextDocument(document);
        return editor;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to display content: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
async function activate(context) {
    // Regular concat command
    let concatDisposable = vscode.commands.registerCommand('codecat.concatFiles', async (uri, selectedUris) => {
        // Determine which files to process
        let filesToProcess = [];
        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        }
        else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        }
        else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        }
        else {
            vscode.window.showErrorMessage('No files selected for concatenation');
            return;
        }
        try {
            // Process files in regular mode
            const combinedContent = await processFiles(filesToProcess, false);
            // Copy to clipboard
            await vscode.env.clipboard.writeText(combinedContent);
            // Count non-empty lines for the message
            const fileCount = combinedContent.split('// ==== File:').length - 1;
            vscode.window.showInformationMessage(`Successfully concatenated ${fileCount} file${fileCount > 1 ? 's' : ''} to clipboard`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    // Skim mode concat command
    let skimDisposable = vscode.commands.registerCommand('codecat.skimFiles', async (uri, selectedUris) => {
        // Determine which files to process
        let filesToProcess = [];
        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        }
        else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        }
        else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        }
        else {
            vscode.window.showErrorMessage('No files selected for concatenation');
            return;
        }
        try {
            // Process files in skim mode
            const combinedContent = await processFiles(filesToProcess, true);
            // Copy to clipboard
            await vscode.env.clipboard.writeText(combinedContent);
            // Count non-empty lines for the message
            const fileCount = combinedContent.split('// ==== File:').length - 1;
            vscode.window.showInformationMessage(`Successfully concatenated ${fileCount} file${fileCount > 1 ? 's' : ''} to clipboard (skim mode)`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    // Concat and save command
    let concatSaveDisposable = vscode.commands.registerCommand('codecat.concatFilesAndSave', async (uri, selectedUris) => {
        // Determine which files to process
        let filesToProcess = [];
        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        }
        else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        }
        else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        }
        else {
            vscode.window.showErrorMessage('No files selected for concatenation');
            return;
        }
        try {
            // Process files in regular mode with markdown format
            const combinedContent = await processFiles(filesToProcess, false, true);
            // Unused now but kept for consistency
            const defaultFilename = 'code-concatenation.md';
            // Show in editor
            const editor = await showInEditor(combinedContent, 'context');
            if (editor) {
                // Count non-empty lines for the message
                const fileCount = combinedContent.split('## File:').length - 1;
                vscode.window.showInformationMessage(`Successfully concatenated ${fileCount} file${fileCount > 1 ? 's' : ''} to markdown`);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    // Skim and save command
    let skimSaveDisposable = vscode.commands.registerCommand('codecat.skimFilesAndSave', async (uri, selectedUris) => {
        // Determine which files to process
        let filesToProcess = [];
        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        }
        else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        }
        else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        }
        else {
            vscode.window.showErrorMessage('No files selected for concatenation');
            return;
        }
        try {
            // Process files in skim mode with markdown format
            const combinedContent = await processFiles(filesToProcess, true, true);
            // Unused now but kept for consistency
            const defaultFilename = 'code-summary.md';
            // Show in editor
            const editor = await showInEditor(combinedContent, 'summary');
            if (editor) {
                // Count non-empty lines for the message
                const fileCount = combinedContent.split('## File:').length - 1;
                vscode.window.showInformationMessage(`Successfully summarized ${fileCount} file${fileCount > 1 ? 's' : ''} to markdown`);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    // Code review command
    let reviewDisposable = vscode.commands.registerCommand('codecat.reviewCode', async (uri, selectedUris) => {
        // Determine which files to process
        let filesToProcess = [];
        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        }
        else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        }
        else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        }
        else {
            vscode.window.showErrorMessage('No files selected for review');
            return;
        }
        try {
            // Process files to concatenate them first
            const combinedContent = await processFiles(filesToProcess, false, false);
            // Ask for optional description
            const description = await vscode.window.showInputBox({
                prompt: 'Enter a brief description of the code (optional)',
                placeHolder: 'e.g. This is a VSCode extension for concatenating files'
            });
            // Send to Claude for review
            const reviewResult = await (0, review_1.reviewCode)(combinedContent, description || '');
            if (reviewResult) {
                // Show review in a new untitled editor
                const editor = await (0, review_1.showReview)(reviewResult);
                if (editor) {
                    const itemCount = reviewResult.items.length;
                    vscode.window.showInformationMessage(`Successfully created code review with ${itemCount} feedback item${itemCount !== 1 ? 's' : ''}`);
                }
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to review code: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    // Custom commands management
    const createCommandDisposable = vscode.commands.registerCommand('codecat.createCustomCommand', async () => {
        const success = await (0, customCommands_1.createNewCommandFile)();
        if (success) {
            // Refresh commands automatically after creating new command
            (0, customCommands_1.clearCommandCache)();
            // Re-register commands
            for (const disposable of customCommandDisposables) {
                disposable.dispose();
            }
            customCommandDisposables = await (0, customCommands_1.registerCustomCommands)(context);
            vscode.window.showInformationMessage('Custom command created and commands refreshed');
        }
    });
    const createSampleDisposable = vscode.commands.registerCommand('codecat.createSampleCommand', async () => {
        const created = await (0, customCommands_1.createSampleCommand)();
        if (created) {
            // Refresh commands automatically after creating sample
            (0, customCommands_1.clearCommandCache)();
            // Re-register commands
            for (const disposable of customCommandDisposables) {
                disposable.dispose();
            }
            customCommandDisposables = await (0, customCommands_1.registerCustomCommands)(context);
            vscode.window.showInformationMessage('Sample command "summarize.md" created and commands refreshed');
        }
    });
    const refreshCommandsDisposable = vscode.commands.registerCommand('codecat.refreshCustomCommands', async () => {
        (0, customCommands_1.clearCommandCache)();
        // Re-register commands
        for (const disposable of customCommandDisposables) {
            disposable.dispose();
        }
        customCommandDisposables = await (0, customCommands_1.registerCustomCommands)(context);
        vscode.window.showInformationMessage('Custom commands refreshed');
    });
    // Watch for changes in the .codecat/commands directory
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const commandsPath = path.join(workspaceFolder.uri.fsPath, '.codecat', 'commands');
        try {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, '.codecat/commands/**/*.md'));
            // Watch for file changes
            watcher.onDidChange(async () => {
                (0, customCommands_1.clearCommandCache)();
                for (const disposable of customCommandDisposables) {
                    disposable.dispose();
                }
                customCommandDisposables = await (0, customCommands_1.registerCustomCommands)(context);
            });
            // Watch for new files
            watcher.onDidCreate(async () => {
                (0, customCommands_1.clearCommandCache)();
                for (const disposable of customCommandDisposables) {
                    disposable.dispose();
                }
                customCommandDisposables = await (0, customCommands_1.registerCustomCommands)(context);
            });
            // Watch for deleted files
            watcher.onDidDelete(async () => {
                (0, customCommands_1.clearCommandCache)();
                for (const disposable of customCommandDisposables) {
                    disposable.dispose();
                }
                customCommandDisposables = await (0, customCommands_1.registerCustomCommands)(context);
            });
            context.subscriptions.push(watcher);
        }
        catch (err) {
            // Directory might not exist yet, that's fine
            console.log('Could not set up file watcher:', err);
        }
    }
    context.subscriptions.push(concatDisposable, skimDisposable, concatSaveDisposable, skimSaveDisposable, reviewDisposable, createCommandDisposable, createSampleDisposable, refreshCommandsDisposable);
    // Register custom commands from .codecat/commands directory
    let customCommandDisposables = await (0, customCommands_1.registerCustomCommands)(context);
    // Register a command to show available custom commands
    const showCustomCommandsDisposable = vscode.commands.registerCommand('codecat.showCustomCommands', async (uri, selectedUris) => {
        const commands = await (0, customCommands_1.discoverCustomCommands)();
        if (commands.length === 0) {
            vscode.window.showInformationMessage('No custom commands found. Create one first using "Create Sample Command".');
            return;
        }
        // Show QuickPick with available commands
        const items = commands.map(cmd => ({
            label: cmd.name,
            description: `Run ${cmd.name}`,
            command: cmd
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a custom command to run'
        });
        if (selected) {
            // Run the selected command with the selected files
            let filesToProcess = [];
            if (selectedUris && selectedUris.length > 0) {
                filesToProcess = selectedUris;
            }
            else if (uri) {
                filesToProcess = [uri];
            }
            else if (vscode.window.activeTextEditor) {
                filesToProcess = [vscode.window.activeTextEditor.document.uri];
            }
            else {
                vscode.window.showErrorMessage('No files selected');
                return;
            }
            // Import function we need from customCommands
            const getCodeFromFiles = await Promise.resolve().then(() => __importStar(require('./customCommands'))).then(module => module.getCodeFromFiles);
            const runCustomCommand = await Promise.resolve().then(() => __importStar(require('./customCommands'))).then(module => module.runCustomCommand);
            // Get the code from files
            const code = await getCodeFromFiles(filesToProcess);
            try {
                // Run the command
                const result = await runCustomCommand(code, selected.command);
                if (result) {
                    // Show result in editor
                    const document = await vscode.workspace.openTextDocument({
                        content: result,
                        language: 'markdown'
                    });
                    await vscode.window.showTextDocument(document);
                    vscode.window.showInformationMessage(`Command "${selected.command.name}" completed successfully`);
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to run command: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    });
    context.subscriptions.push(showCustomCommandsDisposable);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map