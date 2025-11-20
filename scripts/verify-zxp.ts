#!/usr/bin/env tsx
/**
 * Verification script to check ZXP contents for common issues
 * Ensures script tags have correct data-main attributes and paths
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const distDir = path.join(process.cwd(), 'dist');
const zxpPath = path.join(distDir, 'zxp', 'com.sync.extension.zxp');
const cepDir = path.join(distDir, 'cep');

interface VerificationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

function verifyHTMLFile(htmlPath: string): VerificationResult {
  const result: VerificationResult = {
    passed: true,
    errors: [],
    warnings: [],
  };

  if (!fs.existsSync(htmlPath)) {
    result.passed = false;
    result.errors.push(`HTML file not found: ${htmlPath}`);
    return result;
  }

  const content = fs.readFileSync(htmlPath, 'utf-8');

  // Check for dev mode redirects (should not be in production)
  if (content.includes('window.location.href') && content.includes('localhost:3001')) {
    result.passed = false;
    result.errors.push('Dev mode redirect script found in production HTML');
  }

  // Check for module script tags (should be removed in production)
  if (content.match(/<script[^>]*type=["']module["'][^>]*>/i)) {
    result.warnings.push('Module script tag found (should be removed in production)');
  }

  // Check for script tags with main*.cjs (with or without hash)
  // Production builds use fixed filenames (main.cjs), dev builds use hashed (main-XXX.cjs)
  const scriptTagRegex = /<script([^>]*)src=["']([^"']*main[^"']*\.cjs)["']([^>]*)><\/script>/gi;
  const scriptMatches = Array.from(content.matchAll(scriptTagRegex));

  if (scriptMatches.length === 0) {
    result.passed = false;
    result.errors.push('No script tag found with main*.cjs file');
    return result;
  }

  scriptMatches.forEach((match, index) => {
    const fullMatch = match[0];
    const srcPath = match[2];

    // Check for data-main attribute
    if (!fullMatch.includes('data-main=')) {
      result.passed = false;
      result.errors.push(`Script tag ${index + 1} missing data-main attribute: ${srcPath}`);
    } else {
      // Extract data-main value
      const dataMainMatch = fullMatch.match(/data-main=["']([^"']*)["']/i);
      if (dataMainMatch) {
        const dataMainPath = dataMainMatch[1];
        
        // Check if data-main matches src
        if (dataMainPath !== srcPath) {
          result.passed = false;
          result.errors.push(
            `Script tag ${index + 1} data-main="${dataMainPath}" doesn't match src="${srcPath}"`
          );
        }

        // Check for malformed paths (multiple ../ or ..../)
        if (dataMainPath.includes('..../') || dataMainPath.match(/\.\.\/\.\.\/\.\./)) {
          result.passed = false;
          result.errors.push(`Script tag ${index + 1} has malformed path: ${dataMainPath}`);
        }

        // Verify path format (should be ../assets/main.cjs or ../assets/main-XXX.cjs)
        if (!dataMainPath.startsWith('../assets/main')) {
          result.warnings.push(`Script tag ${index + 1} path doesn't start with ../assets/main: ${dataMainPath}`);
        }
        
        // Verify it's a .cjs file
        if (!dataMainPath.endsWith('.cjs')) {
          result.passed = false;
          result.errors.push(`Script tag ${index + 1} path doesn't end with .cjs: ${dataMainPath}`);
        }
      }
    }

    // Check for root div
    if (!content.includes('id="root"')) {
      result.warnings.push('No div with id="root" found');
    }
  });

  return result;
}

function verifyZXP(): VerificationResult {
  const result: VerificationResult = {
    passed: true,
    errors: [],
    warnings: [],
  };

  if (!fs.existsSync(zxpPath)) {
    result.passed = false;
    result.errors.push(`ZXP file not found: ${zxpPath}`);
    return result;
  }

  // Extract ZXP temporarily
  const tempDir = path.join(process.cwd(), '.zxp-verify-temp');
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    execSync(`unzip -q "${zxpPath}" -d "${tempDir}"`, { stdio: 'pipe' });

    // Find HTML files in the extracted ZXP
    const htmlFiles: string[] = [];
    function findHTMLFiles(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          findHTMLFiles(filePath);
        } else if (file === 'index.html' && filePath.includes('/main/')) {
          htmlFiles.push(filePath);
        }
      }
    }

    findHTMLFiles(tempDir);

    if (htmlFiles.length === 0) {
      result.passed = false;
      result.errors.push('No index.html files found in ZXP');
    } else {
      htmlFiles.forEach(htmlPath => {
        const htmlResult = verifyHTMLFile(htmlPath);
        if (!htmlResult.passed) {
          result.passed = false;
        }
        result.errors.push(...htmlResult.errors.map(e => `${path.relative(tempDir, htmlPath)}: ${e}`));
        result.warnings.push(...htmlResult.warnings.map(w => `${path.relative(tempDir, htmlPath)}: ${w}`));
      });
    }
  } catch (error: any) {
    result.passed = false;
    result.errors.push(`Failed to extract ZXP: ${error.message}`);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  return result;
}

function verifyCEPDir(): VerificationResult {
  const result: VerificationResult = {
    passed: true,
    errors: [],
    warnings: [],
  };

  const htmlPath = path.join(cepDir, 'main', 'index.html');
  const htmlResult = verifyHTMLFile(htmlPath);
  
  if (!htmlResult.passed) {
    result.passed = false;
  }
  result.errors.push(...htmlResult.errors);
  result.warnings.push(...htmlResult.warnings);

  return result;
}

// Main execution
console.log('🔍 Verifying ZXP and CEP build contents...\n');

const zxpResult = verifyZXP();
const cepResult = verifyCEPDir();

console.log('📦 ZXP File Verification:');
if (zxpResult.passed && zxpResult.errors.length === 0) {
  console.log('  ✅ PASSED');
} else {
  console.log('  ❌ FAILED');
  zxpResult.errors.forEach(error => console.log(`    ❌ ${error}`));
}
if (zxpResult.warnings.length > 0) {
  zxpResult.warnings.forEach(warning => console.log(`    ⚠️  ${warning}`));
}

console.log('\n📁 CEP Directory Verification:');
if (cepResult.passed && cepResult.errors.length === 0) {
  console.log('  ✅ PASSED');
} else {
  console.log('  ❌ FAILED');
  cepResult.errors.forEach(error => console.log(`    ❌ ${error}`));
}
if (cepResult.warnings.length > 0) {
  cepResult.warnings.forEach(warning => console.log(`    ⚠️  ${warning}`));
}

const overallPassed = zxpResult.passed && cepResult.passed && 
                      zxpResult.errors.length === 0 && cepResult.errors.length === 0;

console.log(`\n${overallPassed ? '✅' : '❌'} Overall: ${overallPassed ? 'PASSED' : 'FAILED'}`);

process.exit(overallPassed ? 0 : 1);

