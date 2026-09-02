import type { DeviceEvent } from "./types";

const MAX_EVENTS = 500;
const events: DeviceEvent[] = [];

export function addEvent(event: DeviceEvent) {
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  return event;
}

export function addEvents(newEvents: DeviceEvent[]) {
  for (const event of newEvents) addEvent(event);
  return newEvents;
}

export function listEvents(limit = 100) {
  return events.slice(0, Math.min(Math.max(limit, 1), MAX_EVENTS));
}

export function clearEvents() {
  events.length = 0;
}
