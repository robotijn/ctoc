/**
 * CTOC Profile Loader
 * Loads and injects CTO profiles into agent prompts
 */

const fs = require('fs');
const path = require('path');
const { getCTOCRoot, readFileSafe, log, warn } = require('./utils');
const { detectStack, getProfilePath, profileExists } = require('./stack-detector');

// ============================================================================
// Profile Section Extraction
// ============================================================================

/**
 * Sections relevant to each agent type
 */
const AGENT_SECTIONS = {
  'cto-coordinator': ['Overview', 'Stack', 'Commands'],
  'planning-assistant': ['Overview', 'Architecture Patterns', 'Best Practices'],
  'unit-test-writer': ['Testing Strategy', 'Test Commands', 'Test Framework', 'Testing Patterns'],
  'integration-test-writer': ['Testing Strategy', 'Test Commands', 'Integration Testing'],
  'e2e-test-writer': ['Testing Strategy', 'E2E Testing', 'Test Commands'],
  'property-test-writer': ['Testing Strategy', 'Property-Based Testing'],
  'unit-test-runner': ['Test Commands', 'Coverage Requirements'],
  'integration-test-runner': ['Test Commands', 'Integration Testing'],
  'e2e-test-runner': ['Test Commands', 'E2E Testing'],
  'smoke-test-runner': ['Test Commands', 'Smoke Testing'],
  'mutation-test-runner': ['Test Commands', 'Mutation Testing'],
  'type-checker': ['Type System', 'Type Checking', 'Strict Mode', 'Commands'],
  'code-reviewer': ['Red Lines', 'Non-Negotiables', 'Anti-Patterns', 'Common Mistakes', 'Best Practices'],
  'architecture-checker': ['Architecture Patterns', 'Design Patterns', 'Best Practices'],
  'complexity-analyzer': ['Code Quality', 'Complexity', 'Maintainability'],
  'consistency-checker': ['Code Style', 'Naming Conventions', 'Best Practices'],
  'code-smell-detector': ['Anti-Patterns', 'Code Smells', 'Common Mistakes'],
  'duplicate-code-detector': ['DRY', 'Code Duplication', 'Refactoring'],
  'dead-code-detector': ['Dead Code', 'Unused Code', 'Cleanup'],
  'security-scanner': ['Security', 'Security Checklist', 'Common Vulnerabilities', 'OWASP'],
  'secrets-detector': ['Security', 'Secrets', 'Environment Variables'],
  'dependency-checker': ['Dependencies', 'Package Management', 'Version Management'],
  'input-validation-checker': ['Security', 'Input Validation', 'Sanitization'],
  'concurrency-checker': ['Concurrency', 'Thread Safety', 'Async Patterns'],
  'performance-profiler': ['Performance', 'Optimization', 'Profiling'],
  'accessibility-checker': ['Accessibility', 'A11y', 'WCAG'],
  'database-reviewer': ['Database', 'ORM', 'Migrations', 'SQL'],
  'api-contract-validator': ['API', 'REST', 'GraphQL', 'OpenAPI'],
  'translation-checker': ['i18n', 'Internationalization', 'Localization'],
  'observability-checker': ['Logging', 'Monitoring', 'Observability', 'Tracing'],
  'error-handler-checker': ['Error Handling', 'Exceptions', 'Error Patterns'],
  'resilience-checker': ['Resilience', 'Circuit Breaker', 'Retry', 'Fallback'],
  'health-check-validator': ['Health Checks', 'Readiness', 'Liveness'],
  'memory-safety-checker': ['Memory', 'Memory Safety', 'Memory Leaks'],
  'configuration-validator': ['Configuration', 'Environment', 'Settings'],
  'visual-regression-checker': ['Visual Testing', 'Screenshot Testing'],
  'component-tester': ['Component Testing', 'Unit Testing', 'React Testing'],
  'bundle-analyzer': ['Bundle Size', 'Code Splitting', 'Tree Shaking'],
  'ios-checker': ['iOS', 'Swift', 'Xcode'],
  'android-checker': ['Android', 'Kotlin', 'Gradle'],
  'react-native-bridge-checker': ['React Native', 'Native Bridge', 'Turbo Modules'],
  'terraform-validator': ['Terraform', 'IaC', 'Infrastructure'],
  'kubernetes-checker': ['Kubernetes', 'K8s', 'Container Orchestration'],
  'docker-security-checker': ['Docker', 'Container Security', 'Dockerfile'],
  'ci-pipeline-checker': ['CI/CD', 'GitHub Actions', 'Pipeline'],
  'documentation-updater': ['Documentation', 'API Docs', 'README'],
  'changelog-generator': ['Changelog', 'Release Notes', 'Versioning'],
  'gdpr-compliance-checker': ['GDPR', 'Privacy', 'Data Protection'],
  'audit-log-checker': ['Audit', 'Logging', 'Compliance'],
  'license-scanner': ['License', 'Open Source', 'Compliance'],
  'data-quality-checker': ['Data Quality', 'Data Validation', 'Schema'],
  'ml-model-validator': ['ML', 'Model Validation', 'AI'],
  'feature-store-validator': ['Feature Store', 'ML Features'],
  'cloud-cost-analyzer': ['Cloud', 'Cost', 'Optimization'],
  'hallucination-detector': ['AI', 'Hallucination', 'Verification'],
  'ai-code-quality-reviewer': ['AI', 'Code Quality', 'Generated Code'],
  'onboarding-validator': ['Onboarding', 'Setup', 'Developer Experience'],
  'api-deprecation-checker': ['Deprecation', 'API Changes', 'Migration'],
  'backwards-compatibility-checker': ['Compatibility', 'Breaking Changes', 'Semver'],
  'feature-flag-auditor': ['Feature Flags', 'Feature Toggles'],
  'technical-debt-tracker': ['Technical Debt', 'TODO', 'FIXME']
};

