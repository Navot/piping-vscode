import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

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
     * Get the Python paths from settings or PATH
     */
    public async getPythonPath(): Promise<string> {
        // First try to get from VS Code Python extension
        try {
            const pythonExtension = vscode.extensions.getExtension('ms-python.python');
            if (pythonExtension) {
                const pythonPath = vscode.workspace.getConfiguration('python').get<string>('defaultInterpreterPath');
                if (pythonPath) {
                    // Test if this path works
                    const result = await this.testPythonPath(pythonPath);
                    if (result) {
                        return pythonPath;
                    }
                }
            }
        } catch (error) {
            this._outputChannel.appendLine(`Error getting Python path from VS Code extension: ${error}`);
        }

        // Try to find Python in PATH
        const pythonCommands = os.platform() === 'win32' 
            ? ['python.exe', 'python3.exe', 'py.exe'] 
            : ['python3', 'python'];
            
        for (const cmd of pythonCommands) {
            try {
                const whichCmd = os.platform() === 'win32' ? 'where' : 'which';
                const { stdout } = await this.executeSystemCommand(`${whichCmd} ${cmd}`);
                if (stdout) {
                    const pythonPath = stdout.trim().split('\n')[0];
                    const result = await this.testPythonPath(pythonPath);
                    if (result) {
                        return pythonPath;
                    }
                }
            } catch (error) {
                // Command not found, try next
                this._outputChannel.appendLine(`Python command ${cmd} not found: ${error}`);
            }
        }

        // If we get here, no Python was found
        throw new Error('No Python installation found. Please install Python or configure the python.defaultInterpreterPath setting.');
    }

    /**
     * Test if a Python path is valid
     */
    private async testPythonPath(pythonPath: string): Promise<boolean> {
        try {
            const { stdout } = await this.executeSystemCommand(`"${pythonPath}" --version`);
            return stdout.toLowerCase().includes('python');
        } catch (error) {
            return false;
        }
    }

    /**
     * Execute a system command and return stdout/stderr
     */
    private async executeSystemCommand(command: string): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            cp.exec(command, (error, stdout, stderr) => {
                if (error && stderr) {
                    this._outputChannel.appendLine(`Error executing command: ${command}`);
                    this._outputChannel.appendLine(stderr);
                    reject(error);
                    return;
                }
                resolve({ stdout, stderr });
            });
        });
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
     * Get the pip command to use
     */
    public async getPipCommand(): Promise<{command: string, args: string[], envPath?: string}> {
        // If we have a current environment, use its pip
        if (this._currentEnv) {
            const pipCommand = os.platform() === 'win32' ? 'pip.exe' : 'pip';
            const binDir = os.platform() === 'win32' ? 'Scripts' : 'bin';
            const pipPath = path.join(this._currentEnv.path, binDir, pipCommand);
            
            // Check if pip exists in the environment
            try {
                await fs.promises.access(pipPath, fs.constants.X_OK);
                return { command: pipPath, args: [], envPath: undefined };
            } catch (error) {
                this._outputChannel.appendLine(`Pip not found in environment: ${pipPath}`);
                // Fall back to python -m pip
            }
        }
        
        // Otherwise use python -m pip
        const pythonPath = await this.getPythonPath();
        return { command: pythonPath, args: ['-m', 'pip'], envPath: undefined };
    }

    /**
     * Get list of installed packages in the current environment
     */
    public async getInstalledPackages(): Promise<PackageInfo[]> {
        try {
            // Get pip command
            const { command, args, envPath } = await this.getPipCommand();
            
            // Execute pip list command in JSON format
            const listArgs = [...args, 'list', '--format=json'];
            const output = await this.executeCommand(command, listArgs, envPath);
            
            const packagesData = JSON.parse(output) as Array<{name: string, version: string}>;
            const packages: PackageInfo[] = [];
            
            // Get outdated packages to check for updates
            const outdatedArgs = [...args, 'list', '--outdated', '--format=json'];
            const outdatedOutput = await this.executeCommand(command, outdatedArgs, envPath)
                .catch(() => '[]');  // If outdated check fails, assume no outdated packages
            
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
            
            // Get package details for descriptions
            const packages_with_details: PackageInfo[] = [];
            
            for (const pkg of packagesData) {
                const latest = outdatedMap.get(pkg.name);
                
                // Get package description from pip show
                let description = '';
                try {
                    const showArgs = [...args, 'show', pkg.name];
                    const showOutput = await this.executeCommand(command, showArgs, envPath);
                    
                    // Parse the output to find the summary/description
                    const lines = showOutput.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('Summary:')) {
                            description = line.substring('Summary:'.length).trim();
                            break;
                        }
                    }
                } catch (error) {
                    // Ignore errors when getting descriptions
                }
                
                packages_with_details.push({
                    name: pkg.name,
                    version: pkg.version,
                    latest: latest,
                    hasUpdate: !!latest,
                    description
                });
            }
            
            return packages_with_details;
        } catch (error) {
            this._outputChannel.appendLine(`Error getting installed packages: ${error}`);
            vscode.window.showErrorMessage('Failed to get installed packages. See output channel for details.');
            return [];
        }
    }

    /**
     * Search for packages on PyPI
     */
    public async searchPackages(query: string): Promise<PackageInfo[]> {
        try {
            // pip search is deprecated, so we'll use a PyPI API call instead through python requests
            const { command, args, envPath } = await this.getPipCommand();
            
            // Create a temporary Python script to search PyPI
            const tempDir = os.tmpdir();
            const scriptPath = path.join(tempDir, 'piping_search.py');
            
            const scriptContent = `
import sys
import json

try:
    import requests
except ImportError:
    print(json.dumps({"error": "requests module not installed"}))
    sys.exit(1)

query = sys.argv[1]
try:
    response = requests.get(f"https://pypi.org/pypi/{query}/json")
    if response.status_code == 200:
        data = response.json()
        result = {
            "name": data["info"]["name"],
            "version": data["info"]["version"],
            "description": data["info"]["summary"]
        }
        print(json.dumps([result]))
    else:
        # Try a more general search
        response = requests.get(
            "https://pypi.org/search/",
            params={"q": query},
            headers={"Accept": "application/json"}
        )
        if response.status_code == 200:
            results = []
            # This is a very basic scraper, may break if PyPI changes
            import re
            package_pattern = re.compile(r'<span class="package-snippet__name">([^<]+)</span>\\s*<span class="package-snippet__version">([^<]+)</span>\\s*<p class="package-snippet__description">([^<]+)</p>')
            matches = package_pattern.findall(response.text)
            for name, version, description in matches[:10]:  # Limit to 10 results
                results.append({
                    "name": name.strip(),
                    "version": version.strip(),
                    "description": description.strip()
                })
            print(json.dumps(results))
        else:
            print(json.dumps([]))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
`;
            
            await fs.promises.writeFile(scriptPath, scriptContent);
            
            // Execute the script
            const scriptArgs = [...args, scriptPath, query];
            const output = await this.executeCommand(command, scriptArgs, envPath);
            
            try {
                const results = JSON.parse(output);
                if (results.error) {
                    // Handle error from script
                    throw new Error(results.error);
                }
                return results;
            } catch (parseError) {
                throw new Error(`Failed to parse search results: ${parseError}`);
            }
        } catch (error) {
            this._outputChannel.appendLine(`Error searching packages: ${error}`);
            // Fall back to a basic search using pip list
            vscode.window.showWarningMessage('Advanced package search failed. Falling back to basic search.');
            
            try {
                const { command, args, envPath } = await this.getPipCommand();
                const listArgs = [...args, 'list'];
                const output = await this.executeCommand(command, listArgs, envPath);
                
                const lines = output.split('\n');
                const packages: PackageInfo[] = [];
                
                const queryLower = query.toLowerCase();
                
                // Skip the header rows
                for (let i = 2; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) {
                        continue;
                    }
                    
                    const parts = line.split(/\s+/);
                    if (parts.length >= 2) {
                        const name = parts[0];
                        const version = parts[1];
                        
                        if (name.toLowerCase().includes(queryLower)) {
                            packages.push({
                                name,
                                version,
                                description: 'Installed package'
                            });
                        }
                    }
                }
                
                return packages;
            } catch (fallbackError) {
                this._outputChannel.appendLine(`Fallback search failed: ${fallbackError}`);
                return [];
            }
        }
    }

    /**
     * Install a package
     */
    public async installPackage(packageName: string, version?: string): Promise<boolean> {
        try {
            const { command, args, envPath } = await this.getPipCommand();
            
            const packageSpec = version ? `${packageName}==${version}` : packageName;
            const installArgs = [...args, 'install', packageSpec];
            
            await this.executeCommand(command, installArgs, envPath);
            return true;
        } catch (error) {
            this._outputChannel.appendLine(`Error installing package: ${error}`);
            return false;
        }
    }

    /**
     * Uninstall a package
     */
    public async uninstallPackage(packageName: string): Promise<boolean> {
        try {
            const { command, args, envPath } = await this.getPipCommand();
            
            const uninstallArgs = [...args, 'uninstall', '-y', packageName];
            await this.executeCommand(command, uninstallArgs, envPath);
            return true;
        } catch (error) {
            this._outputChannel.appendLine(`Error uninstalling package: ${error}`);
            return false;
        }
    }

    /**
     * Update a package
     */
    public async updatePackage(packageName: string): Promise<boolean> {
        try {
            const { command, args, envPath } = await this.getPipCommand();
            
            const updateArgs = [...args, 'install', '--upgrade', packageName];
            await this.executeCommand(command, updateArgs, envPath);
            return true;
        } catch (error) {
            this._outputChannel.appendLine(`Error updating package: ${error}`);
            return false;
        }
    }

    /**
     * Get list of virtual environments
     */
    public async getVirtualEnvironments(): Promise<EnvironmentInfo[]> {
        const environments: EnvironmentInfo[] = [];
        
        // Get workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return environments;
        }
        
        // Common environment folder names
        const envFolders = ['.venv', 'venv', 'env', '.env', '.virtualenv', 'virtualenv'];
        
        // Look for virtual environments in workspace folders
        for (const folder of workspaceFolders) {
            for (const envName of envFolders) {
                const envPath = path.join(folder.uri.fsPath, envName);
                
                try {
                    const stats = await fs.promises.stat(envPath);
                    
                    if (stats.isDirectory()) {
                        // Check if this is a valid virtual environment
                        const pythonExePath = path.join(
                            envPath, 
                            os.platform() === 'win32' ? 'Scripts/python.exe' : 'bin/python'
                        );
                        
                        try {
                            const pythonExeStats = await fs.promises.stat(pythonExePath);
                            
                            if (pythonExeStats.isFile()) {
                                // It's a valid environment
                                const isActive = this._currentEnv?.path === envPath;
                                
                                environments.push({
                                    name: envName,
                                    path: envPath,
                                    isActive
                                });
                            }
                        } catch (error) {
                            // Not a valid environment or executable not found
                        }
                    }
                } catch (error) {
                    // Directory doesn't exist
                }
            }
        }
        
        return environments;
    }

    /**
     * Create a virtual environment
     */
    public async createVirtualEnvironment(name: string): Promise<EnvironmentInfo | undefined> {
        try {
            // Get Python path
            const pythonPath = await this.getPythonPath();
            
            // Get workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder is open');
            }
            
            const envPath = path.join(workspaceFolder.uri.fsPath, name);
            
            // Create the virtual environment
            const args = ['-m', 'venv', envPath];
            await this.executeCommand(pythonPath, args, undefined);
            
            // Return the environment info
            const newEnv: EnvironmentInfo = {
                name,
                path: envPath,
                isActive: false
            };
            
            return newEnv;
        } catch (error) {
            this._outputChannel.appendLine(`Error creating virtual environment: ${error}`);
            return undefined;
        }
    }

    /**
     * Update multiple packages at once
     * @param packageNames Array of package names to update
     * @returns Object containing arrays of successfully updated and failed packages
     */
    public async updatePackages(packageNames: string[]): Promise<{
        success: string[],
        failed: string[]
    }> {
        if (packageNames.length === 0) {
            return { success: [], failed: [] };
        }

        const success: string[] = [];
        const failed: string[] = [];
        
        try {
            const { command, args, envPath } = await this.getPipCommand();
            
            // First try to update all packages at once for efficiency
            try {
                const updateArgs = [...args, 'install', '--upgrade', ...packageNames];
                await this.executeCommand(command, updateArgs, envPath);
                
                // If we get here, all packages were updated successfully
                this._outputChannel.appendLine(`Successfully updated packages: ${packageNames.join(', ')}`);
                return { 
                    success: packageNames, 
                    failed: [] 
                };
            } catch (batchError) {
                // If batch update fails, fall back to updating packages individually
                this._outputChannel.appendLine(`Batch update failed, falling back to individual updates: ${batchError}`);
                
                // Try updating each package individually
                for (const pkgName of packageNames) {
                    try {
                        const updateArgs = [...args, 'install', '--upgrade', pkgName];
                        await this.executeCommand(command, updateArgs, envPath);
                        success.push(pkgName);
                    } catch (error) {
                        this._outputChannel.appendLine(`Error updating package ${pkgName}: ${error}`);
                        failed.push(pkgName);
                    }
                }
            }
        } catch (error) {
            this._outputChannel.appendLine(`Error in updatePackages: ${error}`);
            return { 
                success, 
                failed: [...failed, ...packageNames.filter(pkg => !success.includes(pkg))] 
            };
        }
        
        return { success, failed };
    }
}