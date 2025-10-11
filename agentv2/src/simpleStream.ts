/**
 * Simple in-memory stream for Agent v2
 */

export interface SimpleEvent {
  event_id?: string;
  agent: string;
  phase: string;
  action: string;
  output: Record<string, any>;
  timestamp: number;
}

export class SimpleStream {
  public sessionId: string;
  private events: SimpleEvent[] = [];
  private eventCounter = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async append(event: Omit<SimpleEvent, 'event_id' | 'timestamp'>): Promise<string> {
    const eventId = `event_${this.eventCounter++}`;
    const fullEvent: SimpleEvent = {
      ...event,
      event_id: eventId,
      timestamp: Date.now()
    };
    
    this.events.push(fullEvent);
    console.log(`[${event.agent}] ${event.action}:`, event.output);
    return eventId;
  }

  async read(): Promise<SimpleEvent[]> {
    return [...this.events];
  }

  async put(key: string, data: any): Promise<string> {
    // Simple in-memory storage - just return the key
    return key;
  }

  async get(storageKey: string): Promise<any> {
    // Simple in-memory storage - return null for now
    return null;
  }
}

export { SimpleStream as ExplorationStream };
