#!/usr/bin/env node

/**
 * Script to rename gallery files from old naming convention (no hyphens)
 * to new kebab-case convention
 * 
 * Old: sogni-photobooth-darkfantasyberserker-raw.jpg
 * New: sogni-photobooth-dark-fantasy-berserker-raw.jpg
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import prompts data
const promptsDataRaw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../src/prompts.json'), 'utf-8')
);

// Extract all prompt keys from the nested structure
const getAllPromptKeys = () => {
  const keys = [];
  Object.values(promptsDataRaw).forEach(themeGroup => {
    if (themeGroup.prompts) {
      keys.push(...Object.keys(themeGroup.prompts));
    }
  });
  return keys;
};

/**
 * Old conversion: removes all hyphens and special chars
 */
const oldPromptKeyToFilename = (promptKey) => {
  return promptKey
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

/**
 * New conversion: proper camelCase to kebab-case
 */
const newPromptKeyToFilename = (promptKey) => {
  return promptKey
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/--+/g, '-');
};

/**
 * Generate old filename (current state)
 */
const generateOldFilename = (promptKey) => {
  const oldFormat = oldPromptKeyToFilename(promptKey);
  return `sogni-photobooth-${oldFormat}-raw.jpg`;
};

/**
 * Generate new filename (kebab-case)
 */
const generateNewFilename = (promptKey) => {
  const kebabCase = newPromptKeyToFilename(promptKey);
  return `sogni-photobooth-${kebabCase}-raw.jpg`;
};

/**
 * Main rename function
 */
const renameGalleryFiles = () => {
  const galleryDir = path.join(__dirname, '../../public/gallery/prompts');
  
  // Verify gallery directory exists
  if (!fs.existsSync(galleryDir)) {
    console.error(`❌ Gallery directory not found: ${galleryDir}`);
    return;
  }

  const promptKeys = getAllPromptKeys();
  console.log(`📋 Found ${promptKeys.length} prompt keys in prompts.json\n`);

  let renamed = 0;
  let alreadyCorrect = 0;
  let notFound = 0;
  let errors = 0;

  promptKeys.forEach(promptKey => {
    const oldFilename = generateOldFilename(promptKey);
    const newFilename = generateNewFilename(promptKey);
    
    const oldPath = path.join(galleryDir, oldFilename);
    const newPath = path.join(galleryDir, newFilename);

    // Skip if old and new are the same (no change needed)
    if (oldFilename === newFilename) {
      console.log(`✅ ${promptKey}: Already correct (${newFilename})`);
      alreadyCorrect++;
      return;
    }

    // Check if old file exists
    if (!fs.existsSync(oldPath)) {
      // Maybe it's already renamed? Check if new name exists
      if (fs.existsSync(newPath)) {
        console.log(`✅ ${promptKey}: Already renamed to ${newFilename}`);
        alreadyCorrect++;
      } else {
        console.log(`⚠️  ${promptKey}: File not found (${oldFilename})`);
        notFound++;
      }
      return;
    }

    // Check if new file already exists (would cause conflict)
    if (fs.existsSync(newPath)) {
      console.log(`❌ ${promptKey}: Target already exists! Cannot rename.`);
      console.log(`   Old: ${oldFilename}`);
      console.log(`   New: ${newFilename}`);
      errors++;
      return;
    }

    // Rename the file
    try {
      fs.renameSync(oldPath, newPath);
      console.log(`🔄 ${promptKey}:`);
      console.log(`   Old: ${oldFilename}`);
      console.log(`   New: ${newFilename}`);
      renamed++;
    } catch (error) {
      console.error(`❌ ${promptKey}: Error renaming file`);
      console.error(`   ${error.message}`);
      errors++;
    }
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY:');
  console.log('='.repeat(60));
  console.log(`✅ Already correct:  ${alreadyCorrect}`);
  console.log(`🔄 Renamed:          ${renamed}`);
  console.log(`⚠️  Not found:        ${notFound}`);
  console.log(`❌ Errors:           ${errors}`);
  console.log(`📝 Total prompts:    ${promptKeys.length}`);
  console.log('='.repeat(60));
};

// Run the script
console.log('🚀 Starting gallery file renaming...\n');
renameGalleryFiles();

