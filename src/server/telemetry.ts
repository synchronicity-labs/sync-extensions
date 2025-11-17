import { PostHog } from 'posthog-node';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DEBUG_FLAG_FILE, tlog } from './utils/log';
import { BASE_DIR } from './serverConfig';

const POSTHOG_KEY = process.env.POSTHOG_KEY || '<your_project_api_key>';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

// Create install ID file for consistent user identification
// Use the same app data directory structure as the rest of the extension
const idFile = path.join(BASE_DIR, '.install-id');
fs.mkdirSync(path.dirname(idFile), { recursive: true });

// Check if debug logging is enabled
function isDebugEnabled(): boolean {
  try {
    return fs.existsSync(DEBUG_FLAG_FILE);
  } catch {
    return false;
  }
}

let distinctId: string;
try {
  distinctId = fs.readFileSync(idFile, 'utf8');
} catch {
  distinctId = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(idFile, distinctId, 'utf8');
}

// Export distinctId for use in other modules
export { distinctId };

// Lazy initialization of PostHog client (only when first needed, after .env is loaded)
let phClient: PostHog | null = null;
function getPostHogClient(): PostHog | null {
  if (!phClient) {
    // Re-read env vars at initialization time (not module load time)
    const key = process.env.POSTHOG_KEY || '<your_project_api_key>';
    const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

    if (!key || key === '<your_project_api_key>') {
      // PostHog is optional, but log if in dev mode
      if (process.env.NODE_ENV !== 'production') {
        try { tlog('PostHog client not initialized: POSTHOG_KEY is missing or invalid'); } catch (_) {}
      }
      return null;
    }

    try {
      phClient = new PostHog(key, {
        host: host,
        flushAt: 1, // Send events immediately for testing
        flushInterval: 1000, // Send events every 1 second for testing
        debug: isDebugEnabled() // Only enable debug mode if debug flag file exists
      });

      if (isDebugEnabled()) {
        try { tlog('posthog client initialized with key:', key.substring(0, 10) + '...'); } catch (_) {}
      }
    } catch (error) {
      // Log initialization errors in dev mode
      if (process.env.NODE_ENV !== 'production') {
        const err = error as Error;
        try { tlog('PostHog client initialization failed:', err.message || error); } catch (_) {}
      }
      return null;
    }
  }
  return phClient;
}

// Export ph getter (for backward compatibility)
export const ph = new Proxy({} as PostHog, {
  get(target, prop) {
    const client = getPostHogClient();
    if (!client) return undefined;
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

// Track function with error handling
export async function track(event: string, properties: Record<string, unknown> = {}): Promise<void> {
  try {
    const POSTHOG_KEY = process.env.POSTHOG_KEY || '<your_project_api_key>';
    const hasValidKey = POSTHOG_KEY && POSTHOG_KEY !== '<your_project_api_key>';

    if (!hasValidKey) {
      // Silently fail - PostHog is optional, don't spam console
      return;
    }

    // Import APP_ID dynamically to avoid circular dependencies
    const { APP_ID } = await import('./config');

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
      // PostHog is optional - errors are logged in getPostHogClient
      return;
    }

    // Use captureImmediate for critical events to ensure they're sent
    await client.captureImmediate(eventData);

    // Debug logging (only when debug flag file exists)
    if (isDebugEnabled()) {
      try { tlog('posthog event captured:', event, eventData.properties); } catch (_) {}
    }
  } catch (error) {
    // Log PostHog errors in dev mode, but don't break the app
    if (process.env.NODE_ENV !== 'production' && isDebugEnabled()) {
      const err = error as Error;
      try { tlog('PostHog capture error:', err.message || error); } catch (_) {}
    }
  }
}

// Identify user with additional properties
export function identify(properties: Record<string, unknown> = {}): void {
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
    // Log PostHog errors in dev mode, but don't break the app
    if (process.env.NODE_ENV !== 'production' && isDebugEnabled()) {
      const err = error as Error;
      try { tlog('PostHog capture error:', err.message || error); } catch (_) {}
    }
  }
}

// Set user properties
export function setUserProperties(properties: Record<string, unknown> = {}): void {
  try {
    const client = getPostHogClient();
    if (!client) return;
    client.setPersonProperties({
      distinctId,
      properties
    });
  } catch (error) {
    // Log PostHog errors in dev mode, but don't break the app
    if (process.env.NODE_ENV !== 'production' && isDebugEnabled()) {
      const err = error as Error;
      try { tlog('PostHog capture error:', err.message || error); } catch (_) {}
    }
  }
}

// Shutdown PostHog on process exit
process.on('beforeExit', () => {
  try {
    const client = getPostHogClient();
    if (client) client.shutdown();
  } catch (error) {
    // Log PostHog shutdown errors in dev mode, but don't block exit
    if (process.env.NODE_ENV !== 'production' && isDebugEnabled()) {
      const err = error as Error;
      try { tlog('PostHog shutdown error:', err?.message || error); } catch (_) {}
    }
  }
});

// Graceful shutdown on SIGTERM/SIGINT
process.on('SIGTERM', () => {
  try {
    const client = getPostHogClient();
    if (client) client.shutdown();
  } catch (error) {
    // Log PostHog shutdown errors in dev mode, but don't block exit
    if (process.env.NODE_ENV !== 'production' && isDebugEnabled()) {
      const err = error as Error;
      try { tlog('PostHog shutdown error:', err?.message || error); } catch (_) {}
    }
  }
});

process.on('SIGINT', () => {
  try {
    const client = getPostHogClient();
    if (client) client.shutdown();
  } catch (error) {
    // Log PostHog shutdown errors in dev mode, but don't block exit
    if (process.env.NODE_ENV !== 'production' && isDebugEnabled()) {
      const err = error as Error;
      try { tlog('PostHog shutdown error:', err?.message || error); } catch (_) {}
    }
  }
});

