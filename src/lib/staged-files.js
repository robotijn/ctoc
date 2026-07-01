/**
 * CTOC Staged Files Utilities (v10 RED/BLUE hardened)
 *
 * Utilities for working with Git staged files.
 *
 * RED/BLUE TEAM HARDENING NOTES:
 * - R1: Safe handling of filenames with special characters
 * - R2: Symlink attack prevention
 * - R3: Binary file detection
 * - R4: Size limit enforcement
 * - R5: Path traversal prevention
 * - B1: Efficient file filtering
 * - B2: Support for all git diff filters
 * - B3: Cached results for performance
 * - B4: Comprehensive file metadata
 * - B5: Batch operations support
 */

const fs = require('fs');
const safeFs = require('./safe-fs');
const path = require('path');
const { execSync } = require('child_process');

// ==============================================================================
// CONSTANTS
// ==============================================================================

const DIFF_FILTERS = {
  ADDED: 'A',
  COPIED: 'C',
  DELETED: 'D',
  MODIFIED: 'M',
  RENAMED: 'R',
  TYPE_CHANGED: 'T',
  UNMERGED: 'U',
  UNKNOWN: 'X',
  BROKEN: 'B'
};

const DEFAULT_FILTER = 'ACM';  // Added, Copied, Modified

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.tiff',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.a', '.o',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.sqlite', '.db', '.mdb'
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;  // 5MB

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================

/**
 * Check if file exists and is not a symlink attack
 */
function safeFileExists(filePath, repoRoot) {
  try {
    const resolvedPath = safeFs.realpathSync(filePath);
    const resolvedRoot = safeFs.realpathSync(repoRoot);

    // Ensure file is within repo
    if (!resolvedPath.startsWith(resolvedRoot)) {
      return false;
    }

    return safeFs.existsSync(resolvedPath);
  } catch {
    return false;
  }
}

/**
 * Get file stats safely
 */
