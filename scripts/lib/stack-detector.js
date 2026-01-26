/**
 * CTOC Stack Detector
 * Detects languages and frameworks in a project
 */

const fs = require('fs');
const path = require('path');
const { readFileSafe, getCTOCRoot } = require('./utils');

// ============================================================================
// Detection Patterns
// ============================================================================

const LANGUAGE_PATTERNS = {
  python: {
    files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile', 'poetry.lock', 'uv.lock'],
    extensions: ['.py'],
    markers: ['__init__.py']
  },
  javascript: {
    files: ['package.json'],
    extensions: ['.js', '.mjs', '.cjs'],
    markers: []
  },
  typescript: {
    files: ['tsconfig.json', 'package.json'],
    extensions: ['.ts', '.tsx'],
    markers: []
  },
  go: {
    files: ['go.mod', 'go.sum'],
    extensions: ['.go'],
    markers: []
  },
  rust: {
    files: ['Cargo.toml', 'Cargo.lock'],
    extensions: ['.rs'],
    markers: []
  },
  java: {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle'],
    extensions: ['.java'],
    markers: []
  },
  kotlin: {
    files: ['build.gradle.kts', 'settings.gradle.kts'],
    extensions: ['.kt', '.kts'],
    markers: []
  },
  swift: {
    files: ['Package.swift', '*.xcodeproj', '*.xcworkspace'],
    extensions: ['.swift'],
    markers: []
  },
  ruby: {
    files: ['Gemfile', 'Rakefile', '*.gemspec'],
    extensions: ['.rb'],
    markers: []
  },
  php: {
    files: ['composer.json', 'composer.lock'],
    extensions: ['.php'],
    markers: []
  },
  csharp: {
    files: ['*.csproj', '*.sln', 'global.json'],
    extensions: ['.cs'],
    markers: []
  },
  cpp: {
    files: ['CMakeLists.txt', 'Makefile', 'meson.build'],
    extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
    markers: []
  },
  c: {
    files: ['CMakeLists.txt', 'Makefile', 'meson.build'],
    extensions: ['.c', '.h'],
    markers: []
  },
  elixir: {
    files: ['mix.exs', 'mix.lock'],
    extensions: ['.ex', '.exs'],
    markers: []
  },
  scala: {
    files: ['build.sbt', 'build.sc'],
    extensions: ['.scala', '.sc'],
    markers: []
  },
  haskell: {
    files: ['stack.yaml', '*.cabal', 'cabal.project'],
    extensions: ['.hs', '.lhs'],
    markers: []
  },
  clojure: {
    files: ['deps.edn', 'project.clj', 'bb.edn'],
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    markers: []
  },
  dart: {
    files: ['pubspec.yaml', 'pubspec.lock'],
    extensions: ['.dart'],
    markers: []
  },
  zig: {
    files: ['build.zig', 'build.zig.zon'],
    extensions: ['.zig'],
    markers: []
  },
  terraform: {
    files: ['*.tf', 'terraform.tfstate'],
    extensions: ['.tf', '.tfvars'],
    markers: []
  }
};

