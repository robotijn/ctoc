/**
 * CTOC Crypto Library
 * HMAC-SHA256 state signing and verification
 *
 * Part of the "Holy Trinity" of enforcement (Layer 2)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CTOC_HOME = path.join(os.homedir(), '.ctoc');
const SECRET_FILE = path.join(CTOC_HOME, '.secret');
const SECRET_LENGTH = 64; // 512 bits

/**
 * Gets the installation secret, creating one if it doesn't exist
 */
function getInstallationSecret() {
  if (!fs.existsSync(CTOC_HOME)) {
    fs.mkdirSync(CTOC_HOME, { recursive: true });
  }

  if (fs.existsSync(SECRET_FILE)) {
    try {
      const secret = fs.readFileSync(SECRET_FILE);
      if (secret.length >= SECRET_LENGTH) {
        return secret;
      }
    } catch (e) {
      // Regenerate
    }
  }

  const secret = crypto.randomBytes(SECRET_LENGTH);
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

/**
 * Creates a canonical JSON string for signing (sorted keys)
 */
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(key => {
    return JSON.stringify(key) + ':' + canonicalStringify(obj[key]);
  });

  return '{' + parts.join(',') + '}';
}

/**
 * Deep copy object, omitting specified keys
 */
function omit(obj, keysToOmit) {
  const result = {};
  for (const key of Object.keys(obj)) {
    if (!keysToOmit.includes(key)) {
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        result[key] = omit(obj[key], keysToOmit);
      } else {
        result[key] = obj[key];
      }
    }
  }
  return result;
}

/**
 * Signs a state object with HMAC-SHA256
 */
function signState(state) {
  const secret = getInstallationSecret();
  const stateToSign = omit(state, ['_signature']);
  const data = canonicalStringify(stateToSign);

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = 'hmac-sha256:' + hmac.digest('hex');

  return { ...state, _signature: signature };
}

/**
 * Verifies a signed state object
 */
function verifyState(state) {
  if (!state) {
    return { valid: false, error: 'State is null or undefined' };
  }

  if (!state._signature) {
    return { valid: false, error: 'State is not signed (missing _signature)' };
  }

  if (!state._signature.startsWith('hmac-sha256:')) {
    return { valid: false, error: 'Invalid signature format' };
  }

  const secret = getInstallationSecret();
  const stateToVerify = omit(state, ['_signature']);
  const data = canonicalStringify(stateToVerify);

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const expected = 'hmac-sha256:' + hmac.digest('hex');

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(state._signature, 'utf8')
    );

    if (isValid) {
      return { valid: true };
    } else {
      return { valid: false, error: 'Signature mismatch - state may have been tampered' };
    }
  } catch (e) {
    return { valid: false, error: 'Signature verification failed' };
  }
}

/**
 * Creates a hash of file content for gate approval tracking
 */
function hashFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  } catch (e) {
    return null;
  }
}

/**
 * Creates a hash of a path for unique identification
 */
function hashPath(projectPath) {
  return crypto
    .createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .substring(0, 16);
}

module.exports = {
  getInstallationSecret,
  signState,
  verifyState,
  hashFile,
  hashPath,
  canonicalStringify,
  omit,
  CTOC_HOME
};