function safeStats(filePath) {
  try {
    return safeFs.statSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Check if file is binary based on extension
 */
function isBinaryExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if file is binary by reading first bytes
 */
function isBinaryContent(filePath) {
  try {
    const buffer = Buffer.alloc(8000);
    const fd = safeFs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 8000, 0);
    fs.closeSync(fd);

    // Check for null bytes (binary indicator)
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ==============================================================================
// STAGED FILES CLASS
// ==============================================================================

class StagedFiles {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || process.cwd();
    this.filter = options.filter || DEFAULT_FILTER;
    this._cache = null;
    this._cacheTime = 0;
    this._cacheTTL = 1000;  // 1 second cache
  }

  /**
   * Get list of staged files
   */
  getFiles(options = {}) {
    const { filter = this.filter, force = false } = options;

    // Return cached result if valid
    if (!force && this._cache && (Date.now() - this._cacheTime) < this._cacheTTL) {
      return this._cache;
    }

    try {
      // Use -z for null-separated output (handles special characters)
      const result = execSync(
        `git diff --cached --name-only --diff-filter=${filter} -z`,
        {
          cwd: this.repoRoot,
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024  // 10MB buffer
        }
      );

      // Split by null character, filter empty strings
      const files = result.split('\0').filter(f => f.length > 0);

      // Cache result
      this._cache = files;
      this._cacheTime = Date.now();

      return files;
    } catch (error) {
      console.error(`Failed to get staged files: ${error.message}`);
      return [];
    }
  }

  /**
   * Get staged files with full metadata
   */
  getFilesWithMetadata(options = {}) {
    const files = this.getFiles(options);

    return files.map(file => {
      const fullPath = path.join(this.repoRoot, file);
      const stats = safeStats(fullPath);

      return {
        path: file,
        fullPath: fullPath,
        extension: path.extname(file).toLowerCase(),
        directory: path.dirname(file),
        basename: path.basename(file),
        exists: safeFileExists(fullPath, this.repoRoot),
        size: stats?.size || 0,
        isBinary: isBinaryExtension(file),
        isOversize: stats ? stats.size > MAX_FILE_SIZE_BYTES : false
      };
    });
  }

  /**
   * Get staged files by extension
   */
  getByExtension(extensions, options = {}) {
    if (!Array.isArray(extensions)) {
      extensions = [extensions];
    }

    // Normalize extensions (add dot if missing)
    extensions = extensions.map(ext =>
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );

    const files = this.getFiles(options);
    return files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return extensions.includes(ext);
    });
  }

  /**
   * Get staged files by directory
   */
  getByDirectory(directories, options = {}) {
    if (!Array.isArray(directories)) {
      directories = [directories];
    }

    // Normalize directories
    directories = directories.map(dir => dir.replace(/\/$/, ''));

    const files = this.getFiles(options);
    return files.filter(file => {
      const fileDir = path.dirname(file);
      return directories.some(dir =>
        fileDir === dir || fileDir.startsWith(`${dir}/`)
      );
    });
  }

  /**
   * Get staged files matching a pattern
   */
  getByPattern(pattern, options = {}) {
    const files = this.getFiles(options);
    const regex = new RegExp(pattern);
    return files.filter(file => regex.test(file));
  }

  /**
   * Get staged JavaScript/TypeScript files
   */
  getJavaScript() {
    return this.getByExtension(['.js', '.jsx', '.mjs', '.cjs']);
  }

  getTypeScript() {
    return this.getByExtension(['.ts', '.tsx']);
  }

  getJsTs() {
    return this.getByExtension(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
  }

  /**
   * Get staged Python files
   */
  getPython() {
    return this.getByExtension(['.py', '.pyi']);
  }

  /**
   * Get staged Go files
   */
  getGo() {
    return this.getByExtension(['.go']);
  }

  /**
   * Get staged Rust files
   */
  getRust() {
    return this.getByExtension(['.rs']);
  }

  /**
   * Get staged config files
   */
  getConfig() {
    return this.getByExtension(['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg']);
  }

  /**
   * Get staged documentation files
   */
  getDocs() {
    return this.getByExtension(['.md', '.mdx', '.rst', '.txt']);
  }

  /**
   * Get staged shell scripts
   */
  getShell() {
    const byExt = this.getByExtension(['.sh', '.bash', '.zsh']);
    const byPattern = this.getByPattern(/^[^.]+$/);  // Files without extension

    // Filter pattern matches by checking shebang
    const shellScripts = byPattern.filter(file => {
      const fullPath = path.join(this.repoRoot, file);
      if (!safeFileExists(fullPath, this.repoRoot)) return false;

      try {
        // readFileSync takes no length option; the previous { length: 100 }
        // third argument was silently ignored by Node and is removed here.
        // Behavior is otherwise unchanged: detect a shell shebang.
        const content = safeFs.readFileSync(fullPath, 'utf8');
        return content.startsWith('#!') && content.includes('sh');
      } catch {
        return false;
      }
    });

    return [...new Set([...byExt, ...shellScripts])];
  }

  /**
   * Get files that exceed size limit
   */
  getOversized(maxSizeBytes = MAX_FILE_SIZE_BYTES) {
    const files = this.getFilesWithMetadata();
    return files.filter(f => f.size > maxSizeBytes);
  }

  /**
   * Get binary files that shouldn't be committed
   */
  getBinaryFiles() {
    const files = this.getFilesWithMetadata();
    return files.filter(f => f.isBinary || (f.exists && isBinaryContent(f.fullPath)));
  }

  /**
   * Check if any staged files match sensitive patterns
   */
  getSensitiveFiles() {
    const sensitivePatterns = [
      /\.env$/,
      /\.env\./,
      /credentials/i,
      /secret/i,
      /\.pem$/,
      /\.key$/,
      /id_rsa/,
      /id_ed25519/,
      /\.p12$/,
      /\.pfx$/
    ];

    const files = this.getFiles();
    return files.filter(file =>
      sensitivePatterns.some(pattern => pattern.test(file))
    );
  }

  /**
   * Get total size of staged files
   */
  getTotalSize() {
    const files = this.getFilesWithMetadata();
    return files.reduce((total, file) => total + file.size, 0);
  }

  /**
   * Get file count summary by extension
   */
  getSummary() {
    const files = this.getFilesWithMetadata();
    const summary = {};

    for (const file of files) {
      const ext = file.extension || '(no extension)';
      if (!summary[ext]) {
        summary[ext] = { count: 0, size: 0 };
      }
      summary[ext].count++;
      summary[ext].size += file.size;
    }

    return summary;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this._cache = null;
    this._cacheTime = 0;
  }
}

// ==============================================================================
// CONVENIENCE FUNCTIONS
// ==============================================================================

/**
 * Get staged files for current directory
 */
function getStagedFiles(options = {}) {
  const staged = new StagedFiles(options);
  return staged.getFiles();
}

/**
 * Get staged files by extension for current directory
 */
function getStagedByExtension(extensions, options = {}) {
  const staged = new StagedFiles(options);
  return staged.getByExtension(extensions);
}

/**
 * Check if there are any staged files
 */
function hasStagedFiles(options = {}) {
  const files = getStagedFiles(options);
  return files.length > 0;
}

/**
 * Get staged files matching language
 */
function getStagedByLanguage(language, options = {}) {
  const staged = new StagedFiles(options);

  switch (language.toLowerCase()) {
    case 'javascript':
      return staged.getJavaScript();
    case 'typescript':
      return staged.getTypeScript();
    case 'jsts':
    case 'js-ts':
      return staged.getJsTs();
    case 'python':
      return staged.getPython();
    case 'go':
    case 'golang':
      return staged.getGo();
    case 'rust':
      return staged.getRust();
    case 'shell':
    case 'bash':
      return staged.getShell();
    default:
      return [];
  }
}

// ==============================================================================
// EXPORTS
// ==============================================================================

module.exports = {
  StagedFiles,
  getStagedFiles,
  getStagedByExtension,
  getStagedByLanguage,
  hasStagedFiles,
  DIFF_FILTERS,
  DEFAULT_FILTER,
  MAX_FILE_SIZE_BYTES,
  BINARY_EXTENSIONS
};
