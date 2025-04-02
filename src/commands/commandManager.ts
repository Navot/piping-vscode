import * as vscode from 'vscode';
import { PythonExecutor } from '../utils/pythonExecutor';
import { PipingPackageProvider, PackageTreeItem } from '../providers/packageProvider';
import { PipingEnvironmentProvider, EnvironmentTreeItem } from '../providers/environmentProvider';

export class PipingCommandManager {
    constructor(
        private context: vscode.ExtensionContext,
        private pythonExecutor: PythonExecutor,
        private packageProvider: PipingPackageProvider,
        private environmentProvider: PipingEnvironmentProvider
    ) {}

    /**
     * Install a Python package
     */
    public async installPackage(): Promise<void> {
        const packageName = await vscode.window.showInputBox({
            placeHolder: 'Enter package name (e.g., requests==2.28.1 or just requests)',
            prompt: 'Specify a package name and optionally a version'
        });

        if (!packageName) {
            return;
        }

        // Show progress notification
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Installing ${packageName}...`,
            cancellable: false
        }, async () => {
            let packageNameOnly = packageName;
            let version: string | undefined;

            // Check if version is specified
            if (packageName.includes('==')) {
                const parts = packageName.split('==');
                packageNameOnly = parts[0];
                version = parts[1];
            }

            try {
                // Install the package
                const success = await this.pythonExecutor.installPackage(packageNameOnly, version);
                
                if (success) {
                    vscode.window.showInformationMessage(`Successfully installed ${packageName}`);
                    // Refresh the package list
                    this.packageProvider.refresh();
                } else {
                    vscode.window.showErrorMessage(`Failed to install ${packageName}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error installing ${packageName}: ${error}`);
            }
        });
    }

    /**
     * Uninstall a Python package
     */
    public async uninstallPackage(packageItem?: PackageTreeItem): Promise<void> {
        // If no package item is provided, ask the user to select one
        if (!packageItem) {
            const packageName = await vscode.window.showInputBox({
                placeHolder: 'Enter package name to uninstall',
                prompt: 'Specify a package name to uninstall'
            });

            if (!packageName) {
                return;
            }

            // Find the package in our list
            const pkg = this.packageProvider.getPackageByName(packageName);
            if (!pkg) {
                vscode.window.showWarningMessage(`Package ${packageName} not found in current environment`);
                return;
            }
        }

        const packageName = packageItem ? packageItem.packageInfo.name : '';
        
        // Confirm with the user
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to uninstall ${packageName}?`,
            { modal: true },
            'Yes',
            'No'
        );

        if (confirmation !== 'Yes') {
            return;
        }

        // Show progress notification
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Uninstalling ${packageName}...`,
            cancellable: false
        }, async () => {
            try {
                // Uninstall the package
                const success = await this.pythonExecutor.uninstallPackage(packageName);
                
                if (success) {
                    vscode.window.showInformationMessage(`Successfully uninstalled ${packageName}`);
                    // Refresh the package list
                    this.packageProvider.refresh();
                } else {
                    vscode.window.showErrorMessage(`Failed to uninstall ${packageName}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error uninstalling ${packageName}: ${error}`);
            }
        });
    }

    /**
     * Update a Python package
     */
    public async updatePackage(packageItem?: PackageTreeItem): Promise<void> {
        // If no package item is provided, ask the user to select one
        if (!packageItem) {
            const packageName = await vscode.window.showInputBox({
                placeHolder: 'Enter package name to update',
                prompt: 'Specify a package name to update'
            });

            if (!packageName) {
                return;
            }

            // Find the package in our list
            const pkg = this.packageProvider.getPackageByName(packageName);
            if (!pkg) {
                vscode.window.showWarningMessage(`Package ${packageName} not found in current environment`);
                return;
            }
        }

        const packageName = packageItem ? packageItem.packageInfo.name : '';
        
        // Show progress notification
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Updating ${packageName}...`,
            cancellable: false
        }, async () => {
            try {
                // Update the package
                const success = await this.pythonExecutor.updatePackage(packageName);
                
                if (success) {
                    vscode.window.showInformationMessage(`Successfully updated ${packageName}`);
                    // Refresh the package list
                    this.packageProvider.refresh();
                } else {
                    vscode.window.showErrorMessage(`Failed to update ${packageName}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error updating ${packageName}: ${error}`);
            }
        });
    }

    /**
     * Create a new virtual environment
     */
    public async createEnvironment(): Promise<void> {
        const envName = await vscode.window.showInputBox({
            placeHolder: 'venv (default)',
            prompt: 'Enter virtual environment name',
            value: 'venv'
        });

        if (!envName) {
            return;
        }

        // Show progress notification
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating virtual environment '${envName}'...`,
            cancellable: false
        }, async () => {
            try {
                // Create the environment
                const newEnv = await this.pythonExecutor.createVirtualEnvironment(envName);
                
                if (newEnv) {
                    vscode.window.showInformationMessage(`Successfully created virtual environment '${envName}'`);
                    // Refresh the environment list
                    this.environmentProvider.refresh();
                    
                    // Ask if the user wants to switch to the new environment
                    const switchConfirmation = await vscode.window.showInformationMessage(
                        `Do you want to switch to the new '${envName}' environment?`,
                        'Yes',
                        'No'
                    );
                    
                    if (switchConfirmation === 'Yes') {
                        this.environmentProvider.setActiveEnvironment(envName);
                        this.packageProvider.refresh();
                    }
                } else {
                    vscode.window.showErrorMessage(`Failed to create virtual environment '${envName}'`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error creating virtual environment: ${error}`);
            }
        });
    }

    /**
     * Switch the active virtual environment
     */
    public async switchEnvironment(envItem?: EnvironmentTreeItem): Promise<void> {
        // If already active, do nothing
        if (envItem && envItem.envInfo.isActive) {
            vscode.window.showInformationMessage(`Environment '${envItem.envInfo.name}' is already active`);
            return;
        }
        
        const envName = envItem ? envItem.envInfo.name : '';
        
        // Set the active environment
        this.environmentProvider.setActiveEnvironment(envName);
        
        // Refresh the package list for the new environment
        this.packageProvider.refresh();
        
        vscode.window.showInformationMessage(`Switched to environment '${envName}'`);
    }
} 