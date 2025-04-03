import * as vscode from 'vscode';
import * as path from 'path';
import { PythonExecutor, PackageInfo } from '../utils/pythonExecutor';

export class PipingDashboardPanel {
    public static currentPanel: PipingDashboardPanel | undefined;
    
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _pythonExecutor: PythonExecutor;
    private _disposables: vscode.Disposable[] = [];
    
    public static createOrShow(extensionUri: vscode.Uri, pythonExecutor: PythonExecutor) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
            
        // If we already have a panel, show it
        if (PipingDashboardPanel.currentPanel) {
            PipingDashboardPanel.currentPanel._panel.reveal(column);
            return;
        }
        
        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'pipingDashboard',
            'Piping Dashboard',
            column || vscode.ViewColumn.One,
            {
                // Enable JavaScript in the webview
                enableScripts: true,
                
                // Restrict the webview to only loading content from our extension's directory
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'resources'),
                    vscode.Uri.joinPath(extensionUri, 'out')
                ]
            }
        );
        
        PipingDashboardPanel.currentPanel = new PipingDashboardPanel(panel, extensionUri, pythonExecutor);
    }
    
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, pythonExecutor: PythonExecutor) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._pythonExecutor = pythonExecutor;
        
        // Set the webview's initial html content
        this._update();
        
        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            () => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );
        
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refreshPackages':
                        await this._updatePackageData();
                        break;
                    case 'installPackage':
                        if (message.package) {
                            await this._installPackage(message.package);
                        }
                        break;
                    case 'uninstallPackage':
                        if (message.package) {
                            await this._uninstallPackage(message.package);
                        }
                        break;
                    case 'updatePackage':
                        if (message.package) {
                            await this._updatePackage(message.package);
                        }
                        break;
                    case 'updateSelectedPackages':
                        if (message.packageNames && message.packageNames.length > 0) {
                            await this._updateSelectedPackages(message.packageNames);
                        }
                        break;
                    case 'updateAllPackages':
                        await this._updateAllPackages();
                        break;
                    case 'searchPackages':
                        if (message.query) {
                            await this._searchPackages(message.query);
                        }
                        break;
                }
            },
            null,
            this._disposables
        );
    }
    
    private async _update() {
        const webview = this._panel.webview;
        
        this._panel.title = 'Piping Dashboard';
        this._panel.webview.html = this._getHtmlForWebview(webview);
        
        // Load package data
        await this._updatePackageData();
    }
    
    private async _updatePackageData() {
        try {
            // Get installed packages
            const packages = await this._pythonExecutor.getInstalledPackages();
            
            // Update the webview with package data
            this._panel.webview.postMessage({
                command: 'updatePackages',
                packages
            });
        } catch (error) {
            console.error('Error updating package data:', error);
        }
    }
    
    private async _installPackage(packageSpec: string) {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Installing ${packageSpec}...`,
                cancellable: false
            }, async () => {
                let packageName = packageSpec;
                let version: string | undefined;
                
                // Check if version is specified
                if (packageSpec.includes('==')) {
                    const parts = packageSpec.split('==');
                    packageName = parts[0];
                    version = parts[1];
                }
                
                const success = await this._pythonExecutor.installPackage(packageName, version);
                
                if (success) {
                    vscode.window.showInformationMessage(`Successfully installed ${packageSpec}`);
                    await this._updatePackageData();
                } else {
                    vscode.window.showErrorMessage(`Failed to install ${packageSpec}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error installing package: ${error}`);
        }
    }
    
    private async _uninstallPackage(packageName: string) {
        try {
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
            
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Uninstalling ${packageName}...`,
                cancellable: false
            }, async () => {
                const success = await this._pythonExecutor.uninstallPackage(packageName);
                
                if (success) {
                    vscode.window.showInformationMessage(`Successfully uninstalled ${packageName}`);
                    await this._updatePackageData();
                } else {
                    vscode.window.showErrorMessage(`Failed to uninstall ${packageName}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error uninstalling package: ${error}`);
        }
    }
    
    private async _updatePackage(packageName: string) {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Updating ${packageName}...`,
                cancellable: false
            }, async () => {
                const success = await this._pythonExecutor.updatePackage(packageName);
                
                if (success) {
                    vscode.window.showInformationMessage(`Successfully updated ${packageName}`);
                    await this._updatePackageData();
                } else {
                    vscode.window.showErrorMessage(`Failed to update ${packageName}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error updating package: ${error}`);
        }
    }
    
    private async _updateSelectedPackages(packageNames: string[]) {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Updating ${packageNames.length} packages...`,
                cancellable: false
            }, async () => {
                // Execute the command to update selected packages
                await vscode.commands.executeCommand('piping.updateSelectedPackages', packageNames);
                
                // Refresh the package list
                await this._updatePackageData();
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error updating packages: ${error}`);
        }
    }
    
    private async _updateAllPackages() {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Updating all packages with available updates...`,
                cancellable: false
            }, async () => {
                // Execute the command to update all packages
                await vscode.commands.executeCommand('piping.updateAllPackages');
                
                // Refresh the package list
                await this._updatePackageData();
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error updating packages: ${error}`);
        }
    }
    
    private async _searchPackages(query: string) {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Searching for '${query}'...`,
                cancellable: false
            }, async () => {
                const results = await this._pythonExecutor.searchPackages(query);
                
                // Update the webview with search results
                this._panel.webview.postMessage({
                    command: 'searchResults',
                    packages: results
                });
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error searching packages: ${error}`);
        }
    }
    
    private _getHtmlForWebview(webview: vscode.Webview) {
        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();
        
        // Basic HTML content
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Piping Dashboard</title>
    <style>
        :root {
            --container-padding: 20px;
            --input-padding-vertical: 6px;
            --input-padding-horizontal: 4px;
            --input-margin-vertical: 4px;
            --input-margin-horizontal: 0;
        }
        
        body {
            padding: 0 var(--container-padding);
            color: var(--vscode-foreground);
            font-size: var(--vscode-font-size);
            font-weight: var(--vscode-font-weight);
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
        }
        
        ol, ul {
            padding-left: var(--container-padding);
        }
        
        body > *:last-child {
            margin-bottom: 0;
        }
        
        input {
            display: block;
            width: 100%;
            border: none;
            font-family: var(--vscode-font-family);
            padding: var(--input-padding-vertical) var(--input-padding-horizontal);
            color: var(--vscode-input-foreground);
            outline-color: var(--vscode-input-border);
            background-color: var(--vscode-input-background);
        }
        
        input[type="checkbox"] {
            width: auto;
            display: inline-block;
            margin-right: 8px;
            cursor: pointer;
        }
        
        button {
            border: none;
            padding: var(--input-padding-vertical) var(--input-padding-horizontal);
            text-align: center;
            outline: 1px solid transparent;
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
            cursor: pointer;
            margin: 4px;
        }
        
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        button:active {
            background: var(--vscode-button-activeBackground);
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .dashboard {
            padding: 20px;
        }
        
        .search-box {
            display: flex;
            margin-bottom: 20px;
        }
        
        .search-box input {
            flex: 1;
            margin-right: 10px;
        }
        
        .header-actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .batch-actions {
            display: flex;
            gap: 8px;
        }
        
        .tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .tab {
            padding: 8px 16px;
            cursor: pointer;
        }
        
        .tab.active {
            border-bottom: 2px solid var(--vscode-button-background);
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .package-list {
            max-height: 400px;
            overflow-y: auto;
        }
        
        .package-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .package-info {
            flex: 1;
            display: flex;
            align-items: center;
        }
        
        .package-name {
            font-weight: bold;
        }
        
        .package-version {
            color: var(--vscode-descriptionForeground);
            margin-left: 10px;
        }
        
        .package-update {
            color: var(--vscode-notificationsUpdateIcon-foreground);
        }
        
        .package-actions {
            display: flex;
            gap: 4px;
        }
        
        .icon-button {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            background: transparent;
            border: 1px solid var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            font-size: 14px;
            cursor: pointer;
            padding: 0;
            transition: background-color 0.2s;
        }
        
        .icon-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .tooltip {
            position: relative;
        }
        
        .tooltip::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            padding: 4px 8px;
            background-color: var(--vscode-editorWidget-background);
            color: var(--vscode-editorWidget-foreground);
            border-radius: 4px;
            white-space: nowrap;
            visibility: hidden;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 1;
            font-size: 12px;
        }
        
        .tooltip:hover::after {
            visibility: visible;
            opacity: 1;
        }
        
        .hidden {
            display: none;
        }
        
        .graph-container {
            height: 500px;
            border: 1px solid var(--vscode-panel-border);
            position: relative;
        }
        
        .select-all {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <h1>Python Package Dashboard</h1>
        
        <div class="search-box">
            <input type="text" id="search-input" placeholder="Search packages...">
            <button id="search-button">Search</button>
            <button id="refresh-button">Refresh</button>
        </div>
        
        <div class="tabs">
            <div class="tab active" data-tab="installed">Installed Packages</div>
            <div class="tab" data-tab="updates">Updates Available</div>
            <div class="tab" data-tab="search">Search Results</div>
            <div class="tab" data-tab="graph">Dependency Graph</div>
        </div>
        
        <div class="tab-content active" data-tab="installed">
            <div class="header-actions">
                <div class="select-all">
                    <input type="checkbox" id="select-all-installed" aria-label="Select all packages">
                    <label for="select-all-installed">Select All</label>
                </div>
                <div class="batch-actions">
                    <button id="update-selected" class="tooltip" data-tooltip="Update selected packages" disabled>Update Selected</button>
                </div>
            </div>
            <div class="package-list" id="installed-packages">
                <div class="loading">Loading packages...</div>
            </div>
        </div>
        
        <div class="tab-content" data-tab="updates">
            <div class="header-actions">
                <div class="select-all">
                    <input type="checkbox" id="select-all-updates" aria-label="Select all packages with updates">
                    <label for="select-all-updates">Select All</label>
                </div>
                <div class="batch-actions">
                    <button id="update-all" class="tooltip" data-tooltip="Update all packages with available updates">Update All</button>
                    <button id="update-selected-updates" class="tooltip" data-tooltip="Update selected packages" disabled>Update Selected</button>
                </div>
            </div>
            <div class="package-list" id="updates-packages">
                <div class="loading">Loading updates...</div>
            </div>
        </div>
        
        <div class="tab-content" data-tab="search">
            <div class="package-list" id="search-packages">
                <div class="no-results">Enter a search term to find packages</div>
            </div>
        </div>
        
        <div class="tab-content" data-tab="graph">
            <div class="graph-container" id="dependency-graph">
                <div class="loading">Loading dependency graph...</div>
            </div>
        </div>
    </div>
    <script nonce="${nonce}">
        (function() {
            // Store package data
            let installedPackages = [];
            let searchResults = [];
            let selectedPackages = new Set();
            let selectedUpdates = new Set();
            
            // Get DOM elements
            const vsCode = acquireVsCodeApi();
            const searchInput = document.getElementById('search-input');
            const searchButton = document.getElementById('search-button');
            const refreshButton = document.getElementById('refresh-button');
            const installedPackagesList = document.getElementById('installed-packages');
            const updatesPackagesList = document.getElementById('updates-packages');
            const searchPackagesList = document.getElementById('search-packages');
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');
            const selectAllInstalled = document.getElementById('select-all-installed');
            const selectAllUpdates = document.getElementById('select-all-updates');
            const updateSelected = document.getElementById('update-selected');
            const updateSelectedUpdates = document.getElementById('update-selected-updates');
            const updateAll = document.getElementById('update-all');
            
            // Handle tab switching
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    // Remove active class from all tabs and contents
                    tabs.forEach(t => t.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));
                    
                    // Add active class to clicked tab and corresponding content
                    tab.classList.add('active');
                    const tabName = tab.getAttribute('data-tab');
                    document.querySelector(\`.tab-content[data-tab="\${tabName}"]\`).classList.add('active');
                });
            });
            
            // Handle search button click
            searchButton.addEventListener('click', () => {
                const query = searchInput.value.trim();
                if (query) {
                    vsCode.postMessage({ command: 'searchPackages', query });
                    searchPackagesList.innerHTML = '<div class="loading">Searching...</div>';
                    
                    // Switch to search tab
                    tabs.forEach(t => t.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));
                    document.querySelector('.tab[data-tab="search"]').classList.add('active');
                    document.querySelector('.tab-content[data-tab="search"]').classList.add('active');
                }
            });
            
            // Handle search input enter key
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    searchButton.click();
                }
            });
            
            // Handle refresh button click
            refreshButton.addEventListener('click', () => {
                vsCode.postMessage({ command: 'refreshPackages' });
                installedPackagesList.innerHTML = '<div class="loading">Refreshing packages...</div>';
                updatesPackagesList.innerHTML = '<div class="loading">Refreshing updates...</div>';
                
                // Clear selections
                selectedPackages.clear();
                selectedUpdates.clear();
                updateButtonStates();
            });
            
            // Handle "Update Selected" button click
            updateSelected.addEventListener('click', () => {
                if (selectedPackages.size > 0) {
                    const packageNames = Array.from(selectedPackages);
                    vsCode.postMessage({ command: 'updateSelectedPackages', packageNames });
                }
            });
            
            // Handle "Update Selected Updates" button click
            updateSelectedUpdates.addEventListener('click', () => {
                if (selectedUpdates.size > 0) {
                    const packageNames = Array.from(selectedUpdates);
                    vsCode.postMessage({ command: 'updateSelectedPackages', packageNames });
                }
            });
            
            // Handle "Update All" button click
            updateAll.addEventListener('click', () => {
                vsCode.postMessage({ command: 'updateAllPackages' });
            });
            
            // Handle select all checkbox for installed packages
            selectAllInstalled.addEventListener('change', () => {
                const checkboxes = document.querySelectorAll('.installed-checkbox');
                
                if (selectAllInstalled.checked) {
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = true;
                        const packageName = checkbox.getAttribute('data-package');
                        if (packageName) {
                            selectedPackages.add(packageName);
                        }
                    });
                } else {
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = false;
                    });
                    selectedPackages.clear();
                }
                
                updateButtonStates();
            });
            
            // Handle select all checkbox for updates
            selectAllUpdates.addEventListener('change', () => {
                const checkboxes = document.querySelectorAll('.updates-checkbox');
                
                if (selectAllUpdates.checked) {
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = true;
                        const packageName = checkbox.getAttribute('data-package');
                        if (packageName) {
                            selectedUpdates.add(packageName);
                        }
                    });
                } else {
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = false;
                    });
                    selectedUpdates.clear();
                }
                
                updateButtonStates();
            });
            
            // Update button states based on selections
            function updateButtonStates() {
                updateSelected.disabled = selectedPackages.size === 0;
                updateSelectedUpdates.disabled = selectedUpdates.size === 0;
            }
            
            // Handle checkbox change for installed packages
            function handleInstalledCheckboxChange(checkbox) {
                const packageName = checkbox.getAttribute('data-package');
                
                if (checkbox.checked) {
                    selectedPackages.add(packageName);
                } else {
                    selectedPackages.delete(packageName);
                    selectAllInstalled.checked = false;
                }
                
                updateButtonStates();
            }
            
            // Handle checkbox change for updates
            function handleUpdatesCheckboxChange(checkbox) {
                const packageName = checkbox.getAttribute('data-package');
                
                if (checkbox.checked) {
                    selectedUpdates.add(packageName);
                } else {
                    selectedUpdates.delete(packageName);
                    selectAllUpdates.checked = false;
                }
                
                updateButtonStates();
            }
            
            // Render installed packages
            function renderInstalledPackages() {
                if (!installedPackages.length) {
                    installedPackagesList.innerHTML = '<div class="no-results">No packages installed</div>';
                    updatesPackagesList.innerHTML = '<div class="no-results">No updates available</div>';
                    
                    // Clear selections
                    selectedPackages.clear();
                    selectedUpdates.clear();
                    updateButtonStates();
                    return;
                }
                
                // Sort packages alphabetically
                installedPackages.sort((a, b) => a.name.localeCompare(b.name));
                
                // Filter packages with updates
                const packagesWithUpdates = installedPackages.filter(pkg => pkg.hasUpdate);
                
                // Render installed packages
                installedPackagesList.innerHTML = installedPackages.map(pkg => {
                    const isSelected = selectedPackages.has(pkg.name);
                    
                    return \`
                        <div class="package-item">
                            <div class="package-info">
                                <input type="checkbox" class="installed-checkbox" data-package="\${pkg.name}" \${isSelected ? 'checked' : ''} aria-label="Select \${pkg.name}">
                                <span class="package-name">\${pkg.name}</span>
                                <span class="package-version">\${pkg.version}</span>
                                \${pkg.hasUpdate ? \`<span class="package-update">(Update available: \${pkg.latest})</span>\` : ''}
                            </div>
                            <div class="package-actions">
                                \${pkg.hasUpdate ? \`<button class="icon-button update-button tooltip" data-package="\${pkg.name}" data-tooltip="Update to \${pkg.latest}">⟳</button>\` : ''}
                                <button class="icon-button uninstall-button tooltip" data-package="\${pkg.name}" data-tooltip="Uninstall">🗑️</button>
                            </div>
                        </div>
                    \`;
                }).join('');
                
                // Render updates
                if (packagesWithUpdates.length) {
                    updatesPackagesList.innerHTML = packagesWithUpdates.map(pkg => {
                        const isSelected = selectedUpdates.has(pkg.name);
                        
                        return \`
                            <div class="package-item">
                                <div class="package-info">
                                    <input type="checkbox" class="updates-checkbox" data-package="\${pkg.name}" \${isSelected ? 'checked' : ''} aria-label="Select \${pkg.name}">
                                    <span class="package-name">\${pkg.name}</span>
                                    <span class="package-version">\${pkg.version} → \${pkg.latest}</span>
                                </div>
                                <div class="package-actions">
                                    <button class="icon-button update-button tooltip" data-package="\${pkg.name}" data-tooltip="Update to \${pkg.latest}">⟳</button>
                                </div>
                            </div>
                        \`;
                    }).join('');
                    
                    // Enable "Update All" button
                    updateAll.disabled = false;
                } else {
                    updatesPackagesList.innerHTML = '<div class="no-results">No updates available</div>';
                    
                    // Disable "Update All" button
                    updateAll.disabled = true;
                    
                    // Clear update selections
                    selectedUpdates.clear();
                    updateButtonStates();
                }
                
                // Add event listeners to buttons and checkboxes
                document.querySelectorAll('.update-button').forEach(button => {
                    button.addEventListener('click', () => {
                        const packageName = button.getAttribute('data-package');
                        vsCode.postMessage({ command: 'updatePackage', package: packageName });
                    });
                });
                
                document.querySelectorAll('.uninstall-button').forEach(button => {
                    button.addEventListener('click', () => {
                        const packageName = button.getAttribute('data-package');
                        vsCode.postMessage({ command: 'uninstallPackage', package: packageName });
                    });
                });
                
                document.querySelectorAll('.installed-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', () => handleInstalledCheckboxChange(checkbox));
                });
                
                document.querySelectorAll('.updates-checkbox').forEach(checkbox => {
                    checkbox.addEventListener('change', () => handleUpdatesCheckboxChange(checkbox));
                });
                
                // Update button states
                updateButtonStates();
            }
            
            // Render search results
            function renderSearchResults() {
                if (!searchResults.length) {
                    searchPackagesList.innerHTML = '<div class="no-results">No packages found</div>';
                    return;
                }
                
                searchPackagesList.innerHTML = searchResults.map(pkg => {
                    return \`
                        <div class="package-item">
                            <div class="package-info">
                                <span class="package-name">\${pkg.name}</span>
                                <span class="package-version">\${pkg.version}</span>
                                \${pkg.description ? \`<div>\${pkg.description}</div>\` : ''}
                            </div>
                            <div class="package-actions">
                                <button class="icon-button install-button tooltip" data-package="\${pkg.name}" data-tooltip="Install">📦</button>
                            </div>
                        </div>
                    \`;
                }).join('');
                
                // Add event listeners to install buttons
                document.querySelectorAll('.install-button').forEach(button => {
                    button.addEventListener('click', () => {
                        const packageName = button.getAttribute('data-package');
                        vsCode.postMessage({ command: 'installPackage', package: packageName });
                    });
                });
            }
            
            // Listen for messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'updatePackages':
                        installedPackages = message.packages;
                        renderInstalledPackages();
                        break;
                    case 'searchResults':
                        searchResults = message.packages;
                        renderSearchResults();
                        break;
                }
            });
            
            // Initialize: request package data
            vsCode.postMessage({ command: 'refreshPackages' });
        }());
    </script>
</body>
</html>`;
    }
    
    public dispose() {
        PipingDashboardPanel.currentPanel = undefined;
        
        // Clean up our resources
        this._panel.dispose();
        
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
} 