# firesamplevents

firesamplevents is a high-performance event generator and sender for testing HTTP endpoints. It generates a large number of simulated mobile device events (Android and iOS) and sends them as POST requests to a specified endpoint, supporting batching, concurrency, and rate limiting. This tool is useful for load testing or simulating event ingestion APIs.

## Features
- Generates 100,000 unique simulated events
- Supports batching and parallel sending (configurable)
- Rate limiting and burst control
- Simulates both Android and iOS devices
- Uses Bun for fast execution

## Requirements
- [Bun](https://bun.sh) v1.2.0 or newer

## Installation

```bash
bun install
```

## Usage

You must provide the endpoint URL as an argument:

```bash
bun run index.ts <endpoint_url>
```

Replace `<endpoint_url>` with the full URL of the server endpoint you want to test. For example:

```bash
bun run index.ts https://your-api.example.com/events
```

## How it works
- Generates 100,000 unique events with randomized device and session data
- Splits events into batches (default: 500 per batch)
- Sends batches in parallel (default: 8 concurrent batches)
- Respects rate limits (default: 90 requests/sec, burst up to 100 in the first second)
- Prints progress and summary of sent/failed events

## Customization
You can adjust parameters like TOTAL_EVENTS, BATCH_SIZE, CONCURRENCY, and rate limits by editing the constants at the top of `index.ts`.

---

This project was created using `bun init` in bun v1.2.0. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
