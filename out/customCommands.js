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
exports.createNewCommandFile = exports.createSampleCommand = exports.ensureCommandsDirectory = exports.getCodeFromFiles = exports.registerCustomCommands = exports.runCustomCommand = exports.clearCommandCache = exports.discoverCustomCommands = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
// Cache for discovered commands
let cachedCommands = null;
/**
 * Get API key for Anthropic
 */
async function getApiKey() {
    // Try to get from configured settings
    let apiKey = vscode.workspace.getConfiguration('codecat').get('anthropicApiKey');
    // If not found, try environment variable
    if (!apiKey) {
        apiKey = process.env.ANTHROPIC_API_KEY;
    }
    // If still not found, ask the user
    if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Anthropic API key for custom commands',
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
                // Store in VS Code settings
                await vscode.workspace.getConfiguration().update('codecat.anthropicApiKey', apiKey, vscode.ConfigurationTarget.Global);
            }
        }
    }
    return apiKey;
}
/**
 * Get custom commands from .codecat/commands directory
 */
async function discoverCustomCommands() {
    // Return cached commands if available
    if (cachedCommands) {
        return cachedCommands;
    }
    const commands = [];
    // Find workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return commands;
    }
    // Check if .codecat/commands directory exists
    const commandsDir = path.join(workspaceFolder.uri.fsPath, '.codecat', 'commands');
    try {
        const stats = await fs.promises.stat(commandsDir);
        if (!stats.isDirectory()) {
            return commands;
        }
        // Read all files in the directory
        const files = await fs.promises.readdir(commandsDir);
        // Process markdown files
        for (const file of files) {
            if (file.endsWith('.md')) {
                const filepath = path.join(commandsDir, file);
                try {
                    const content = await fs.promises.readFile(filepath, 'utf8');
                    // Extract name from the first line (h1) if available
                    let name = path.basename(file, '.md');
                    const h1Match = content.match(/^#\s+(.+)$/m);
                    if (h1Match) {
                        name = h1Match[1].trim();
                    }
                    // Create command ID from filename
                    const id = `codecat.customCommand.${path.basename(file, '.md').replace(/\s+/g, '_').toLowerCase()}`;
                    commands.push({
                        id,
                        name,
                        prompt: content,
                        filepath
                    });
                }
                catch (err) {
                    console.error(`Failed to read command file ${file}:`, err);
                }
            }
        }
        // Cache the commands
        cachedCommands = commands;
    }
    catch (err) {
        // Directory doesn't exist, just return empty array
        console.log('No .codecat/commands directory found:', err);
    }
    return commands;
}
exports.discoverCustomCommands = discoverCustomCommands;
/**
 * Clear the command cache to force rediscovery
 */
function clearCommandCache() {
    cachedCommands = null;
}
exports.clearCommandCache = clearCommandCache;
/**
 * Run a custom command on code
 */
