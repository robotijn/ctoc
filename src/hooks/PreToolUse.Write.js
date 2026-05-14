#!/usr/bin/env node
/**
 * CTOC v7 PreToolUse Enforcement Hook — Write
 *
 * Delegates to PreToolUse.Edit.js — same plan-coverage logic for both
 * Edit and Write operations. The unified hook reads `tool_name` from stdin
 * so logs distinguish which tool fired.
 */
require('./PreToolUse.Edit.js');
