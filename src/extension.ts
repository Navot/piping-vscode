import * as vscode from 'vscode';
import { PipingDashboardPanel } from './panels/dashboardPanel';
import { PipingPackageProvider } from './providers/packageProvider';
import { PipingEnvironmentProvider } from './providers/environmentProvider';
import { PipingCommandManager } from './commands/commandManager';
import { PythonExecutor } from './utils/pythonExecutor';

export async function activate(context: vscode.ExtensionContext) {
    // Initialize Python executor
    const pythonExecutor = new PythonExecutor();
    
    // Initialize tree view data providers
    const packageProvider = new PipingPackageProvider(pythonExecutor);
    const environmentProvider = new PipingEnvironmentProvider(pythonExecutor);

    // Register views
    const packagesView = vscode.window.createTreeView('pipingExplorer', {
        treeDataProvider: packageProvider,
        showCollapseAll: true
    });
    
    const environmentsView = vscode.window.createTreeView('pipingEnvironments', {
        treeDataProvider: environmentProvider,
        showCollapseAll: true
    });

    // Initialize command manager
    const commandManager = new PipingCommandManager(
        context, 
        pythonExecutor,
        packageProvider,
        environmentProvider
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('piping.openDashboard', () => {
            PipingDashboardPanel.createOrShow(context.extensionUri, pythonExecutor);
        }),

        vscode.commands.registerCommand('piping.refreshPackages', () => {
            packageProvider.refresh();
        }),

        vscode.commands.registerCommand('piping.installPackage', async () => {
            await commandManager.installPackage();
        }),

        vscode.commands.registerCommand('piping.uninstallPackage', async (packageItem) => {
            await commandManager.uninstallPackage(packageItem);
        }),

        vscode.commands.registerCommand('piping.updatePackage', async (packageItem) => {
            await commandManager.updatePackage(packageItem);
        }),

        vscode.commands.registerCommand('piping.updateSelectedPackages', async (packageNames: string[]) => {
            await commandManager.updateSelectedPackages(packageNames);
        }),
        
        vscode.commands.registerCommand('piping.updateAllPackages', async () => {
            await commandManager.updateAllPackages();
        }),

        vscode.commands.registerCommand('piping.createEnvironment', async () => {
            await commandManager.createEnvironment();
        }),

        vscode.commands.registerCommand('piping.switchEnvironment', async (envItem) => {
            await commandManager.switchEnvironment(envItem);
        }),

        packagesView,
        environmentsView
    );

    console.log('Piping extension activated!');
}

export function deactivate() {
    // Clean up resources
} 