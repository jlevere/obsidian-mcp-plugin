# Vault MCP

<div align="center">

## UNDER ACTIVE DEVELOPMENT

[![Test](https://github.com/jlevere/obsidian-mcp-plugin/actions/workflows/test.yml/badge.svg)](https://github.com/jlevere/obsidian-mcp-plugin/actions/workflows/test.yml)
[![GitHub release](https://img.shields.io/github/v/release/jlevere/obsidian-mcp-plugin)](https://github.com/jlevere/obsidian-mcp-plugin/releases)
[![Downloads](https://img.shields.io/github/downloads/jlevere/obsidian-mcp-plugin/total)](https://github.com/jlevere/obsidian-mcp-plugin/releases)

This Obsidian plugin embeds an MCP server directly within Obsidian, providing a streamlined
way for applications to interact with your vault.

[Installation](#installation) •
[Features](#features) •
[Usage](#usage) •
[Development](#development) •
[Schema Guide](#schema-guide)

![obsidian-settings](./docs/obsidian-settings.png)

</div>

## Features

- **Direct MCP Server:** Hosts the MCP server within Obsidian itself, simplifying setup and improving performance
- **Vault Access via MCP:** Exposes your vault through standardized tools
- **Structured Data Support:** Define custom schemas for structured note creation and validation
- **File Operations:**
  - Read and write files with smart diffing
  - Fuzzy search across your vault
  - Navigate vault structure programmatically
- **Configurable:** Customize server settings and tool availability

![tool-selection](./docs/obsidian-settings-tools.png)

## Installation

### Community Plugins (Recommended)

1. Open Obsidian Settings > Community Plugins
2. Search for "MCP Plugin"
3. Click Install, then Enable
4. Configure settings as needed

### Manual Installation

1. Download the latest release zip
2. Extract to `<vault>/.obsidian/plugins/`
3. Enable in Obsidian settings

## Usage

### Basic Setup

1. Enable the plugin
2. Configure port and host in settings
3. Restart the plugin to apply changes

### Connection Methods

The plugin currently only supports Server-Sent Events (SSE) and StreamHTTP connections. For applications that require stdio connections (like Claude Desktop), you'll need to use a proxy. You can follow [Cloudflare's guide](https://developers.cloudflare.com/agents/guides/test-remote-mcp-server/#connect-your-remote-mcp-server-to-claude-desktop-via-a-local-proxy) on setting up a local proxy using [`mcp-remote`](https://www.npmjs.com/package/mcp-remote).

Here is an example claude_desktop_config.json to use Cloudflare's local proxy.

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:<your_server_port>/sse"]
    }
  }
}
```

You can find the correct url from the plugin's setting pannel under endpoints.

### Available Tools

- `read-file`: Get file contents
- `diff-edit-file`: Smart, context-aware file updates using patch blocks (see below for usage)
- `search-contents`: Fuzzy search across the contents of all files in your vault
- `search-filenames`: Fuzzy search across all file names in your vault
- `vault-tree`: Browse vault structure
- `upsert-file`: Create or update files
- `rollback-edit`: Roll back the last edit to a markdown file (reverts the last change made by supported tools)

#### `diff-edit-file`

This tool allows you to update a section of a file by providing a snippet (the "original") and the new content (the "updated"). The tool will locate the original block in the file using fuzzy matching and replace it with your updated version. This is safer and more robust than replacing the whole file or relying on line numbers.

**How to use:**

- **original**: A copy-pasted snippet from your file — include enough surrounding lines to give unique context so the tool can reliably fuzzy-match it.
- **updated**: The new version you want to replace it with.

**Example:**

```json
{
  "path": "Notes/Example.md",
  "original": "def greet():\n    return 'Hello'",
  "updated": "def greet():\n    return 'Hi there!'"
}
```

If the block is found and the patch is valid, only that section will be updated. If the file is empty, the updated content will be written as the new file content.

#### `rollback-edit`

This tool allows you to revert the last change made to a markdown file by supported file-writing tools (`diff-edit-file`, `upsert-file`, or structured update tools). Before any of these tools modify a file, the previous content is saved in a rollback store. You can use `rollback-edit` to restore the file to its previous state.

**How to use:**

- **path**: The path to the markdown file you want to roll back (must end with `.md`).

**Example:**

```json
{
  "path": "Notes/Example.md"
}
```

If a rollback is available, the file will be restored to its previous content, and you'll get a message with the timestamp and reason for the last change. If not, you'll get an error message.

## Development

### Prerequisites

- Basic knowledge of TypeScript and [Obsidian API](https://github.com/obsidianmd/obsidian-api)

A nix flake is provided to create a standarized development environment.

### Setup Development Environment

```bash

# Clone the repository

git clone https://github.com/yourusername/obsidian-mcp-plugin.git
cd obsidian-mcp-plugin

# Install dependencies

pnpm install

# Start development build

pnpm run dev
```

### Project Structure

- `src/`: Source code
  - `managers/`: Core functionality managers
  - `structured-tools/`: Schema validation and tools
  - `utils/`: Helper utilities
  - `vault/`: Vault interaction code
- `tests/`: Test files

### Building

```bash

# Production build

pnpm run build

# Run tests

pnpm test

# Package for distribution

pnpm run package
```

## Schema Guide

The plugin supports structured data through JSON Schema-based definitions. This enables type-safe note creation and validation.

This allows llms to create and update structured data without breaking it.

In an essense, you describe a document and interface using yaml which is converted to jsonschema, validated, and used to generate zod interfaces for MCP tools.

`yaml -> jsonschema -> zod -> MCP tool`

### Examples

Create a new markdown file in your schema directory (default: `metadata/schemas`) with a YAML schema block:

##

```yaml
metadata:
  schemaName: "Recipe"
  description: |
    Updates a recipe file given a schema and identifiers. Creates the file if it doesn't exist.
    Uses the Recipe Schema. It merges new non-default data into existing frontmatter.
  identifierField: "recipe_id"
  pathTemplate: "Recipes/${category}/${recipe_id}/Recipe.md"
  pathComponents:
    - category
    - recipe_id

fields:
  recipe_id:
    type: "string"
    description: "Unique identifier for the recipe (e.g., `chocolate_chip_cookies`)."
    optional: false

  category:
    type: "string"
    description: "Recipe category for organizing files (e.g., `Desserts`)."
    optional: false

  title:
    type: "string"
    description: "Name of the recipe (e.g., `Chocolate Chip Cookies`)."
    optional: true

  description:
    type: "string"
    description: "Brief description of the recipe and its highlights."
    optional: true

  servings:
    type: "number"
    description: "Number of servings the recipe yields (must be at least 1)."
    optional: true
    minimum: 1
    maximum: 100
    default: 4

  ingredients:
    type: "array"
    description: "List of ingredients required for the recipe."
    optional: true
    items:
      type: "object"
      properties:
        name:
          type: "string"
          description: "The name of the ingredient (e.g., `all-purpose flour`)."
          optional: false
        quantity:
          type: "string"
          description: "Amount needed (e.g., `2 cups`, `1 tsp`)."
          optional: true

---
```

This generates an MCP tool that looks like this:

![mcp-schema-tool](./docs/schema-mcp-tool.png)

When you use it to put data into obsidan the result looks like this:

![obsidnan-schema-tool](./docs/schema-obsidian-tool.png)

### Schema Validation

Schemas are validated against:

1. JSON Schema specification (draft-07)
2. Plugin's [meta-schema](./src/structured-tools/meta-schema.json) for compliance with structure and zod types

### Writing your own schemas

There are two parts to the schemas.

The `metadata` section, which describes the name of the file, the location, and importantly, what keys are used as identifiers.

The `fields` section, this describes your actual document. It will be represented as a yaml like document and stored in markdown. Obsidian is able to render this yaml like document and nicely embed it.

The `fields` section is used to generate the `zod` schema which creates the MCP tool interface. So, you are simultainiously defining your data and also the interface to interact with it.

This gives you access to many of `zods` features though, such as `minimum`/`maximum` `default` etc.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Credits

- Based on [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) by [coddingtonbear](https://github.com/coddingtonbear)
- Uses [Model Context Protocol](https://github.com/modelcontextprotocol/protocol) for AI interactions

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
