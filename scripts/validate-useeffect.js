#!/usr/bin/env node

/**
 * 🚨 USEEFFECT VALIDATOR 🚨
 * 
 * This script scans all React files for useEffect violations and FAILS LOUDLY.
 * Run this BEFORE committing any changes to React components.
 * 
 * Usage: node scripts/validate-useeffect.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BANNED_IN_DEPS = [
  'updateSetting',
  'clearCache',
  'registerCallback',
  'initializeSogni',
  'clearImageCaches',
  'registerCacheClearingCallback',
  'switchToModel',
  'resetSettings',
  'handleClick',
  'handleChange',
  'handleSubmit',
];

const violations = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Find all useEffect calls
  const useEffectRegex = /useEffect\s*\(/g;
  let match;
  
  while ((match = useEffectRegex.exec(content)) !== null) {
    const startIndex = match.index;
    
    // Find the dependency array by looking for }, [
    const afterEffect = content.substring(startIndex);
    const depsMatch = afterEffect.match(/\},\s*\[([^\]]*)\]/);
    
    if (!depsMatch) continue;
    
    const depsString = depsMatch[1];
    const deps = depsString.split(',').map(d => d.trim()).filter(Boolean);
    
    // Get line number
    const lineNumber = content.substring(0, startIndex).split('\n').length;
    
    // Check for violations
    const issues = [];
    const warnings = [];
    
    // Check 1: CRITICAL - Banned functions in dependencies
    deps.forEach(dep => {
      BANNED_IN_DEPS.forEach(banned => {
        if (dep.includes(banned)) {
          issues.push(`🔴 CRITICAL: Contains banned function "${banned}" - REMOVE IT (causes re-render bugs)`);
        }
      });
    });
    
    // Check 2: CRITICAL - Whole objects instead of primitives
    deps.forEach(dep => {
      if (dep === 'settings' || dep === 'authState' || dep === 'config') {
        issues.push(`🔴 CRITICAL: Contains whole object "${dep}" - extract specific primitives (e.g., ${dep}.someValue)`);
      }
    });
    
    // Check 3: CRITICAL - Function calls in dependencies
    deps.forEach(dep => {
      if (dep.includes('()')) {
        issues.push(`🔴 CRITICAL: Contains function call "${dep}" - extract to primitive value`);
      }
    });
    
    // Check 4: WARNING - Many dependencies (suspicious but not automatically bad)
    // Note: High dep count alone doesn't cause bugs - only warn, don't block
    if (deps.length > 10) {
      warnings.push(`⚠️  REVIEW: Has ${deps.length} dependencies - consider refactoring when time permits`);
    } else if (deps.length > 6) {
      warnings.push(`💡 Review: Has ${deps.length} dependencies - ensure they're all related to single purpose`);
    } else if (deps.length > 4) {
      warnings.push(`💡 Info: Has ${deps.length} dependencies - verify they're all related to same concern`);
    }
    
    if (issues.length > 0 || warnings.length > 0) {
      violations.push({
        file: path.relative(process.cwd(), filePath),
        line: lineNumber,
        deps: deps,
        issues: issues,
        warnings: warnings,
        severity: issues.length > 0 ? 'error' : 'warning'
      });
    }
  }
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        scanDirectory(filePath);
      }
    } else if (file.match(/\.(jsx|tsx)$/)) {
      scanFile(filePath);
    }
  });
}

// Main execution
console.log('🔍 Scanning for useEffect violations...\n');

const srcDir = path.join(__dirname, '..', 'src');
scanDirectory(srcDir);

const errors = violations.filter(v => v.severity === 'error');
const warnings = violations.filter(v => v.severity === 'warning');

if (violations.length === 0) {
  console.log('✅ No useEffect violations found!\n');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log(`🔴 Found ${errors.length} CRITICAL useEffect error(s):\n`);
    
    errors.forEach((v, index) => {
      console.log(`${index + 1}. ${v.file}:${v.line}`);
      console.log(`   Dependencies: [${v.deps.join(', ')}]`);
      v.issues.forEach(issue => {
        console.log(`   ${issue}`);
      });
      console.log('');
    });
  }
  
  if (warnings.length > 0) {
    console.log(`💡 Found ${warnings.length} useEffect warning(s) (non-blocking):\n`);
    
    warnings.forEach((v, index) => {
      console.log(`${index + 1}. ${v.file}:${v.line}`);
      console.log(`   Dependencies: [${v.deps.join(', ')}]`);
      v.warnings.forEach(warning => {
        console.log(`   ${warning}`);
      });
      console.log('');
    });
  }
  
  if (errors.length > 0) {
    console.log('📖 Review cursor.rules.md section "useEffect CRITICAL RULES" for guidance\n');
    console.log('🔧 Fix CRITICAL errors before committing!\n');
    process.exit(1);
  } else {
    console.log('💡 Warnings are informational only - review when time permits\n');
    process.exit(0);
  }
}

