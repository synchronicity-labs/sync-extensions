import { PostHog } from 'posthog-node';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const POSTHOG_KEY = process.env.POSTHOG_KEY || '<your_project_api_key>';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

// Create install ID file for consistent user identification
// Use the same app data directory structure as the rest of the extension
function platformAppData(appName) {
  const home = os.homedir();
  if (process.platform === 'win32') return path.join(home, 'AppData', 'Roaming', appName);
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', appName);
  return path.join(home, '.config', appName);
}

const BASE_DIR = process.env.SYNC_EXTENSIONS_DIR || platformAppData('sync. extensions');
const idFile = path.join(BASE_DIR, '.install-id');
fs.mkdirSync(path.dirname(idFile), { recursive: true });

let distinctId;
try {
  distinctId = fs.readFileSync(idFile, 'utf8');
} catch {
  distinctId = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(idFile, distinctId, 'utf8');
}

// Export distinctId for use in other modules
export { distinctId };

// Lazy initialization of PostHog client (only when first needed, after .env is loaded)
let phClient = null;
function getPostHogClient() {
  if (!phClient) {
    // Re-read env vars at initialization time (not module load time)
    const key = process.env.POSTHOG_KEY || '<your_project_api_key>';
    const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
    
    if (!key || key === '<your_project_api_key>') {
      console.error('PostHog client not initialized: POSTHOG_KEY is missing or invalid');
      return null;
    }
    
    phClient = new PostHog(key, { 
      host: host,
  flushAt: 1, // Send events immediately for testing
  flushInterval: 1000, // Send events every 1 second for testing
  debug: true // Enable debug mode
    });
    
    console.log('PostHog client initialized with key:', key.substring(0, 10) + '...');
  }
  return phClient;
}

// Export ph getter (for backward compatibility)
export const ph = new Proxy({}, {
  get(target, prop) {
    const client = getPostHogClient();
    if (!client) return undefined;
    const value = client[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

// Track function with error handling
export async function track(event, properties = {}) {
  try {
    const POSTHOG_KEY = process.env.POSTHOG_KEY || '<your_project_api_key>';
    const hasValidKey = POSTHOG_KEY && POSTHOG_KEY !== '<your_project_api_key>';
    
    if (!hasValidKey) {
      console.error('PostHog tracking skipped: POSTHOG_KEY is missing or invalid');
      return;
    }
    
    // Import APP_ID dynamically to avoid circular dependencies
    const { APP_ID } = await import('./config.js');
    
    const eventData = {
      distinctId,
      event,
      properties: {
        ...properties,
        appId: APP_ID, // Always include appId in all events
        timestamp: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      }
    };

    // Get PostHog client (lazy initialization)
    const client = getPostHogClient();
    if (!client) {
      console.error('PostHog tracking skipped: client not initialized');
      return;
    }

    // Use captureImmediate for critical events to ensure they're sent
    await client.captureImmediate(eventData);

    // Debug logging (always log when DEBUG_POSTHOG is set)
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_POSTHOG) {
      console.log('PostHog event captured:', event, eventData.properties);
    }
  } catch (error) {
    console.error('PostHog tracking error:', error.message);
    console.error('PostHog error details:', error);
    if (error.stack) {
      console.error('PostHog error stack:', error.stack);
    }
  }
}

// Identify user with additional properties
export function identify(properties = {}) {
  try {
    const client = getPostHogClient();
    if (!client) return;
    client.identify({
      distinctId,
      properties: {
        ...properties,
        syncExtensionId: distinctId, // Custom property for easy filtering
        installId: distinctId, // Alternative name
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        extensionVersion: process.env.EXTENSION_VERSION || 'unknown'
      }
    });
  } catch (error) {
    console.error('PostHog identify error:', error.message);
  }
}

// Set user properties
export function setUserProperties(properties = {}) {
  try {
    const client = getPostHogClient();
    if (!client) return;
    client.setPersonProperties({
      distinctId,
      properties
    });
  } catch (error) {
    console.error('PostHog setUserProperties error:', error.message);
  }
}

// Shutdown PostHog on process exit
process.on('beforeExit', () => {
  try {
    const client = getPostHogClient();
    if (client) client.shutdown();
  } catch (error) {
    console.error('PostHog shutdown error:', error.message);
  }
});

// Graceful shutdown on SIGTERM/SIGINT
process.on('SIGTERM', () => {
  try {
    const client = getPostHogClient();
    if (client) client.shutdown();
  } catch (error) {
    console.error('PostHog SIGTERM shutdown error:', error.message);
  }
});

process.on('SIGINT', () => {
  try {
    const client = getPostHogClient();
    if (client) client.shutdown();
  } catch (error) {
    console.error('PostHog SIGINT shutdown error:', error.message);
  }
});
