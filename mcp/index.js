#!/usr/bin/env node
/**
 * CTOC MCP Server
 * Native tool integration for Claude Code
 *
 * This server exposes CTOC commands as MCP tools, enabling:
 * - Reduced token usage (no ASCII template generation)
 * - Faster execution (direct function calls)
 * - Consistent output (deterministic tool responses)
 * - Enforced integration (MCP tools cannot be ignored)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check dependencies before importing SDK
async function checkDependencies() {
  // Check MCP SDK
  try {
    await import('@modelcontextprotocol/sdk/server/mcp.js');
  } catch (e) {
    console.error('MCP SDK not found. Run: cd mcp && npm install');
    process.exit(1);
  }

  // Check ctoc repo structure
  const repoRoot = path.dirname(__dirname);
  const versionPath = path.join(repoRoot, 'VERSION');
  if (!fs.existsSync(versionPath)) {
    // Check installed mode path
    const altVersionPath = path.join(repoRoot, '..', '..', 'VERSION');
    if (!fs.existsSync(altVersionPath)) {
      console.error('CTOC installation not found. VERSION file missing.');
      process.exit(1);
    }
  }
}

async function main() {
  await checkDependencies();

  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { z } = await import('zod');
  const toolsModule = await import('./tools.js');

  // Read version for server info
  const repoRoot = path.dirname(__dirname);
  let version = '1.0.0';
  try {
    const versionPath = path.join(repoRoot, 'VERSION');
    if (fs.existsSync(versionPath)) {
      version = fs.readFileSync(versionPath, 'utf8').trim();
    }
  } catch (e) {}

  const server = new McpServer({
    name: 'ctoc',
    version: version
  });

  // Register read-only tools (no parameters)
  server.registerTool('ctoc_status', {
    description: 'Show quick CTOC status including project info, stack, and Iron Loop state'
  }, async () => {
    const output = toolsModule.cmdStatus();
    return { content: [{ type: 'text', text: output }] };
  });

  server.registerTool('ctoc_admin', {
    description: 'Show full admin dashboard with kanban board, queue status, and git info'
  }, async () => {
    const output = toolsModule.cmdAdmin();
    return { content: [{ type: 'text', text: output }] };
  });

  server.registerTool('ctoc_kanban', {
    description: 'Show kanban board with plan counts and status'
  }, async () => {
    const output = toolsModule.cmdKanban();
    return { content: [{ type: 'text', text: output }] };
  });

  server.registerTool('ctoc_progress', {
    description: 'Show Iron Loop progress for current feature'
  }, async () => {
    const output = toolsModule.cmdProgress();
    return { content: [{ type: 'text', text: output }] };
  });

  server.registerTool('ctoc_plan_status', {
    description: 'Show plan dashboard with functional and implementation plans'
  }, async () => {
    const output = toolsModule.cmdPlanStatus();
    return { content: [{ type: 'text', text: output }] };
  });

  server.registerTool('ctoc_doctor', {
    description: 'Run installation health check'
  }, async () => {
    const output = toolsModule.cmdDoctor();
    return { content: [{ type: 'text', text: output }] };
  });

  // Register state management tools (with parameters)
  server.registerTool('ctoc_start', {
    description: 'Start tracking a new feature in Iron Loop',
    inputSchema: z.object({
      feature: z.string().describe('Feature name to track')
    })
  }, async ({ feature }) => {
    try {
      const output = toolsModule.cmdStart(feature);
      return { content: [{ type: 'text', text: output }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  });

  server.registerTool('ctoc_step', {
    description: 'Move to a specific Iron Loop step (1-15)',
    inputSchema: z.object({
      step: z.number().min(1).max(15).describe('Step number (1-15)')
    })
  }, async ({ step }) => {
    try {
      const output = toolsModule.cmdStep(step);
      return { content: [{ type: 'text', text: output }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('Failed to start MCP server:', err.message);
  process.exit(1);
});
