#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

// Default values
const defaultEnv = {
  SOGNI_APP_ID: 'photobooth-test',
  SOGNI_USERNAME: '',
  SOGNI_PASSWORD: '',
  SOGNI_ENV: 'production',
  PORT: '3001',
  CLIENT_ORIGIN: 'http://localhost:5173'
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if .env file exists
const envExists = fs.existsSync(envPath);
let currentEnv = {};

if (envExists) {
  console.log('📄 Existing .env file found. We will update it.');
  
  // Parse existing .env file
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      currentEnv[key.trim()] = value.trim();
    }
  });
} else {
  console.log('📄 No .env file found. We will create a new one.');
}

console.log('\n🔐 Sogni Photobooth - Environment Configuration');
console.log('=============================================');
console.log('Please enter your Sogni API credentials:');
console.log('(Press Enter to keep existing values or use defaults)');
console.log('---------------------------------------------\n');

// Prompt for each value
const promptForValue = (key, defaultValue) => {
  return new Promise((resolve) => {
    const currentValue = currentEnv[key] || defaultValue;
    const displayValue = key.includes('PASSWORD') ? (currentValue ? '********' : '') : currentValue;
    
    rl.question(`${key} [${displayValue}]: `, (answer) => {
      resolve(answer.trim() || currentValue);
    });
  });
};

async function main() {
  try {
    const newEnv = {};
    
    // Prompt for each value
    newEnv.SOGNI_APP_ID = await promptForValue('SOGNI_APP_ID', defaultEnv.SOGNI_APP_ID);
    newEnv.SOGNI_USERNAME = await promptForValue('SOGNI_USERNAME', defaultEnv.SOGNI_USERNAME);
    newEnv.SOGNI_PASSWORD = await promptForValue('SOGNI_PASSWORD', defaultEnv.SOGNI_PASSWORD);
    newEnv.SOGNI_ENV = await promptForValue('SOGNI_ENV', defaultEnv.SOGNI_ENV);
    newEnv.PORT = await promptForValue('PORT', defaultEnv.PORT);
    newEnv.CLIENT_ORIGIN = await promptForValue('CLIENT_ORIGIN', defaultEnv.CLIENT_ORIGIN);
    
    // Generate .env file content
    let envContent = '# Sogni Client credentials\n';
    envContent += `SOGNI_APP_ID=${newEnv.SOGNI_APP_ID}\n`;
    envContent += `SOGNI_USERNAME=${newEnv.SOGNI_USERNAME}\n`;
    envContent += `SOGNI_PASSWORD=${newEnv.SOGNI_PASSWORD}\n`;
    envContent += `SOGNI_ENV=${newEnv.SOGNI_ENV}\n\n`;
    envContent += '# Server config\n';
    envContent += `PORT=${newEnv.PORT}\n`;
    envContent += `CLIENT_ORIGIN=${newEnv.CLIENT_ORIGIN}\n`;
    
    // Write to .env file
    fs.writeFileSync(envPath, envContent);
    
    console.log('\n✅ .env file has been created/updated successfully!');
    console.log(`📁 Location: ${envPath}`);
    console.log('\n🚀 Next steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Start the frontend: npm start (from the project root)');
    console.log('\n📝 Note: If you change the .env file, you will need to restart the server for changes to take effect.');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    rl.close();
  }
}

main(); 