import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('codecat.concatFiles', async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
        // Determine which files to process
        let filesToProcess: vscode.Uri[] = [];

        if (selectedUris && selectedUris.length > 0) {
            // Case 1: Multiple files selected via Explorer context menu
            filesToProcess = selectedUris;
        } else if (uri) {
            // Case 2: Single file selected via Explorer context menu
            filesToProcess = [uri];
        } else if (vscode.window.activeTextEditor) {
            // Case 3: Command called from command palette (use active file)
            filesToProcess = [vscode.window.activeTextEditor.document.uri];
        } else {
            vscode.window.showErrorMessage('No files selected for concatenation');
            return;
        }

        try {
            // Read all files
            const fileContents = await Promise.all(
                filesToProcess.map(async (fileUri) => {
                    const content = await fs.promises.readFile(fileUri.fsPath, 'utf8');
                    const fileName = path.basename(fileUri.fsPath);
                    return `// ==== File: ${fileName} ====\n\n${content}\n\n`;
                })
            );

            // Combine all contents
            const combinedContent = fileContents.join('\n');

            // Copy to clipboard
            await vscode.env.clipboard.writeText(combinedContent);

            // Show success message
            const fileCount = filesToProcess.length;
            vscode.window.showInformationMessage(
                `Successfully concatenated ${fileCount} file${fileCount > 1 ? 's' : ''} to clipboard`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to concatenate files: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}