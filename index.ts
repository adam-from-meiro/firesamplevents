// CONFIGURABLE PARAMETERS
const TOTAL_EVENTS = 100_000;
const BATCH_SIZE = 500;
const CONCURRENCY = 8; // Number of batches sent in parallel
const BASE_TIMESTAMP = new Date('2024-05-10T12:42:18Z');
// --- Rate Limiting Section ---
const RATE_LIMIT = 90; // requests per second
const BURST_LIMIT = 100; // max requests in the first second

const APP_IDS = {
  Android: '1:353411649331:android:807159721d149925fa7846',
  iOS: '1:353411649331:ios:0c81a6f862765278fa7846',
} as const;

const DEVICE_MODELS = {
  Android: [
    'Pixel 7',
    'Samsung Galaxy S23',
    'OnePlus 11',
    'Xiaomi 13',
    'Google Pixel 6',
  ],
  iOS: [
    'iPhone15,2',
    'iPhone14,8',
    'iPhone13,3',
    'iPhone12,8',
    'iPhone11,2',
  ],
} as const;

type OSType = keyof typeof APP_IDS;

type SimEvent = {
  app: {
    id: string;
    language: string;
    name: string;
    version: string;
  };
  device: {
    manufacturer: string;
    model: string;
  };
  event_timestamp: string;
  event_type: string;
  firebase: {
    project_id: string;
    registration_token: string;
  };
  os: {
    type: OSType;
    version: string;
  };
  session_id: string;
  user_id: string;
  version: string;
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEvent(osType: OSType, registrationToken: string, sessionId: string): SimEvent {
  // Generate random timestamp within the last 30 days
  const randomDays = randomInt(0, 30);
  const randomHours = randomInt(0, 24);
  const randomMinutes = randomInt(0, 60);
  const eventTimestamp = new Date(BASE_TIMESTAMP.getTime() - (
    ((randomDays * 24 + randomHours) * 60 + randomMinutes) * 60 * 1000
  ));
  return {
    app: {
      id: APP_IDS[osType],
      language: 'en',
      name: 'MeiroSDKSample',
      version: '1.0.0',
    },
    device: {
      manufacturer: osType === 'iOS' ? 'Apple' : 'Google',
      model: DEVICE_MODELS[osType][randomInt(0, DEVICE_MODELS[osType].length - 1)],
    },
    event_timestamp: eventTimestamp.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    event_type: 'fcm_registration_token_registered',
    firebase: {
      project_id: 'meiro-testing-project',
      registration_token: registrationToken,
    },
    os: {
      type: osType,
      version: osType === 'iOS' ? '16.6' : '13.0',
    },
    session_id: sessionId,
    user_id: sessionId,
    version: '1.0.0',
  };
}

function generateUniqueValues(count: number) {
  const tokens = new Set<string>();
  const sessions = new Set<string>();
  while (tokens.size < count) {
    tokens.add(`fcm_token_${globalThis.crypto.randomUUID()}`);
    sessions.add(globalThis.crypto.randomUUID());
  }
  return {
    tokens: Array.from(tokens),
    sessions: Array.from(sessions),
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Token bucket state
let rateLimitTokens = BURST_LIMIT;
let lastRefill = Date.now();

async function acquireToken() {
  while (rateLimitTokens <= 0) {
    // Refill tokens if a second has passed
    const now = Date.now();
    if (now - lastRefill >= 1000) {
      rateLimitTokens = RATE_LIMIT;
      lastRefill = now;
    } else {
      // Wait for the next refill
      await sleep(10);
    }
  }
  rateLimitTokens--;
}

async function sendBatchParallel(batch: SimEvent[], endpoint: string) {
  return Promise.all(
    batch.map(async (event) => {
      await acquireToken();
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(event),
          keepalive: true,
        });
        return { ok: res.ok, status: res.status };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    })
  );
}

// --- Top-level await, Bun style ---

const endpoint = Bun.argv[2];
if (!endpoint) {
  console.error('Usage: bun sendevents.ts <endpoint_url>');
  process.exit(1);
}

console.log(`Generating ${TOTAL_EVENTS} unique events...`);
const { tokens, sessions } = generateUniqueValues(TOTAL_EVENTS);
const events: SimEvent[] = [];
for (let i = 0; i < TOTAL_EVENTS; ++i) {
  const osType: OSType = Math.random() < 0.5 ? 'Android' : 'iOS';
  events.push(generateEvent(osType, tokens[i], sessions[i]));
}
const batches = chunkArray(events, BATCH_SIZE);
console.log(`Split into ${batches.length} batches of up to ${BATCH_SIZE}`);

let sent = 0;
let failed = 0;

async function processBatch(batch: SimEvent[], idx: number) {
  // Only send as parallel single events
  const results = await sendBatchParallel(batch, endpoint);
  const batchFailed = results.filter(r => !r.ok).length;
  if (batchFailed > 0) {
    console.error(`Batch ${idx + 1} failed for ${batchFailed} events`);
    failed += batchFailed;
  } else {
    sent += batch.length;
    console.log(`Batch ${idx + 1} sent`);
  }
}

// Fix concurrency control: use a simple queue
let running = 0;
let batchIndex = 0;

async function runBatches() {
  return new Promise<void>((resolve) => {
    function next() {
      if (batchIndex >= batches.length && running === 0) {
        resolve();
        return;
      }
      while (running < CONCURRENCY && batchIndex < batches.length) {
        const idx = batchIndex;
        batchIndex++;
        running++;
        processBatch(batches[idx], idx).finally(() => {
          running--;
          next();
        });
      }
    }
    next();
  });
}

await runBatches();
console.log(`Done. Sent: ${sent}, Failed: ${failed}`);

// Make this file a module for top-level await
export {};
