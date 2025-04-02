import * as vscode from 'vscode';
import * as path from 'path';
import { PythonExecutor, EnvironmentInfo } from '../utils/pythonExecutor';

export class EnvironmentTreeItem extends vscode.TreeItem {
    constructor(
        public readonly envInfo: EnvironmentInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(envInfo.name, collapsibleState);
        
        this.tooltip = `${envInfo.name}\n${envInfo.path}`;
        this.description = path.basename(envInfo.path);
        
        // Set context value for command enablement
        this.contextValue = 'environment';
        
        // Show active environment with different icon
        if (envInfo.isActive) {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('terminal.ansiGreen'));
            this.contextValue = 'environment-active';
            this.description = `${path.basename(envInfo.path)} (active)`;
        } else {
            this.iconPath = new vscode.ThemeIcon('server-environment');
        }
    }
}

export class PipingEnvironmentProvider implements vscode.TreeDataProvider<EnvironmentTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<EnvironmentTreeItem | undefined | null | void> = new vscode.EventEmitter<EnvironmentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<EnvironmentTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private _environments: EnvironmentInfo[] = [];
    
    constructor(private pythonExecutor: PythonExecutor) {
        // Refresh when extension is activated
        this.refresh();
    }
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    getTreeItem(element: EnvironmentTreeItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: EnvironmentTreeItem): Promise<EnvironmentTreeItem[]> {
        if (element) {
            // No children for environment items
            return [];
        }
        
        try {
            // Fetch environments
            this._environments = await this.pythonExecutor.getVirtualEnvironments();
            
            // Sort environments: first showing the active one, then alphabetically
            this._environments.sort((a, b) => {
                if (a.isActive && !b.isActive) {
                    return -1;
                }
                if (!a.isActive && b.isActive) {
                    return 1;
                }
                return a.name.localeCompare(b.name);
            });
            
            // Create tree items
            return this._environments.map(env => 
                new EnvironmentTreeItem(env, vscode.TreeItemCollapsibleState.None)
            );
        } catch (error) {
            console.error('Failed to get environments:', error);
            return [];
        }
    }
    
    /**
     * Get an environment by name
     */
    getEnvironmentByName(name: string): EnvironmentInfo | undefined {
        return this._environments.find(env => env.name === name);
    }
    
    /**
     * Set the active environment
     */
    setActiveEnvironment(envName: string): void {
        // First, set all environments as inactive
        this._environments.forEach(env => {
            env.isActive = false;
        });
        
        // Then, set the specified environment as active
        const env = this._environments.find(e => e.name === envName);
        if (env) {
            env.isActive = true;
            this.pythonExecutor.currentEnv = env;
        }
        
        // Refresh the tree view
        this.refresh();
    }
} 