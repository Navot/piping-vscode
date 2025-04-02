# Piping - Modern Pip Manager for VS Code

Piping is a comprehensive Python package management extension for Visual Studio Code that provides a modern, intuitive interface for managing pip packages directly within your IDE.

## Features

### Dashboard & Interactive Panels

- **Overview Panel**: Central dashboard showing installed packages, pending updates, and virtual environment status.
- **Interactive Views**: Visualize your Python environments and installed packages in an organized tree view.
- **Real-time Feedback**: Get immediate feedback on package operations with progress indicators and notifications.

### Enhanced Package Management

- **Search & Install**: Search for packages on PyPI and install them with a single click.
- **Update Management**: Easily identify and update outdated packages.
- **Virtual Environment Integration**: Create, switch between, and manage virtual environments directly from VS Code.

## Project Structure

- `src/`: TypeScript source code for the extension
  - `extension.ts`: Main entry point that handles extension activation
  - `commands/`: Implementation of all VS Code commands
  - `panels/`: WebView panels including the main dashboard
  - `providers/`: Tree data providers for package and environment views
  - `utils/`: Utility functions including Python execution helpers
- `resources/`: Static resources like icons and images
- `out/`: Compiled JavaScript output

## Requirements

- Visual Studio Code 1.60.0 or higher
- Python 3.6 or higher
- pip 19.0 or higher
- Node.js and npm for development

## Development Setup

### Prerequisites

1. Install [Node.js](https://nodejs.org/) (v14 or higher recommended)
2. Install [Visual Studio Code](https://code.visualstudio.com/)
3. Clone this repository:
   ```
   git clone https://github.com/Navot/piping-vscode.git
   cd piping-vscode
   ```

### Building the Extension

1. Install dependencies:
   ```
   npm install
   ```

2. Compile the TypeScript code:
   ```
   npm run compile
   ```
   
   For development with auto-recompilation:
   ```
   npm run watch
   ```

### Testing the Extension

1. Press F5 in VS Code to launch a new Extension Development Host window
2. In the development window, open a Python project
3. Access Piping from the Activity Bar or through commands

### Packaging the Extension

To create a `.vsix` file for distribution:

```
npm install -g @vscode/vsce
vsce package
```

This will generate a `piping-0.1.0.vsix` file (or similar, depending on version).

## Installing the Extension

### From VS Code Marketplace

_(Once published)_ Search for "Piping" in the VS Code Extensions view.

### From VSIX File

1. In VS Code, go to Extensions view (Ctrl+Shift+X)
2. Click the "..." menu in the top-right
3. Select "Install from VSIX..."
4. Navigate to and select the `.vsix` file

## Getting Started

1. Install the extension
2. Open a Python project
3. Click on the Piping icon in the Activity Bar to open the Piping Explorer
4. Use the commands in the command palette (Ctrl+Shift+P) to manage packages:
   - `Piping: Open Dashboard`
   - `Piping: Install Package`
   - `Piping: Create Virtual Environment`
   - and more...

## Usage

### Managing Packages

- **Installing Packages**: Use the `Piping: Install Package` command or click "Install" in the dashboard.
- **Uninstalling Packages**: Right-click a package in the explorer and select "Uninstall", or use the dashboard.
- **Updating Packages**: Packages with available updates will be highlighted. Click "Update" to install the latest version.

### Managing Virtual Environments

- **Creating Environments**: Use the `Piping: Create Virtual Environment` command.
- **Switching Environments**: Select an environment from the Environments view and click "Activate".

## Extension Settings

This extension contributes the following settings:

* `piping.enableNotifications`: Enable/disable notifications for package operations
* `piping.showPackageDetails`: Show detailed information about packages
* `piping.autoCheckUpdates`: Automatically check for package updates on startup

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This extension is licensed under the [MIT License](LICENSE). 