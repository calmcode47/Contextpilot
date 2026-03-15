const CONFIG = {
  // Replace with your Railway URL after deployment
  API_BASE_URL: "http://localhost:3001",
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT_MS: 30000
  // Development override — comment out for production demo
  // API_BASE_URL: "http://localhost:3001",
};

/*
  HOW TO FIND YOUR CHROME EXTENSION ID:
  1. Go to chrome://extensions
  2. Enable "Developer mode" (toggle in top right)
  3. Find ContextPilot in the list
  4. The ID is the 32-character string below the extension name
     Example: abcdefghijklmnopqrstuvwxyzabcdef
  5. Your EXTENSION_ORIGIN env var should be:
     chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef
  6. Set this in Railway dashboard → Variables
*/

async function checkBackendConnectivity() {
  try {
    const timeout = 5000;
    const h = await fetch(`${CONFIG.API_BASE_URL}/health`, { signal: AbortSignal.timeout(timeout) }).catch(() => null);
    if (h && h.ok) {
      console.log('[ContextPilot] Backend connected:', CONFIG.API_BASE_URL);
      return true;
    }
    const p = await fetch(`${CONFIG.API_BASE_URL}/api/ping`, { signal: AbortSignal.timeout(timeout) }).catch(() => null);
    if (p && p.ok) {
      console.log('[ContextPilot] Backend connected (via /api/ping):', CONFIG.API_BASE_URL);
      return true;
    }
  } catch (err) {
    console.warn('[ContextPilot] Backend unreachable:', CONFIG.API_BASE_URL, err.message);
    return false;
  }
  return false;
}
