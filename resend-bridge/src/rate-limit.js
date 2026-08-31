import { config } from './config.js';

const sendTimestamps = [];

export function tryAcquireSendSlot() {
  const limit = config.bridge.rateLimitPerMinute;
  if (limit <= 0) return true;
  const now = Date.now();
  while (sendTimestamps.length && sendTimestamps[0] < now - 60_000) {
    sendTimestamps.shift();
  }
  if (sendTimestamps.length >= limit) return false;
  sendTimestamps.push(now);
  return true;
}

export async function waitForSendSlot() {
  while (!tryAcquireSendSlot()) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
