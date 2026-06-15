#!/usr/bin/env node
/**
 * Hash Utilities
 *
 * File hashing utilities for smart test selection.
 * Uses SHA256 to track file changes and detect what needs testing.
 *
 * @module lib/hash-utils
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Hash algorithm used for all file hashing
 */
const HASH_ALGORITHM = 'sha256';

/**
 * Hash a file's contents
 * @param {string} filePath - Absolute path to file
 * @returns {string|null} SHA256 hash or null if file doesn't exist
 */
function hashFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash(HASH_ALGORITHM);
    hash.update(content);
    return hash.digest('hex');
  } catch (err) {
    console.warn(`Warning: Could not hash file ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Hash a string (useful for content comparison)
 * @param {string} content - String to hash
 * @returns {string} SHA256 hash
 */
function hashString(content) {
  const hash = crypto.createHash(HASH_ALGORITHM);
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Hash multiple files and return a map
 * @param {string[]} filePaths - Array of file paths
 * @returns {Object} Map of filePath -> hash
 */
function hashFiles(filePaths) {
  const hashes = {};

  for (const filePath of filePaths) {
    const hash = hashFile(filePath);
    if (hash) {
      hashes[filePath] = hash;
    }
  }

  return hashes;
}

/**
 * Compare current file hash to cached hash
 * @param {string} filePath - File to check
 * @param {string} cachedHash - Previously stored hash
 * @returns {Object} Comparison result
 */
function hasFileChanged(filePath, cachedHash) {
  const currentHash = hashFile(filePath);

  if (!currentHash) {
    return {
      changed: true,
      reason: 'file_missing',
      currentHash: null,
      cachedHash
    };
  }

  if (!cachedHash) {
    return {
      changed: true,
      reason: 'no_cache',
      currentHash,
      cachedHash: null
    };
  }

  const changed = currentHash !== cachedHash;

  return {
    changed,
    reason: changed ? 'content_changed' : 'unchanged',
    currentHash,
    cachedHash
  };
}

/**
 * Find files that have changed compared to cached hashes
 * @param {string[]} filePaths - Files to check
 * @param {Object} cachedHashes - Map of filePath -> cached hash
 * @returns {Object} Changed files info
 */
function findChangedFiles(filePaths, cachedHashes = {}) {
  const result = {
    changed: [],
    unchanged: [],
    missing: [],
    newFiles: [],
    currentHashes: {}
  };

  for (const filePath of filePaths) {
    const cachedHash = cachedHashes[filePath];
    const comparison = hasFileChanged(filePath, cachedHash);

    result.currentHashes[filePath] = comparison.currentHash;

    if (comparison.reason === 'file_missing') {
      result.missing.push(filePath);
    } else if (comparison.reason === 'no_cache') {
      result.newFiles.push(filePath);
      result.changed.push(filePath);
    } else if (comparison.changed) {
      result.changed.push(filePath);
    } else {
      result.unchanged.push(filePath);
    }
  }

  return result;
}

/**
 * Generate a combined hash for multiple files (useful for cache keys)
 * @param {string[]} filePaths - Files to hash
 * @returns {string} Combined hash
 */
function hashFilesComposite(filePaths) {
  const sortedPaths = [...filePaths].sort();
  const hashes = [];

  for (const filePath of sortedPaths) {
    const hash = hashFile(filePath);
    if (hash) {
      hashes.push(`${filePath}:${hash}`);
    }
  }

  return hashString(hashes.join('\n'));
}

/**
 * Create a hash entry for the coverage map
 * @param {string} filePath - File path
 * @returns {Object} Hash entry with metadata
 */
function createHashEntry(filePath) {
  const hash = hashFile(filePath);
  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

  return {
    hash,
    lastModified: stats ? stats.mtime.toISOString() : null,
    size: stats ? stats.size : null
  };
}

/**
 * Verify integrity of a file against expected hash
 * @param {string} filePath - File to verify
 * @param {string} expectedHash - Expected SHA256 hash
 * @returns {Object} Verification result
 */
function verifyFileIntegrity(filePath, expectedHash) {
  const currentHash = hashFile(filePath);

  if (!currentHash) {
    return {
      valid: false,
      error: 'File does not exist or cannot be read'
    };
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(currentHash, 'hex')
    );

    return {
      valid: isValid,
      currentHash,
      expectedHash
    };
  } catch {
    // Lengths don't match
    return {
      valid: false,
      error: 'Hash length mismatch',
      currentHash,
      expectedHash
    };
  }
}

/**
 * Hash a directory recursively (for monorepo package detection)
 * @param {string} dirPath - Directory to hash
 * @param {Object} options - Options
 * @returns {Object} Directory hash info
 */
function hashDirectory(dirPath, options = {}) {
  const {
    exclude = ['node_modules', '.git', 'dist', 'build', 'coverage'],
    maxDepth = 10
  } = options;

  const files = [];

  function walkDir(dir, depth = 0) {
    if (depth > maxDepth) return;
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dirPath, fullPath);

      // Check exclusions
      const shouldExclude = exclude.some(pattern => {
        if (pattern.includes('*')) {
          // Simple glob matching
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(relativePath);
        }
        return relativePath.includes(pattern) || entry.name === pattern;
      });

      if (shouldExclude) continue;

      if (entry.isDirectory()) {
        walkDir(fullPath, depth + 1);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walkDir(dirPath);

  const hashes = hashFiles(files);
  const compositeHash = hashFilesComposite(files);

  return {
    directory: dirPath,
    fileCount: files.length,
    files: hashes,
    compositeHash
  };
}

module.exports = {
  // Core hashing
  hashFile,
  hashString,
  hashFiles,
  hashFilesComposite,

  // Change detection
  hasFileChanged,
  findChangedFiles,

  // Utilities
  createHashEntry,
  verifyFileIntegrity,
  hashDirectory,

  // Constants
  HASH_ALGORITHM
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: hash-utils.js <file|directory>');
    process.exit(1);
  }

  const target = path.resolve(args[0]);

  if (fs.statSync(target).isDirectory()) {
    const result = hashDirectory(target);
    console.log(`Directory: ${result.directory}`);
    console.log(`Files: ${result.fileCount}`);
    console.log(`Composite hash: ${result.compositeHash}`);
  } else {
    const hash = hashFile(target);
    console.log(`${hash}  ${target}`);
  }
}
