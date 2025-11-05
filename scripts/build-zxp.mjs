#!/usr/bin/env node
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load .env file
dotenv.config({ path: path.resolve(projectRoot, 'src/server/.env') });

// Set ZXP_PACKAGE and run vite build
process.env.ZXP_PACKAGE = 'true';
execSync('node node_modules/.bin/vite build', { stdio: 'inherit', cwd: projectRoot });