const FRAMEWORK_PATTERNS = {
  // Python Web Frameworks
  fastapi: {
    language: 'python',
    patterns: {
      files: [],
      dependencies: ['fastapi'],
      imports: ['from fastapi', 'import fastapi']
    }
  },
  django: {
    language: 'python',
    patterns: {
      files: ['manage.py', 'settings.py'],
      dependencies: ['django'],
      imports: ['from django', 'import django']
    }
  },
  flask: {
    language: 'python',
    patterns: {
      files: [],
      dependencies: ['flask'],
      imports: ['from flask', 'import flask']
    }
  },

  // JavaScript/TypeScript Web Frameworks
  'next.js': {
    language: 'typescript',
    patterns: {
      files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
      dependencies: ['next'],
      imports: ['from next', "from 'next"]
    }
  },
  react: {
    language: 'typescript',
    patterns: {
      files: [],
      dependencies: ['react'],
      imports: ['from react', "from 'react"]
    }
  },
  vue: {
    language: 'typescript',
    patterns: {
      files: ['vue.config.js', 'vite.config.ts'],
      dependencies: ['vue'],
      imports: ['from vue', "from 'vue"]
    }
  },
  angular: {
    language: 'typescript',
    patterns: {
      files: ['angular.json'],
      dependencies: ['@angular/core'],
      imports: ['from @angular']
    }
  },
  svelte: {
    language: 'typescript',
    patterns: {
      files: ['svelte.config.js'],
      dependencies: ['svelte'],
      imports: ['from svelte']
    }
  },
  express: {
    language: 'javascript',
    patterns: {
      files: [],
      dependencies: ['express'],
      imports: ['require(\'express\')', 'from \'express\'']
    }
  },
  nestjs: {
    language: 'typescript',
    patterns: {
      files: ['nest-cli.json'],
      dependencies: ['@nestjs/core'],
      imports: ['from @nestjs']
    }
  },

  // Go Frameworks
  gin: {
    language: 'go',
    patterns: {
      files: [],
      dependencies: ['github.com/gin-gonic/gin'],
      imports: ['github.com/gin-gonic/gin']
    }
  },
  echo: {
    language: 'go',
    patterns: {
      files: [],
      dependencies: ['github.com/labstack/echo'],
      imports: ['github.com/labstack/echo']
    }
  },
  fiber: {
    language: 'go',
    patterns: {
      files: [],
      dependencies: ['github.com/gofiber/fiber'],
      imports: ['github.com/gofiber/fiber']
    }
  },

  // Rust Frameworks
  actix: {
    language: 'rust',
    patterns: {
      files: [],
      dependencies: ['actix-web'],
      imports: ['actix_web']
    }
  },
  rocket: {
    language: 'rust',
    patterns: {
      files: [],
      dependencies: ['rocket'],
      imports: ['rocket::']
    }
  },
  axum: {
    language: 'rust',
    patterns: {
      files: [],
      dependencies: ['axum'],
      imports: ['axum::']
    }
  },

  // Java Frameworks
  'spring-boot': {
    language: 'java',
    patterns: {
      files: [],
      dependencies: ['spring-boot-starter'],
      imports: ['org.springframework.boot']
    }
  },

  // Ruby Frameworks
  rails: {
    language: 'ruby',
    patterns: {
      files: ['config/routes.rb', 'config/application.rb'],
      dependencies: ['rails'],
      imports: ['Rails']
    }
  },

  // PHP Frameworks
  laravel: {
    language: 'php',
    patterns: {
      files: ['artisan'],
      dependencies: ['laravel/framework'],
      imports: ['Illuminate\\']
    }
  },

  // Mobile Frameworks
  'react-native': {
    language: 'typescript',
    patterns: {
      files: ['metro.config.js', 'app.json'],
      dependencies: ['react-native'],
      imports: ['from react-native']
    }
  },
  flutter: {
    language: 'dart',
    patterns: {
      files: ['pubspec.yaml'],
      dependencies: ['flutter'],
      imports: ['package:flutter']
    }
  },
  expo: {
    language: 'typescript',
    patterns: {
      files: ['app.json', 'expo.json'],
      dependencies: ['expo'],
      imports: ['from expo']
    }
  },

  // Data Frameworks
  pandas: {
    language: 'python',
    patterns: {
      files: [],
      dependencies: ['pandas'],
      imports: ['import pandas', 'from pandas']
    }
  },
  pytorch: {
    language: 'python',
    patterns: {
      files: [],
      dependencies: ['torch'],
      imports: ['import torch', 'from torch']
    }
  },
  tensorflow: {
    language: 'python',
    patterns: {
      files: [],
      dependencies: ['tensorflow'],
      imports: ['import tensorflow', 'from tensorflow']
    }
  },

  // DevOps
  kubernetes: {
    language: 'terraform',
    patterns: {
      files: ['kubernetes/', 'k8s/', 'deployment.yaml', 'service.yaml'],
      dependencies: [],
      imports: []
    }
  },
  docker: {
    language: null,
    patterns: {
      files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'],
      dependencies: [],
      imports: []
    }
  },
  terraform: {
    language: 'terraform',
    patterns: {
      files: ['*.tf', 'terraform.tfstate'],
      dependencies: [],
      imports: []
    }
  }
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detects languages in a project directory
 */
function detectLanguages(projectPath) {
  projectPath = projectPath || process.cwd();
  const detected = [];

  for (const [language, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    let found = false;

    // Check for marker files
    for (const file of patterns.files) {
      if (file.includes('*')) {
        // Glob pattern - just check if any match
        const baseDir = path.dirname(file) || '.';
        const pattern = path.basename(file);
        try {
          const dir = path.join(projectPath, baseDir);
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            if (files.some(f => matchGlob(f, pattern))) {
              found = true;
              break;
            }
          }
        } catch (e) {
          // Ignore
        }
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

  // Handle TypeScript vs JavaScript
  if (detected.includes('typescript') && detected.includes('javascript')) {
    // If tsconfig.json exists, prefer TypeScript
    if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
      const idx = detected.indexOf('javascript');
      if (idx > -1) detected.splice(idx, 1);
    }
  }

  return detected;
}

/**
 * Detects frameworks in a project directory
 */
function detectFrameworks(projectPath, languages) {
  projectPath = projectPath || process.cwd();
  languages = languages || detectLanguages(projectPath);
  const detected = [];

  // Read package.json if exists
  let packageJson = null;
  const packagePath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    } catch (e) {
      // Ignore
    }
  }

  // Read pyproject.toml if exists
  let pyprojectContent = null;
  const pyprojectPath = path.join(projectPath, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    pyprojectContent = readFileSafe(pyprojectPath);
  }

  // Read requirements.txt if exists
  let requirementsContent = null;
  const requirementsPath = path.join(projectPath, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    requirementsContent = readFileSafe(requirementsPath);
  }

  // Read go.mod if exists
  let goModContent = null;
  const goModPath = path.join(projectPath, 'go.mod');
  if (fs.existsSync(goModPath)) {
    goModContent = readFileSafe(goModPath);
  }

  // Read Cargo.toml if exists
  let cargoContent = null;
  const cargoPath = path.join(projectPath, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    cargoContent = readFileSafe(cargoPath);
  }

  for (const [framework, config] of Object.entries(FRAMEWORK_PATTERNS)) {
    // Check if language matches
    if (config.language && !languages.includes(config.language)) {
      continue;
    }

    let found = false;

    // Check marker files
    for (const file of config.patterns.files) {
      if (file.includes('/')) {
        // Directory check
        if (fs.existsSync(path.join(projectPath, file))) {
          found = true;
          break;
        }
      } else if (file.includes('*')) {
        // Glob
        try {
          const files = fs.readdirSync(projectPath);
          if (files.some(f => matchGlob(f, file))) {
            found = true;
            break;
          }
        } catch (e) {
          // Ignore
        }
      } else {
        if (fs.existsSync(path.join(projectPath, file))) {
          found = true;
          break;
        }
      }
    }

    // Check dependencies
    if (!found && config.patterns.dependencies.length > 0) {
      for (const dep of config.patterns.dependencies) {
        // Check package.json
        if (packageJson) {
          const allDeps = {
            ...(packageJson.dependencies || {}),
            ...(packageJson.devDependencies || {})
          };
          if (dep in allDeps) {
            found = true;
            break;
          }
        }

        // Check pyproject.toml
        if (pyprojectContent && pyprojectContent.includes(dep)) {
          found = true;
          break;
        }

        // Check requirements.txt
        if (requirementsContent && requirementsContent.includes(dep)) {
          found = true;
          break;
        }

        // Check go.mod
        if (goModContent && goModContent.includes(dep)) {
          found = true;
          break;
        }

        // Check Cargo.toml
        if (cargoContent && cargoContent.includes(dep)) {
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
 * Detects full stack (languages + frameworks)
 */
function detectStack(projectPath) {
  projectPath = projectPath || process.cwd();
  const languages = detectLanguages(projectPath);
  const frameworks = detectFrameworks(projectPath, languages);

  return {
    project: projectPath,
    languages: languages,
    frameworks: frameworks,
    primary: {
      language: languages[0] || null,
      framework: frameworks[0] || null
    }
  };
}

/**
 * Simple glob matching (supports * and ?)
 */
function matchGlob(str, pattern) {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexPattern}$`).test(str);
}

/**
 * Gets the profile path for a language or framework
 */
function getProfilePath(ctocRoot, type, name) {
  if (type === 'language') {
    return path.join(ctocRoot, '.ctoc', 'skills', 'languages', `${name}.md`);
  } else if (type === 'framework') {
    // Frameworks are in subdirectories
    const categories = ['web', 'data', 'ai-ml', 'devops', 'mobile'];
    for (const category of categories) {
      const frameworkPath = path.join(ctocRoot, '.ctoc', 'skills', 'frameworks', category, `${name}.md`);
      if (fs.existsSync(frameworkPath)) {
        return frameworkPath;
      }
    }
  }
  return null;
}

/**
 * Checks if a profile exists
 */
function profileExists(ctocRoot, type, name) {
  const profilePath = getProfilePath(ctocRoot, type, name);
  return profilePath && fs.existsSync(profilePath);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  LANGUAGE_PATTERNS,
  FRAMEWORK_PATTERNS,
  detectLanguages,
  detectFrameworks,
  detectStack,
  getProfilePath,
  profileExists,
  matchGlob
};
