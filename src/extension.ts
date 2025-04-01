import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as minimatch from 'minimatch';
import { reviewCode, showReview } from './review';
import { registerCustomCommands, createSampleCommand, createNewCommandFile, clearCommandCache, discoverCustomCommands } from './customCommands';

// Language-specific function body patterns
interface LanguageConfig {
    functionStart: RegExp[];  // Patterns that indicate the start of a function
    bodyStartChar: string;    // Character that starts the function body (e.g., '{' for C-like)
    bodyEndChar?: string;     // Character that ends the function body (e.g., '}' for C-like)
    isIndentBased?: boolean;  // If true, uses indentation rather than braces (e.g., Python)
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
    // C-like languages (JavaScript, TypeScript, Java, C#, C++, etc.)
    'js': {
        functionStart: [
            /function\s+[\w$]+\s*\([^)]*\)\s*{/g,                   // function name(...) {
            /[\w$]+\s*=\s*function\s*\([^)]*\)\s*{/g,              // name = function(...) {
            /[\w$]+\s*:\s*function\s*\([^)]*\)\s*{/g,              // name: function(...) {
            /(?:async\s+)?(?:[\w$]+|\[[\w$]+\])\s*\([^)]*\)\s*=>\s*{/g, // name(...) => {
            /(?:class|interface)\s+[\w$]+(?:\s+extends\s+[\w$]+)?(?:\s+implements\s+[\w$]+(?:\s*,\s*[\w$]+)*)?\s*{/g, // class/interface
            /(?:get|set)\s+[\w$]+\s*\(\)\s*{/g,                    // getters/setters
            /[\w$]+\s*\([^)]*\)\s*{/g                              // method() {
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    },
    'ts': {
        functionStart: [
            /function\s+[\w$]+\s*(?:<[^>]*>)?\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*{/g, // function name<T>(...): ReturnType {
            /[\w$]+\s*=\s*function\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*{/g,           // name = function(...): ReturnType {
            /[\w$]+\s*:\s*function\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*{/g,           // name: function(...): ReturnType {
            /(?:async\s+)?(?:[\w$]+|\[[\w$]+\])\s*(?:<[^>]*>)?\s*\([^)]*\)(?:\s*:\s*[^{=]+)?\s*=>\s*{/g, // name<T>(...): ReturnType => {
            /(?:class|interface)\s+[\w$]+(?:\s+extends\s+[\w$]+)?(?:\s+implements\s+[\w$]+(?:\s*,\s*[\w$]+)*)?\s*{/g, // class/interface
            /(?:get|set)\s+[\w$]+\s*\(\)(?:\s*:\s*[^{]+)?\s*{/g,                 // getters/setters
            /[\w$]+\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*{/g                           // method(...): ReturnType {
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
            /(?:\w+\s+)+\w+\s*\([^)]*\)\s*{/g  // return_type name(...) {
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    },
    'cpp': {
        functionStart: [
            /(?:\w+::\s*)?(?:\w+\s+)+\w+\s*\([^)]*\)(?:\s+const)?\s*{/g,  // Class::return_type name(...) const {
            /(?:\w+\s+)+\w+\s*\([^)]*\)(?:\s+const)?\s*{/g               // return_type name(...) const {
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
            /def\s+[\w$]+\s*\([^)]*\)(?:\s*->\s*[^:]+)?\s*:/g,  // def name(...) -> ReturnType:
            /class\s+[\w$]+(?:\([^)]*\))?\s*:/g                 // class Name(BaseClass):
        ],
        bodyStartChar: ':',
        isIndentBased: true
    },
    'rb': {
        functionStart: [
            /def\s+[\w$?!]+(?:\([^)]*\))?\s*(?:$|do)/g,  // def name(...) or def name(...)
            /class\s+[\w$]+(?:\s+<\s+[\w$:]+)?/g         // class Name or class Name < BaseClass
        ],
        bodyStartChar: 'def',
        bodyEndChar: 'end',
        isIndentBased: true
    },
    // Shell scripts
    'sh': {
        functionStart: [
            /function\s+[\w$-]+\s*(?:\(\))?\s*{/g,  // function name() {
            /[\w$-]+\s*\(\)\s*{/g                   // name() {
        ],
        bodyStartChar: '{',
        bodyEndChar: '}'
    }
};

// File extension to language mapping
const FILE_EXTENSIONS: Record<string, string> = {
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
function processFileInSkimMode(content: string, filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const language = FILE_EXTENSIONS[ext];

    if (!language || !LANGUAGE_CONFIGS[language]) {
        return content; // Unsupported language, return as is
    }

    const config = LANGUAGE_CONFIGS[language];

    if (config.isIndentBased) {
        return processIndentBasedLanguage(content, config);
    } else {
        return processBracesBasedLanguage(content, config);
    }
}

/**
 * Process languages that use braces for blocks (C-like)
 */
function processBracesBasedLanguage(content: string, config: LanguageConfig): string {
    let result = content;

    // For each function pattern
    for (const pattern of config.functionStart) {
        result = result.replace(pattern, (match) => {
            // Keep the function signature (including the opening brace if applicable)
            const openingBraceIndex = match.lastIndexOf(config.bodyStartChar);
            if (openingBraceIndex === -1) return match;

            return match.substring(0, openingBraceIndex + 1) + ' /* ... */ }';
        });
    }

    return result;
}

/**
 * Process languages that use indentation for blocks (Python-like)
 */
function processIndentBasedLanguage(content: string, config: LanguageConfig): string {
    const lines = content.split('\n');
    const resultLines: string[] = [];
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
                const matches = nextLine.match(/^(\s*)/)
                if (matches) {
                    const nextIndent = matches[1].length;

                    if (nextIndent > currentIndent) {
                        // Add a placeholder with proper indentation
                        const indentation = ' '.repeat(nextIndent);
                        resultLines.push(`${indentation}# ...`);
                    }
                }
            }
        } else if (inFunctionBody) {
            // Check if we're still in the function body
            if (config.isIndentBased) {
                // For indent-based, we exit the function when the indent level returns to the same or less
                if (currentIndent <= functionIndent && trimmedLine.length > 0) {
                    inFunctionBody = false;
                    resultLines.push(line); // Include this line as it's outside the function
                }
                // Otherwise, still in function body, skip line
            } else if (config.bodyEndChar && trimmedLine.includes(config.bodyEndChar)) {
                // For brace-based, we exit when we hit the closing brace
                inFunctionBody = false;
                // We don't add the line because the closing brace was already added
            }
            // Skip lines in the function body
        } else {
            // Not in a function body, include the line
            resultLines.push(line);
        }
    }

    return resultLines.join('\n');
}

/**
 * Recursively gets all files in a directory
 */
async function getAllFiles(dirPath: string): Promise<string[]> {
    const readdir = promisify(fs.readdir);
    const stat = promisify(fs.stat);
    const files: string[] = [];

    const items = await readdir(dirPath);

    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await stat(itemPath);

        if (stats.isDirectory()) {
            const subFiles = await getAllFiles(itemPath);
            files.push(...subFiles);
        } else {
            files.push(itemPath);
        }
    }

    return files;
}

/**
 * Loads gitignore patterns from a directory and adds default system patterns
 */
async function loadGitignorePatterns(rootPath: string): Promise<string[]> {
    // Default patterns to exclude common system folders and files
    const defaultPatterns = [
        '.git/**',
        '.git/',
        '.vscode/**',
        '.vscode/',
        '.hg/**',
        '.hg/',
        '.svn/**',
        '.svn/',
        '.DS_Store',
        'Thumbs.db',
        'desktop.ini',
        '.idea/**',
        '.idea/'
    ];
    
    // Load .gitignore patterns if they exist
    const gitignorePath = path.join(rootPath, '.gitignore');
    let gitignorePatterns: string[] = [];
    
    try {
        if (fs.existsSync(gitignorePath)) {
            const content = await fs.promises.readFile(gitignorePath, 'utf8');
            // Return all non-empty, non-comment lines
            gitignorePatterns = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
        }
    } catch (error) {
        // Ignore errors reading gitignore
        console.log('Error reading .gitignore:', error);
    }
    
    // Combine default patterns with .gitignore patterns
    return [...defaultPatterns, ...gitignorePatterns];
}

/**
 * Generates a tree structure of a directory
 */
async function generateTreeStructure(
    dirPath: string, 
    basePath: string, 
    prefix: string = '', 
    maxDepth: number = 10, 
    currentDepth: number = 0,
    ignorePatterns: string[] = []
): Promise<string> {
    if (currentDepth >= maxDepth) {
        return `${prefix}...\n`;
    }

    const readdir = promisify(fs.readdir);
    const stat = promisify(fs.stat);
    let result = '';

    try {
        const items = await readdir(dirPath);
        
        // Create a function to check if a path should be ignored
        const shouldIgnore = (itemPath: string): boolean => {
            const relativePath = path.relative(basePath, itemPath);
            
            for (const pattern of ignorePatterns) {
                // Handle directory-specific patterns (ending with /)
                if (pattern.endsWith('/') && fs.statSync(itemPath).isDirectory()) {
                    const dirPattern = pattern.slice(0, -1);
                    if (minimatch.minimatch(relativePath, dirPattern) || 
                        minimatch.minimatch(relativePath, `${dirPattern}/**`)) {
                        return true;
                    }
                }
                
                // Handle basic patterns
                if (minimatch.minimatch(relativePath, pattern) || 
                    minimatch.minimatch(relativePath, `${pattern}/**`)) {
                    return true;
                }
                
                // Handle negation patterns (patterns that start with !)
                if (pattern.startsWith('!') && 
                    minimatch.minimatch(relativePath, pattern.substring(1))) {
                    return false;
                }
            }
            
            return false;
        };
        
        const filteredItems = items.filter(item => {
            const itemPath = path.join(dirPath, item);
            return !shouldIgnore(itemPath);
        });
        
        const sortedItems = filteredItems.sort((a, b) => {
            // Directories first, then files
            const aPath = path.join(dirPath, a);
            const bPath = path.join(dirPath, b);
            
            try {
                const aIsDir = fs.statSync(aPath).isDirectory();
                const bIsDir = fs.statSync(bPath).isDirectory();
                
                if (aIsDir && !bIsDir) return -1;
                if (!aIsDir && bIsDir) return 1;
                return a.localeCompare(b);
            } catch (error) {
                return 0;
            }
        });

        for (let i = 0; i < sortedItems.length; i++) {
            const item = sortedItems[i];
            const itemPath = path.join(dirPath, item);
            
            try {
                const stats = await stat(itemPath);
                const isLast = i === sortedItems.length - 1;
                const itemPrefix = isLast ? '└── ' : '├── ';
                const nextPrefix = isLast ? '    ' : '│   ';

                result += `${prefix}${itemPrefix}${item}\n`;

                if (stats.isDirectory()) {
                    result += await generateTreeStructure(
                        itemPath, 
                        basePath, 
                        prefix + nextPrefix, 
                        maxDepth, 
                        currentDepth + 1,
                        ignorePatterns
                    );
                }
            } catch (error) {
                // Skip files that can't be accessed
                continue;
            }
        }
    } catch (error) {
        result += `${prefix}Error reading directory: ${error instanceof Error ? error.message : String(error)}\n`;
    }

    return result;
}

/**
 * Process files for concatenation (regular or skim mode)
 */
async function processFiles(filesToProcess: vscode.Uri[], skimMode: boolean = false, asMarkdown: boolean = false): Promise<string> {
    // Expand any directories into their files
    let allFiles: vscode.Uri[] = [];

    for (const fileUri of filesToProcess) {
        const stats = await fs.promises.stat(fileUri.fsPath);

        if (stats.isDirectory()) {
            // If it's a directory, get all files recursively
            const dirFiles = await getAllFiles(fileUri.fsPath);
            allFiles.push(...dirFiles.map(file => vscode.Uri.file(file)));
        } else {
            // It's a regular file
            allFiles.push(fileUri);
        }
    }

    // Read all files
    const fileContents = await Promise.all(
        allFiles.map(async (fileUri) => {
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
                } else {
                    return `// ==== File: ${relativePath} ====\n\n${content}\n\n`;
                }
            } catch (err) {
                // Skip binary files or files that can't be read as text
                return '';
            }
        })
    );

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
async function showInEditor(content: string, filename: string): Promise<vscode.TextEditor | null> {
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
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to display content: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    // Tree structure command
    let treeDisposable = vscode.commands.registerCommand('codecat.generateTree', async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // We only support tree generation from a single directory
        let directoryPath: string | null = null;

        if (uri) {
            // Case 1: Single folder selected via Explorer context menu
            try {
                const stats = await fs.promises.stat(uri.fsPath);
                if (stats.isDirectory()) {
                    directoryPath = uri.fsPath;
                } else {
                    // If a file is selected, use its parent directory
                    directoryPath = path.dirname(uri.fsPath);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to access path: ${error instanceof Error ? error.message : String(error)}`);
                return;
            }
        } else {
            vscode.window.showErrorMessage('No directory selected for tree generation');
            return;
        }

        try {
            // Generate the tree structure
            const basePath = directoryPath;
            const folderName = path.basename(directoryPath);
            
            // Load gitignore patterns if they exist
            const gitignorePatterns = await loadGitignorePatterns(basePath);
            
            // Start with the root folder name
            let treeContent = `${folderName}\n`;
            
            // Note that we're filtering system files and gitignore patterns
            treeContent += `├── (system files and .gitignore patterns excluded)\n`;
            
            // Generate tree with filtered patterns
            treeContent += await generateTreeStructure(directoryPath, basePath, '', 10, 0, gitignorePatterns);

            // Copy to clipboard
            await vscode.env.clipboard.writeText(treeContent);

            vscode.window.showInformationMessage(
                `Successfully generated tree structure to clipboard (system files excluded)`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate tree: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Regular concat command
    let concatDisposable = vscode.commands.registerCommand('codecat.concatFiles', async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // Determine which files to process
        let filesToProcess: vscode.Uri[] = [];

        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        } else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        } else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        } else {
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
            vscode.window.showInformationMessage(
                `Successfully concatenated ${fileCount} file${fileCount > 1 ? 's' : ''} to clipboard`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Skim mode concat command
    let skimDisposable = vscode.commands.registerCommand('codecat.skimFiles', async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // Determine which files to process
        let filesToProcess: vscode.Uri[] = [];

        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        } else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        } else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        } else {
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
            vscode.window.showInformationMessage(
                `Successfully concatenated ${fileCount} file${fileCount > 1 ? 's' : ''} to clipboard (skim mode)`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Concat and save command
    let concatSaveDisposable = vscode.commands.registerCommand('codecat.concatFilesAndSave', async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // Determine which files to process
        let filesToProcess: vscode.Uri[] = [];

        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        } else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        } else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        } else {
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
                vscode.window.showInformationMessage(
                    `Successfully concatenated ${fileCount} file${fileCount > 1 ? 's' : ''} to markdown`
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    
    // Skim and save command
    let skimSaveDisposable = vscode.commands.registerCommand('codecat.skimFilesAndSave', async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // Determine which files to process
        let filesToProcess: vscode.Uri[] = [];

        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        } else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        } else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        } else {
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
                vscode.window.showInformationMessage(
                    `Successfully summarized ${fileCount} file${fileCount > 1 ? 's' : ''} to markdown`
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Code review command
    let reviewDisposable = vscode.commands.registerCommand('codecat.reviewCode', async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // Determine which files to process
        let filesToProcess: vscode.Uri[] = [];

        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        } else if (uri) {
            // Case 2: Single file/folder selected via Explorer context menu
            filesToProcess = [uri];
        } else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        } else {
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
            const reviewResult = await reviewCode(combinedContent, description || '');
            
            if (reviewResult) {
                // Show review in a new untitled editor
                const editor = await showReview(reviewResult);
                if (editor) {
                    const itemCount = reviewResult.items.length;
                    vscode.window.showInformationMessage(
                        `Successfully created code review with ${itemCount} feedback item${itemCount !== 1 ? 's' : ''}`
                    );
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to review code: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Custom commands management
    const createCommandDisposable = vscode.commands.registerCommand('codecat.createCustomCommand', async () => {
        const success = await createNewCommandFile();
        if (success) {
            // Refresh commands automatically after creating new command
            clearCommandCache();
            
            // Re-register commands
            for (const disposable of customCommandDisposables) {
                disposable.dispose();
            }
            
            customCommandDisposables = await registerCustomCommands(context);
            
            vscode.window.showInformationMessage('Custom command created and commands refreshed');
        }
    });
    
    const createSampleDisposable = vscode.commands.registerCommand('codecat.createSampleCommand', async () => {
        const created = await createSampleCommand();
        if (created) {
            // Refresh commands automatically after creating sample
            clearCommandCache();
            
            // Re-register commands
            for (const disposable of customCommandDisposables) {
                disposable.dispose();
            }
            
            customCommandDisposables = await registerCustomCommands(context);
            
            vscode.window.showInformationMessage('Sample command "summarize.md" created and commands refreshed');
        }
    });
    
    const refreshCommandsDisposable = vscode.commands.registerCommand('codecat.refreshCustomCommands', async () => {
        clearCommandCache();
        
        // Re-register commands
        for (const disposable of customCommandDisposables) {
            disposable.dispose();
        }
        
        customCommandDisposables = await registerCustomCommands(context);
        
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
                clearCommandCache();
                for (const disposable of customCommandDisposables) {
                    disposable.dispose();
                }
                customCommandDisposables = await registerCustomCommands(context);
            });
            
            // Watch for new files
            watcher.onDidCreate(async () => {
                clearCommandCache();
                for (const disposable of customCommandDisposables) {
                    disposable.dispose();
                }
                customCommandDisposables = await registerCustomCommands(context);
            });
            
            // Watch for deleted files
            watcher.onDidDelete(async () => {
                clearCommandCache();
                for (const disposable of customCommandDisposables) {
                    disposable.dispose();
                }
                customCommandDisposables = await registerCustomCommands(context);
            });
            
            context.subscriptions.push(watcher);
        } catch (err) {
            // Directory might not exist yet, that's fine
            console.log('Could not set up file watcher:', err);
        }
    }
    
    context.subscriptions.push(
        treeDisposable,
        concatDisposable, 
        skimDisposable, 
        concatSaveDisposable, 
        skimSaveDisposable, 
        reviewDisposable,
        createCommandDisposable,
        createSampleDisposable,
        refreshCommandsDisposable
    );
    
    // Register custom commands from .codecat/commands directory
    let customCommandDisposables = await registerCustomCommands(context);
    
    // Register a command to show available custom commands
    const showCustomCommandsDisposable = vscode.commands.registerCommand('codecat.showCustomCommands', async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        const commands = await discoverCustomCommands();
        
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
            let filesToProcess: vscode.Uri[] = [];
            
            if (selectedUris && selectedUris.length > 0) {
                filesToProcess = selectedUris;
            } else if (uri) {
                filesToProcess = [uri];
            } else if (vscode.window.activeTextEditor) {
                filesToProcess = [vscode.window.activeTextEditor.document.uri];
            } else {
                vscode.window.showErrorMessage('No files selected');
                return;
            }
            
            // Import function we need from customCommands
            const getCodeFromFiles = await import('./customCommands').then(module => module.getCodeFromFiles);
            const runCustomCommand = await import('./customCommands').then(module => module.runCustomCommand);
            
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
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to run command: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    });
    
    context.subscriptions.push(showCustomCommandsDisposable);
}

export function deactivate() { }