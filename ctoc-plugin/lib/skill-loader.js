/**
 * CTOC Skill Loader
 * On-demand skill loading with embedded files and remote fallback
 *
 * Priority:
 * 1. Embedded skills (skills/languages/ and skills/frameworks/)
 * 2. Cache (24hr TTL)
 * 3. Remote fetch from GitHub
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { CTOC_HOME } = require('./crypto');

const CACHE_DIR = path.join(CTOC_HOME, 'cache', 'skills');
const PLUGIN_DIR = path.join(__dirname, '..');
const EMBEDDED_SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');
const SKILLS_INDEX_URL = 'https://raw.githubusercontent.com/ctoc-dev/ctoc/main/ctoc-plugin/data/skills-index.json';
const SKILL_BASE_URL = 'https://raw.githubusercontent.com/ctoc-dev/ctoc/main/.ctoc/skills';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Ensures cache directory exists
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Fetches content from a URL
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Gets cached content if still valid
 */
function getCached(cacheKey) {
  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, cacheKey + '.json');

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.content;
    }
  } catch (e) {
    // Cache invalid
  }

  return null;
}

/**
 * Saves content to cache
 */
function setCache(cacheKey, content) {
  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, cacheKey + '.json');

  fs.writeFileSync(cachePath, JSON.stringify({
    timestamp: Date.now(),
    content
  }));
}

/**
 * Loads embedded skill from plugin's skills directory
 * @param {string} skillName - Name of the skill
 * @param {string} type - 'language' or 'framework'
 * @param {string} category - Category for frameworks (e.g., 'web', 'ai-ml')
 * @returns {string|null} Skill content or null if not found
 */
function loadEmbeddedSkill(skillName, type, category = null) {
  let skillPath;

  if (type === 'language') {
    skillPath = path.join(EMBEDDED_SKILLS_DIR, 'languages', `${skillName}.md`);
  } else if (type === 'framework' && category) {
    skillPath = path.join(EMBEDDED_SKILLS_DIR, 'frameworks', category, `${skillName}.md`);
  } else {
    return null;
  }

  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, 'utf8');
  }

  return null;
}

/**
 * Loads the skills index
 * Priority: local embedded > cache > remote
 */
async function loadSkillsIndex() {
  // First, try local embedded index
  const localIndex = path.join(PLUGIN_DIR, 'data', 'skills-index.json');
  if (fs.existsSync(localIndex)) {
    try {
      return JSON.parse(fs.readFileSync(localIndex, 'utf8'));
    } catch (e) {
      // Fall through to cache
    }
  }

  // Try cache
  const cached = getCached('index');
  if (cached) {
    return cached;
  }

  // Fetch remote as last resort
  try {
    const content = await fetchUrl(SKILLS_INDEX_URL);
    const index = JSON.parse(content);
    setCache('index', index);
    return index;
  } catch (e) {
    throw new Error('Failed to load skills index: ' + e.message);
  }
}

/**
 * Loads a skill by name
 * Priority: embedded > cache > remote
 */
async function loadSkill(skillName, type = 'language') {
  const cacheKey = `${type}-${skillName}`;

  // Get category for frameworks
  let category = null;
  if (type === 'framework') {
    const index = await loadSkillsIndex();
    const framework = index.frameworks?.find(f => f.name === skillName);
    if (framework) {
      category = framework.category;
    } else {
      throw new Error(`Framework skill not found: ${skillName}`);
    }
  }

  // 1. Try embedded first (instant, no network fetch needed)
  const embedded = loadEmbeddedSkill(skillName, type, category);
  if (embedded) {
    return embedded;
  }

  // 2. Try cache
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  // 3. Fetch from remote
  let url;
  if (type === 'language') {
    url = `${SKILL_BASE_URL}/languages/${skillName}.md`;
  } else if (type === 'framework' && category) {
    url = `${SKILL_BASE_URL}/frameworks/${category}/${skillName}.md`;
  } else {
    throw new Error(`Unknown skill type: ${type}`);
  }

  try {
    const content = await fetchUrl(url);
    setCache(cacheKey, content);
    return content;
  } catch (e) {
    throw new Error(`Failed to load skill ${skillName}: ${e.message}`);
  }
}

/**
 * Checks if a skill is available (embedded or fetchable)
 */
async function hasSkill(skillName, type = 'language') {
  try {
    // Quick check for embedded
    let category = null;
    if (type === 'framework') {
      const index = await loadSkillsIndex();
      const framework = index.frameworks?.find(f => f.name === skillName);
      if (framework) {
        category = framework.category;
      }
    }

    const embedded = loadEmbeddedSkill(skillName, type, category);
    if (embedded) return true;

    // Check cache
    const cacheKey = `${type}-${skillName}`;
    const cached = getCached(cacheKey);
    if (cached) return true;

    // Check index
    const index = await loadSkillsIndex();
    if (type === 'language') {
      return index.languages?.some(l => l.name === skillName);
    } else {
      return index.frameworks?.some(f => f.name === skillName);
    }
  } catch (e) {
    return false;
  }
}

/**
 * Gets skills for detected stack
 */
async function getSkillsForStack(stack) {
  const skills = [];

  // Load language skill
  if (stack.primary.language) {
    try {
      const skill = await loadSkill(stack.primary.language, 'language');
      skills.push({ type: 'language', name: stack.primary.language, content: skill });
    } catch (e) {
      // Skill not available
    }
  }

  // Load framework skill
  if (stack.primary.framework) {
    try {
      const skill = await loadSkill(stack.primary.framework, 'framework');
      skills.push({ type: 'framework', name: stack.primary.framework, content: skill });
    } catch (e) {
      // Skill not available
    }
  }

  return skills;
}

/**
 * Lists available skills
 */
async function listSkills() {
  const index = await loadSkillsIndex();
  return {
    languages: index.languages || [],
    frameworks: index.frameworks || [],
    counts: index.counts || { languages: 50, frameworks: { total: 211 }, total: 261 }
  };
}

/**
 * Gets count of embedded skills
 */
function getEmbeddedSkillsCounts() {
  const counts = {
    languages: 0,
    frameworks: { web: 0, 'ai-ml': 0, data: 0, devops: 0, mobile: 0, total: 0 }
  };

  // Count languages
  const langDir = path.join(EMBEDDED_SKILLS_DIR, 'languages');
  if (fs.existsSync(langDir)) {
    counts.languages = fs.readdirSync(langDir).filter(f => f.endsWith('.md')).length;
  }

  // Count frameworks by category
  const fwDir = path.join(EMBEDDED_SKILLS_DIR, 'frameworks');
  if (fs.existsSync(fwDir)) {
    for (const category of ['web', 'ai-ml', 'data', 'devops', 'mobile']) {
      const catDir = path.join(fwDir, category);
      if (fs.existsSync(catDir)) {
        const count = fs.readdirSync(catDir).filter(f => f.endsWith('.md')).length;
        counts.frameworks[category] = count;
        counts.frameworks.total += count;
      }
    }
  }

  return counts;
}

/**
 * Clears skill cache
 */
function clearCache() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
  }
}

module.exports = {
  loadSkillsIndex,
  loadSkill,
  loadEmbeddedSkill,
  hasSkill,
  getSkillsForStack,
  listSkills,
  getEmbeddedSkillsCounts,
  clearCache,
  CACHE_DIR,
  EMBEDDED_SKILLS_DIR
};
