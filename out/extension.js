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
function activate(context) {
    let disposable = vscode.commands.registerCommand('codecat.concatFiles', async (uri, selectedUris) => {
        // Determine which files to process
        let filesToProcess = [];
        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        }
        else if (uri) {
            // Case 2: Single file selected via Explorer context menu
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
            // Read all files
            const fileContents = await Promise.all(filesToProcess.map(async (fileUri) => {
                const content = await fs.promises.readFile(fileUri.fsPath, 'utf8');
                const fileName = path.basename(fileUri.fsPath);
                return `// ==== File: ${fileName} ====\n\n${content}\n\n`;
            }));
            // Combine all contents
            const combinedContent = fileContents.join('\n');
            // Copy to clipboard
            await vscode.env.clipboard.writeText(combinedContent);
            // Show success message
            const fileCount = filesToProcess.length;
            vscode.window.showInformationMessage(`Successfully concatenated ${fileCount} file${fileCount > 1 ? 's' : ''} to clipboard`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map