async function runCustomCommand(code, command) {
    try {
        // Get API key
        const apiKey = await getApiKey();
        if (!apiKey) {
            vscode.window.showErrorMessage('API key required for custom commands');
            return null;
        }
        // Create Anthropic client
        const client = new sdk_1.default({
            apiKey
        });
        // Show progress indicator
        const progressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: `Running command "${command.name}"...`,
            cancellable: false
        };
        return await vscode.window.withProgress(progressOptions, async () => {
            // Create the prompt by combining code with custom command
            const userPrompt = `\`\`\`\n${code}\n\`\`\`\n\n${command.prompt}`;
            // Call Anthropic API
            const response = await client.messages.create({
                model: "claude-3-7-sonnet-20250219",
                max_tokens: 4000,
                messages: [{
                        role: "user",
                        content: userPrompt
                    }]
            });
            // Extract text from response
            let result = '';
            if (response.content) {
                for (const part of response.content) {
                    if (part.type === 'text') {
                        result += part.text;
                    }
                }
            }
            return result;
        });
    }
    catch (error) {
        vscode.window.showErrorMessage(`Custom command failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
exports.runCustomCommand = runCustomCommand;
/**
 * Register commands for VS Code and update package.json dynamically
 */
async function registerCustomCommands(context) {
    const disposables = [];
    // Discover commands
    const commands = await discoverCustomCommands();
    // Log discovered commands
    console.log(`Discovered ${commands.length} custom commands:`, commands.map(c => c.name));
    // Register each command
    for (const command of commands) {
        console.log(`Registering command: ${command.id} (${command.name})`);
        // Register the command execution
        const disposable = vscode.commands.registerCommand(command.id, async (uri, selectedUris) => {
            // Use the same file processing logic as other commands
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
            try {
                // Get code from files
                const code = await getCodeFromFiles(filesToProcess);
                // Run the custom command
                const result = await runCustomCommand(code, command);
                if (result) {
                    // Show result in editor
                    const document = await vscode.workspace.openTextDocument({
                        content: result,
                        language: 'markdown'
                    });
                    await vscode.window.showTextDocument(document);
                    vscode.window.showInformationMessage(`Command "${command.name}" completed successfully`);
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to process files: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
        // Add to disposables array
        disposables.push(disposable);
        // Add this command to the subscriptions
        context.subscriptions.push(disposable);
    }
    // Now that all commands are registered, add them to the command palette and menus through a separate mechanism
    // We'll use VS Code's CommandRegistry directly for better integration 
    commands.forEach(command => {
        // Register in Command Registry to make it appear in Command Palette
        // This ensures correct title and category appear in the palette
        try {
            vscode.commands.executeCommand('_setAction', {
                id: command.id,
                title: command.name,
                category: 'CodeCat'
            });
            console.log(`Registered command in palette: ${command.id}`);
        }
        catch (error) {
            console.error(`Failed to register command in palette: ${command.id}`, error);
        }
    });
    return disposables;
}
exports.registerCustomCommands = registerCustomCommands;
/**
 * Helper to get code from files (simplified)
 */
async function getCodeFromFiles(files) {
    const contents = [];
    for (const fileUri of files) {
        try {
            const stats = await fs.promises.stat(fileUri.fsPath);
            if (stats.isDirectory()) {
                // Skip directories for now
                continue;
            }
            const content = await fs.promises.readFile(fileUri.fsPath, 'utf8');
            const relativePath = vscode.workspace.asRelativePath(fileUri);
            contents.push(`// ==== File: ${relativePath} ====\n\n${content}\n\n`);
        }
        catch (err) {
            console.error(`Failed to process file ${fileUri.fsPath}:`, err);
        }
    }
    return contents.join('\n');
}
exports.getCodeFromFiles = getCodeFromFiles;
/**
 * Create the .codecat/commands directory if it doesn't exist
 */
async function ensureCommandsDirectory() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return false;
    }
    const codecatDir = path.join(workspaceFolder.uri.fsPath, '.codecat');
    const commandsDir = path.join(codecatDir, 'commands');
    try {
        // Check if .codecat directory exists
        try {
            await fs.promises.access(codecatDir);
        }
        catch {
            // Create .codecat directory
            await fs.promises.mkdir(codecatDir);
        }
        // Check if commands directory exists
        try {
            await fs.promises.access(commandsDir);
        }
        catch {
            // Create commands directory
            await fs.promises.mkdir(commandsDir);
        }
        return true;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to create .codecat/commands directory: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
exports.ensureCommandsDirectory = ensureCommandsDirectory;
/**
 * Create a sample command file
 */
async function createSampleCommand() {
    const created = await ensureCommandsDirectory();
    if (!created) {
        return false;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const sampleFilePath = path.join(workspaceFolder.uri.fsPath, '.codecat', 'commands', 'summarize.md');
    // Sample command content
    const content = `# Code Summarization

Please analyze the provided code and create a clear, concise summary that includes:

1. The main purpose of the code
2. Key components and their roles
3. Important functions/classes/patterns used
4. Any potential issues or considerations

Focus on the high-level structure and functionality rather than implementation details.
`;
    try {
        // Write sample command
        await fs.promises.writeFile(sampleFilePath, content, 'utf8');
        // Clear command cache
        clearCommandCache();
        return true;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to create sample command: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
exports.createSampleCommand = createSampleCommand;
/**
 * Create a new command file
 */
async function createNewCommandFile() {
    // Ensure directory exists
    const created = await ensureCommandsDirectory();
    if (!created) {
        return false;
    }
    // Ask for command name
    const commandName = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new command',
        placeHolder: 'e.g., Refactor, Optimize, Document...'
    });
    if (!commandName) {
        return false;
    }
    // Create filename from command name
    const filename = commandName.toLowerCase().replace(/\s+/g, '-') + '.md';
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const filePath = path.join(workspaceFolder.uri.fsPath, '.codecat', 'commands', filename);
    // Default content template
    const content = `# ${commandName}

Please analyze the provided code and perform the following:

[Add your custom instructions here]
`;
    try {
        // Write the command file
        await fs.promises.writeFile(filePath, content, 'utf8');
        // Open the file in the editor
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(document);
        // Clear command cache
        clearCommandCache();
        vscode.window.showInformationMessage(`Command "${commandName}" created. Edit the file to customize the prompt.`);
        return true;
    }
    catch (error) {
        vscode.window.showErrorMessage(`Failed to create new command: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
exports.createNewCommandFile = createNewCommandFile;
//# sourceMappingURL=customCommands.js.map