import * as vscode from 'vscode';
import { PythonExecutor, PackageInfo } from '../utils/pythonExecutor';

export class PackageTreeItem extends vscode.TreeItem {
    constructor(
        public readonly packageInfo: PackageInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(packageInfo.name, collapsibleState);
        
        this.tooltip = `${packageInfo.name} ${packageInfo.version}${packageInfo.description ? `\n${packageInfo.description}` : ''}`;
        this.description = packageInfo.version;
        
        // Set context value for command enablement
        this.contextValue = 'package';
        
        // Show status icon for packages with updates
        if (packageInfo.hasUpdate) {
            this.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('notificationsUpdateIcon.foreground'));
            this.description = `${packageInfo.version} → ${packageInfo.latest}`;
            this.contextValue = 'package-update';
        }
    }
}

export class PipingPackageProvider implements vscode.TreeDataProvider<PackageTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PackageTreeItem | undefined | null | void> = new vscode.EventEmitter<PackageTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PackageTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private _packages: PackageInfo[] = [];
    
    constructor(private pythonExecutor: PythonExecutor) {
        // Refresh when extension is activated
        this.refresh();
    }
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    getTreeItem(element: PackageTreeItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: PackageTreeItem): Promise<PackageTreeItem[]> {
        if (element) {
            // No children for package items
            return [];
        }
        
        try {
            // Fetch packages if not already loaded
            this._packages = await this.pythonExecutor.getInstalledPackages();
            
            // Sort packages: first showing the ones with updates, then alphabetically
            this._packages.sort((a, b) => {
                if (a.hasUpdate && !b.hasUpdate) {
                    return -1;
                }
                if (!a.hasUpdate && b.hasUpdate) {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });
            
            return this._packages.map(pkg => 
                new PackageTreeItem(pkg, vscode.TreeItemCollapsibleState.None)
            );
        } catch (error) {
            console.error('Failed to get packages:', error);
            vscode.window.showErrorMessage('Failed to load Python packages. Make sure Python and pip are installed.');
            return [];
        }
    }
    
    /**
     * Get a package by name
     */
    getPackageByName(name: string): PackageInfo | undefined {
        return this._packages.find(pkg => pkg.name === name);
    }
} 