// ============================================================================
// Profile Loading
// ============================================================================

/**
 * Loads a profile from file
 */
function loadProfile(profilePath) {
  const content = readFileSafe(profilePath);
  if (!content) {
    return null;
  }
  return {
    path: profilePath,
    content: content,
    sections: parseProfileSections(content)
  };
}

/**
 * Parses a markdown profile into sections
 */
function parseProfileSections(content) {
  const sections = {};
  const lines = content.split('\n');
  let currentSection = 'header';
  let currentContent = [];

  for (const line of lines) {
    // Check for h2 or h3 headers
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    if (h2Match) {
      // Save previous section
      if (currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = h2Match[1].trim();
      currentContent = [];
    } else if (h3Match) {
      // Subsections are included in their parent
      currentContent.push(line);
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Extracts relevant sections for an agent type
 */
function extractSectionsForAgent(profile, agentType) {
  if (!profile || !profile.sections) {
    return '';
  }

  const relevantSections = AGENT_SECTIONS[agentType] || [];
  const extracted = [];

  for (const sectionName of relevantSections) {
    // Try exact match first
    if (profile.sections[sectionName]) {
      extracted.push(`## ${sectionName}\n${profile.sections[sectionName]}`);
      continue;
    }

    // Try case-insensitive match
    for (const [key, value] of Object.entries(profile.sections)) {
      if (key.toLowerCase().includes(sectionName.toLowerCase())) {
        extracted.push(`## ${key}\n${value}`);
        break;
      }
    }
  }

  // If no specific sections found, return key sections
  if (extracted.length === 0) {
    const defaultSections = ['Common Mistakes', 'Correct Patterns', 'Red Lines', 'Anti-Patterns'];
    for (const sectionName of defaultSections) {
      for (const [key, value] of Object.entries(profile.sections)) {
        if (key.toLowerCase().includes(sectionName.toLowerCase())) {
          extracted.push(`## ${key}\n${value}`);
          break;
        }
      }
    }
  }

  return extracted.join('\n\n');
}

/**
 * Loads profiles for a specific agent type based on detected stack
 */
function loadProfilesForAgent(agentType, projectPath) {
  const ctocRoot = getCTOCRoot();
  if (!ctocRoot) {
    warn('Could not find CTOC root directory');
    return { language: null, framework: null, combined: '' };
  }

  const stack = detectStack(projectPath);
  const result = {
    language: null,
    framework: null,
    combined: ''
  };

  const parts = [];

  // Load language profile
  if (stack.primary.language) {
    const langProfilePath = getProfilePath(ctocRoot, 'language', stack.primary.language);
    if (langProfilePath && fs.existsSync(langProfilePath)) {
      const langProfile = loadProfile(langProfilePath);
      if (langProfile) {
        result.language = langProfile;
        const extracted = extractSectionsForAgent(langProfile, agentType);
        if (extracted) {
          parts.push(`# ${stack.primary.language.toUpperCase()} Language Profile\n\n${extracted}`);
        }
      }
    }
  }

  // Load framework profile
  if (stack.primary.framework) {
    const frameworkProfilePath = getProfilePath(ctocRoot, 'framework', stack.primary.framework);
    if (frameworkProfilePath && fs.existsSync(frameworkProfilePath)) {
      const frameworkProfile = loadProfile(frameworkProfilePath);
      if (frameworkProfile) {
        result.framework = frameworkProfile;
        const extracted = extractSectionsForAgent(frameworkProfile, agentType);
        if (extracted) {
          parts.push(`# ${stack.primary.framework.toUpperCase()} Framework Profile\n\n${extracted}`);
        }
      }
    }
  }

  result.combined = parts.join('\n\n---\n\n');
  return result;
}

/**
 * Gets the full profile content for injection
 */
function getProfileContent(agentType, projectPath) {
  const profiles = loadProfilesForAgent(agentType, projectPath);
  return profiles.combined;
}

/**
 * Injects profiles into an agent specification
 */
function injectProfilesIntoAgent(agentSpec, projectPath) {
  if (!agentSpec) return agentSpec;

  // Extract agent name from frontmatter
  const nameMatch = agentSpec.match(/^---\n[\s\S]*?name:\s*([^\n]+)/);
  const agentType = nameMatch ? nameMatch[1].trim() : 'code-reviewer';

  // Get profiles
  const profiles = loadProfilesForAgent(agentType, projectPath);

  // Replace placeholders
  let result = agentSpec;
  result = result.replace(/\{\{LANGUAGE_PROFILE\}\}/g, profiles.language ? profiles.language.content : '');
  result = result.replace(/\{\{FRAMEWORK_PROFILE\}\}/g, profiles.framework ? profiles.framework.content : '');
  result = result.replace(/\{\{LANGUAGE_RED_LINES\}\}/g, profiles.language ?
    extractSectionsForAgent(profiles.language, 'code-reviewer') : '');
  result = result.replace(/\{\{FRAMEWORK_RED_LINES\}\}/g, profiles.framework ?
    extractSectionsForAgent(profiles.framework, 'code-reviewer') : '');
  result = result.replace(/\{\{COMBINED_PROFILES\}\}/g, profiles.combined);

  return result;
}

/**
 * Lists all available profiles
 */
function listProfiles() {
  const ctocRoot = getCTOCRoot();
  if (!ctocRoot) {
    return { languages: [], frameworks: [] };
  }

  const languagesDir = path.join(ctocRoot, '.ctoc', 'skills', 'languages');
  const frameworksDir = path.join(ctocRoot, '.ctoc', 'skills', 'frameworks');

  const languages = [];
  const frameworks = [];

  // List languages
  if (fs.existsSync(languagesDir)) {
    const files = fs.readdirSync(languagesDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        languages.push(file.replace('.md', ''));
      }
    }
  }

  // List frameworks (recursive through categories)
  if (fs.existsSync(frameworksDir)) {
    const categories = fs.readdirSync(frameworksDir);
    for (const category of categories) {
      const categoryPath = path.join(frameworksDir, category);
      if (fs.statSync(categoryPath).isDirectory()) {
        const files = fs.readdirSync(categoryPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            frameworks.push({
              name: file.replace('.md', ''),
              category: category
            });
          }
        }
      }
    }
  }

  return { languages, frameworks };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  AGENT_SECTIONS,
  loadProfile,
  parseProfileSections,
  extractSectionsForAgent,
  loadProfilesForAgent,
  getProfileContent,
  injectProfilesIntoAgent,
  listProfiles
};
