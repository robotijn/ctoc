/**
 * CTOC Stack Detector
 * Detects languages and frameworks in a project
 */

const fs = require('fs');
const path = require('path');

const LANGUAGE_PATTERNS = {
  python: {
    files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile', 'poetry.lock', 'uv.lock'],
    extensions: ['.py']
  },
  javascript: {
    files: ['package.json'],
    extensions: ['.js', '.mjs', '.cjs']
  },
  typescript: {
    files: ['tsconfig.json'],
    extensions: ['.ts', '.tsx']
  },
  go: {
    files: ['go.mod', 'go.sum'],
    extensions: ['.go']
  },
  rust: {
    files: ['Cargo.toml'],
    extensions: ['.rs']
  },
  java: {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    extensions: ['.java']
  },
  kotlin: {
    files: ['build.gradle.kts'],
    extensions: ['.kt', '.kts']
  },
  ruby: {
    files: ['Gemfile', 'Rakefile'],
    extensions: ['.rb']
  },
  php: {
    files: ['composer.json'],
    extensions: ['.php']
  },
  csharp: {
    files: ['*.csproj', '*.sln'],
    extensions: ['.cs']
  },
  elixir: {
    files: ['mix.exs'],
    extensions: ['.ex', '.exs']
  },
  swift: {
    files: ['Package.swift'],
    extensions: ['.swift']
  },
  dart: {
    files: ['pubspec.yaml'],
    extensions: ['.dart']
  },
  zig: {
    files: ['build.zig'],
    extensions: ['.zig']
  }
};

const FRAMEWORK_PATTERNS = {
  // JavaScript/TypeScript
  'next.js': { language: 'typescript', files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], deps: ['next'] },
  react: { language: 'typescript', deps: ['react'] },
  vue: { language: 'typescript', files: ['vue.config.js', 'vite.config.ts'], deps: ['vue'] },
  angular: { language: 'typescript', files: ['angular.json'], deps: ['@angular/core'] },
  svelte: { language: 'typescript', files: ['svelte.config.js'], deps: ['svelte'] },
  express: { language: 'javascript', deps: ['express'] },
  nestjs: { language: 'typescript', files: ['nest-cli.json'], deps: ['@nestjs/core'] },

  // Python
  fastapi: { language: 'python', deps: ['fastapi'] },
  django: { language: 'python', files: ['manage.py'], deps: ['django'] },
  flask: { language: 'python', deps: ['flask'] },
  pytorch: { language: 'python', deps: ['torch'] },
  tensorflow: { language: 'python', deps: ['tensorflow'] },

  // Go
  gin: { language: 'go', deps: ['github.com/gin-gonic/gin'] },
  echo: { language: 'go', deps: ['github.com/labstack/echo'] },
  fiber: { language: 'go', deps: ['github.com/gofiber/fiber'] },

  // Rust
  actix: { language: 'rust', deps: ['actix-web'] },
  rocket: { language: 'rust', deps: ['rocket'] },
  axum: { language: 'rust', deps: ['axum'] },

  // Java
  'spring-boot': { language: 'java', deps: ['spring-boot-starter'] },

  // Ruby
  rails: { language: 'ruby', files: ['config/routes.rb'], deps: ['rails'] },

  // PHP
  laravel: { language: 'php', files: ['artisan'], deps: ['laravel/framework'] },

  // Mobile
  'react-native': { language: 'typescript', files: ['metro.config.js'], deps: ['react-native'] },
  flutter: { language: 'dart', deps: ['flutter'] },
  expo: { language: 'typescript', deps: ['expo'] },

  // DevOps
  docker: { language: null, files: ['Dockerfile', 'docker-compose.yml'] },
  kubernetes: { language: null, files: ['deployment.yaml', 'service.yaml'] }
};

/**
 * Simple glob matching
 */
function matchGlob(str, pattern) {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexPattern}$`).test(str);
}

/**
 * Detects languages in a project
 */
function detectLanguages(projectPath) {
  projectPath = projectPath || process.cwd();
  const detected = [];

  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    let found = false;

    for (const file of patterns.files) {
      if (file.includes('*')) {
        try {
          const files = fs.readdirSync(projectPath);
          if (files.some(f => matchGlob(f, file))) {
            found = true;
            break;
          }
        } catch (e) {}
      } else {
        if (fs.existsSync(path.join(projectPath, file))) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      detected.push(language);
    }
  }

  // Prefer TypeScript over JavaScript
  if (detected.includes('typescript') && detected.includes('javascript')) {
    const idx = detected.indexOf('javascript');
    if (idx > -1) detected.splice(idx, 1);
  }

  return detected;
}

/**
 * Reads package.json dependencies
 */
function readPackageDeps(projectPath) {
  const pkgPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch (e) {
    return {};
  }
}

/**
 * Reads requirements.txt dependencies
 */
function readPythonDeps(projectPath) {
  const reqPath = path.join(projectPath, 'requirements.txt');
  if (!fs.existsSync(reqPath)) return [];

  try {
    return fs.readFileSync(reqPath, 'utf8').split('\n').map(l => l.trim().split(/[=<>]/)[0]);
  } catch (e) {
    return [];
  }
}

/**
 * Detects frameworks in a project
 */
function detectFrameworks(projectPath, languages) {
  projectPath = projectPath || process.cwd();
  languages = languages || detectLanguages(projectPath);
  const detected = [];

  const nodeDeps = readPackageDeps(projectPath);
  const pythonDeps = readPythonDeps(projectPath);

  for (const [framework, config] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (config.language && !languages.includes(config.language) && config.language !== null) {
      continue;
    }

    let found = false;

    // Check files
    if (config.files) {
      for (const file of config.files) {
        if (fs.existsSync(path.join(projectPath, file))) {
          found = true;
          break;
        }
      }
    }

    // Check dependencies
    if (!found && config.deps) {
      for (const dep of config.deps) {
        if (nodeDeps[dep] || pythonDeps.includes(dep)) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      detected.push(framework);
    }
  }

  return detected;
}

/**
 * Detects full stack
 */
function detectStack(projectPath) {
  projectPath = projectPath || process.cwd();
  const languages = detectLanguages(projectPath);
  const frameworks = detectFrameworks(projectPath, languages);

  return {
    project: projectPath,
    languages,
    frameworks,
    primary: {
      language: languages[0] || null,
      framework: frameworks[0] || null
    }
  };
}

module.exports = {
  LANGUAGE_PATTERNS,
  FRAMEWORK_PATTERNS,
  detectLanguages,
  detectFrameworks,
  detectStack,
  matchGlob
};
