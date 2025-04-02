import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';

export interface PackageInfo {
    name: string;
    version: string;
    latest?: string;
    description?: string;
    hasUpdate?: boolean;
}

export interface EnvironmentInfo {
    name: string;
    path: string;
    isActive: boolean;
}

export class PythonExecutor {
    private _currentEnv?: EnvironmentInfo;
    private _outputChannel: vscode.OutputChannel;

    constructor() {
        this._outputChannel = vscode.window.createOutputChannel('Piping');
    }

    get outputChannel(): vscode.OutputChannel {
        return this._outputChannel;
    }

    get currentEnv(): EnvironmentInfo | undefined {
        return this._currentEnv;
    }

    set currentEnv(env: EnvironmentInfo | undefined) {
        this._currentEnv = env;
    }

    /**
     * Execute a command in the specified Python environment
     */
    public async executeCommand(command: string, args: string[], envPath?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            let cmdPath = command;
            let options: cp.SpawnOptions = { shell: true };
            
            // If environment path is specified, use that for the command
            if (envPath) {
                // Adjust path based on OS
                const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
                cmdPath = path.join(envPath, binDir, command);
                
                // Add environment variables if needed
                options.env = { ...process.env };
                
                // For Windows, we need to add .exe
                if (os.platform() === 'win32' && !cmdPath.endsWith('.exe')) {
                    cmdPath += '.exe';
                }
            }

            this._outputChannel.appendLine(`Executing: ${cmdPath} ${args.join(' ')}`);
            
            const proc = cp.spawn(cmdPath, args, options);
            
            let stdout = '';
            let stderr = '';
            
            proc.stdout?.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                this._outputChannel.append(output);
            });
            
            proc.stderr?.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this._outputChannel.append(output);
            });
            
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
                }
            });
            
            proc.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Get list of installed packages in the current environment
     */
    public async getInstalledPackages(): Promise<PackageInfo[]> {
        try {
            // Execute pip list command in JSON format
            const output = await this.executeCommand(
                'pip',
                ['list', '--format=json'],
                this._currentEnv?.path
            );
            
            const packagesData = JSON.parse(output) as Array<{name: string, version: string}>;
            const packages: PackageInfo[] = [];
            
            // Get outdated packages to check for updates
            const outdatedOutput = await this.executeCommand(
                'pip',
                ['list', '--outdated', '--format=json'],
                this._currentEnv?.path
            ).catch(() => '[]');  // If outdated check fails, assume no outdated packages
            
            const outdatedPackages = JSON.parse(outdatedOutput) as Array<{
                name: string,
                version: string,
                latest_version: string
            }>;
            
            // Create a map for faster lookup
            const outdatedMap = new Map<string, string>();
            outdatedPackages.forEach(pkg => {
                outdatedMap.set(pkg.name, pkg.latest_version);
            });
            
            // Combine data
            for (const pkg of packagesData) {
                const latest = outdatedMap.get(pkg.name);
                packages.push({
                    name: pkg.name,
                    version: pkg.version,
                    latest: latest,
                    hasUpdate: !!latest
                });
            }
            
            return packages;
        } catch (error) {
            console.error('Error getting installed packages:', error);
            return [];
        }
    }

    /**
     * Search for packages on PyPI
     */
    public async searchPackages(query: string): Promise<PackageInfo[]> {
        try {
            const output = await this.executeCommand(
                'pip',
                ['search', query, '--format=json'],
                this._currentEnv?.path
            );
            
            // Note: pip search is deprecated, so we handle both possible formats
            let searchResults: any[];
            try {
                searchResults = JSON.parse(output);
            } catch {
                // Handle text output format by parsing manually
                const packages: PackageInfo[] = [];
                const lines = output.split('\n');
                let currentPackage: Partial<PackageInfo> | null = null;
                
                for (const line of lines) {
                    if (line.trim() === '') {
                        if (currentPackage && currentPackage.name && currentPackage.version) {
                            packages.push(currentPackage as PackageInfo);
                        }
                        currentPackage = null;
                        continue;
                    }
                    
                    if (line.includes(' - ')) {
                        if (currentPackage && currentPackage.name && currentPackage.version) {
                            packages.push(currentPackage as PackageInfo);
                        }
                        
                        const [nameVersion, description] = line.split(' - ');
                        const [name, version] = nameVersion.trim().split(' ');
                        
                        currentPackage = {
                            name: name.trim(),
                            version: version ? version.replace(/[()]/g, '') : '',
                            description: description ? description.trim() : ''
                        };
                    } else if (currentPackage) {
                        currentPackage.description = (currentPackage.description || '') + ' ' + line.trim();
                    }
                }
                
                if (currentPackage && currentPackage.name && currentPackage.version) {
                    packages.push(currentPackage as PackageInfo);
                }
                
                return packages;
            }
            
            return searchResults.map(result => ({
                name: result.name,
                version: result.version,
                description: result.summary
            }));
        } catch (error) {
            console.error('Error searching packages:', error);
            vscode.window.showErrorMessage('Package search failed. pip search is deprecated, consider using alternative search methods.');
            return [];
        }
    }

    /**
     * Install a package
     */
    public async installPackage(packageName: string, version?: string): Promise<boolean> {
        try {
            const packageSpec = version ? `${packageName}==${version}` : packageName;
            await this.executeCommand(
                'pip',
                ['install', packageSpec],
                this._currentEnv?.path
            );
            return true;
        } catch (error) {
            console.error('Error installing package:', error);
            return false;
        }
    }

    /**
     * Uninstall a package
     */
    public async uninstallPackage(packageName: string): Promise<boolean> {
        try {
            await this.executeCommand(
                'pip',
                ['uninstall', '-y', packageName],
                this._currentEnv?.path
            );
            return true;
        } catch (error) {
            console.error('Error uninstalling package:', error);
            return false;
        }
    }

    /**
     * Update a package
     */
    public async updatePackage(packageName: string): Promise<boolean> {
        try {
            await this.executeCommand(
                'pip',
                ['install', '--upgrade', packageName],
                this._currentEnv?.path
            );
            return true;
        } catch (error) {
            console.error('Error updating package:', error);
            return false;
        }
    }

    /**
     * Get list of available virtual environments
     */
    public async getVirtualEnvironments(): Promise<EnvironmentInfo[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }
        
        const environments: EnvironmentInfo[] = [];
        
        // Look for common virtual environment patterns in workspace
        for (const folder of workspaceFolders) {
            // Common venv locations
            const venvLocations = [
                { name: 'venv', path: path.join(folder.uri.fsPath, 'venv') },
                { name: 'env', path: path.join(folder.uri.fsPath, 'env') },
                { name: '.venv', path: path.join(folder.uri.fsPath, '.venv') }
            ];
            
            for (const venv of venvLocations) {
                try {
                    const pythonPath = path.join(
                        venv.path, 
                        os.platform() === 'win32' ? 'Scripts\\python.exe' : 'bin/python'
                    );
                    
                    // Check if python executable exists
                    await vscode.workspace.fs.stat(vscode.Uri.file(pythonPath));
                    
                    environments.push({
                        name: venv.name,
                        path: venv.path,
                        isActive: this._currentEnv?.path === venv.path
                    });
                } catch {
                    // Virtual environment not found, continue
                }
            }
        }
        
        return environments;
    }

    /**
     * Create a new virtual environment
     */
    public async createVirtualEnvironment(name: string): Promise<EnvironmentInfo | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return undefined;
        }
        
        const workspacePath = workspaceFolders[0].uri.fsPath;
        const venvPath = path.join(workspacePath, name);
        
        try {
            await this.executeCommand('python', ['-m', 'venv', venvPath]);
            
            const newEnv: EnvironmentInfo = {
                name,
                path: venvPath,
                isActive: false
            };
            
            return newEnv;
        } catch (error) {
            console.error('Error creating virtual environment:', error);
            return undefined;
        }
    }
} 