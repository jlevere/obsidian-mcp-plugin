# Obsidian MCP Plugin

This Obsidian plugin embeds an MCP (Model Context Protocol) server directly within Obsidian, providing a streamlined way for applications to interact with your vault.

## Features

- **Direct MCP Server:** Unlike other Obsidian integrations that rely on a separate REST API plugin and server, this plugin hosts the MCP server within Obsidian itself. This simplifies setup and can improve performance.
- **Vault Access via MCP:** Exposes your Obsidian vault's files and structure to MCP clients through a set of tools.
- **File Operations:**
  - `read-file`: Retrieves the content of any file in the vault.
  - `diff-edit-file`: Applies minimal diffs to a file, updating only the necessary parts. This tool compares the provided content with the file's current content and applies the difference.
  - `upsert-file`: Creates a new file or appends content to an existing file. If the file exists, the new content is added to the end.
- **Vault Structure:**
  - `vault-tree`: Fetches a hierarchical tree representation of the vault's directories and files, allowing you to explore the vault's structure programmatically.
- **Search:**
  - `fuzzy-search`: Performs fuzzy searches within the vault's Markdown files, returning a list of files ordered by relevance.
- **Settings:** Configurable port and binding host for the MCP server.

## Installation

1.  Install the "Obsidian MCP Plugin" from Obsidian's community plugins.
2.  Enable the plugin.
3.  Configure the plugin settings (port, binding host) in Obsidian.
4.  Restart the plugin to apply settings.

**Alternative Installation (Manual):**

1.  Download the latest release zip file.
2.  Extract the contents to your vault's `<vault>/.obsidian/plugins` directory.
3.  Enable the plugin in Obsidian settings.

## Plugin Settings

- **Server Port:** The port on which the MCP server will listen for connections. Default is 3000.
- **Binding Host:** The network interface the server will bind to.
  - `0.0.0.0`: Binds to all available network interfaces.
  - `127.0.0.1`: Binds to localhost only.
- **Restart Server:** A button to restart the MCP server after changing settings.

## MCP Tools

The plugin registers the following tools with the MCP server:

- `read-file`: Retrieves the content of a file from the Obsidian vault. The file path should be relative to the root of the vault.
- `diff-edit-file`: Applies a "smart" diff to a file in the vault. It compares the provided content with the current file content and applies only the necessary changes.
- `fuzzy-search`: Performs a fuzzy search for markdown files in the vault based on a query string. It returns a list of matching files with their fuzzy search scores.
- `vault-tree`: Retrieves a hierarchical tree representation of the vault's directory structure. It can return the entire vault tree or a specific directory subtree.
- `upsert-file`: Creates a new file or updates an existing file in the vault. If the file exists, the provided content is appended to it.

Each tool is accessible through the MCP protocol, allowing external applications to interact with your Obsidian vault programmatically.

## Implementation Details

- **Server:** The plugin uses Express.js to create an HTTP server and the `@modelcontextprotocol/sdk` to implement the MCP server.
- **Communication:** Server-Sent Events (SSE) are used for real-time communication between the MCP server and clients.
- **Vault Interaction:** The plugin leverages the Obsidian API to access and modify files, folders, and metadata within the vault.
- **Settings:** Plugin settings are stored and managed using Obsidian's data persistence mechanisms.
- **Dependencies:**
  - `@modelcontextprotocol/sdk`
  - `express`
  - `@sanity/diff-match-patch`
  - `zod`

## Unique Approach

This plugin distinguishes itself by directly integrating the MCP server into Obsidian. Traditional methods often involve running a separate server that communicates with Obsidian via its REST API (if available). This plugin's approach offers potential advantages in terms of:

- **Simplicity:** Fewer components to set up and manage.
- **Performance:** Reduced overhead by eliminating inter-process communication.
- **Extensibility:** The entire Obsidian API can be used for tool functionality rather than just REST API calls.

## Credits

This project is based on [coddingtonbear](https://github.com/coddingtonbear)'s amazing work on the [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api)
