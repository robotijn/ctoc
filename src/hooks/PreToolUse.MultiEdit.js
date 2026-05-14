#!/usr/bin/env node
/**
 * CTOC v7 PreToolUse Enforcement Hook — MultiEdit
 *
 * Delegates to PreToolUse.Edit.js. The unified hook reads `tool_name` from
 * stdin so logs distinguish MultiEdit from Edit/Write.
 */
require('./PreToolUse.Edit.js');
