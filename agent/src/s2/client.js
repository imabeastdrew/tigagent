"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExplorationStream = createExplorationStream;
const streamstore_1 = require("@s2-dev/streamstore");
const config_1 = require("../config");
/**
 * In-Memory Stream (fallback when S2 is not configured)
 */
class InMemoryStream {
    constructor(sessionId) {
        this.events = [];
        this.storage = new Map();
        this.eventCounter = 0;
        this.sessionId = sessionId;
    }
    async append(event) {
        this.eventCounter++;
        const event_id = `${event.agent}-${this.eventCounter}`;
        const fullEvent = {
            ...event,
            event_id,
            timestamp: Date.now()
        };
        this.events.push(fullEvent);
        return event_id;
    }
    async read(filter) {
        let filtered = this.events;
        if (filter?.agent) {
            filtered = filtered.filter(e => e.agent === filter.agent);
        }
        if (filter?.since_id) {
            const idx = this.events.findIndex(e => e.event_id === filter.since_id);
            if (idx !== -1) {
                filtered = this.events.slice(idx + 1);
            }
        }
        return filtered;
    }
    async put(key, data) {
        const storageKey = `${this.sessionId}:${key}`;
        this.storage.set(storageKey, data);
        return storageKey;
    }
    async get(storageKey) {
        return this.storage.get(storageKey);
    }
}
/**
 * S2 Stream (using official @s2-dev/streamstore SDK)
 * Fails fast - no local cache fallback
 */
class S2Stream {
    constructor(sessionId, accessToken, basin) {
        this.sessionId = sessionId;
        this.basin = basin;
        this.client = new streamstore_1.S2({ accessToken });
    }
    async append(event) {
        const event_id = `${event.agent}-${Date.now()}`;
        const fullEvent = {
            ...event,
            event_id,
            timestamp: Date.now()
        };
        // Append to S2 stream using official SDK
        await this.client.records.append({
            stream: this.sessionId,
            s2Basin: this.basin,
            appendInput: {
                records: [{
                        body: JSON.stringify(fullEvent)
                    }]
            }
        });
        return event_id;
    }
    async read(filter) {
        // Read from S2 stream using batch API (seqNum: 0 + count)
        // Without these params, read() tries to tail from current position → 416 error
        try {
            const batch = await this.client.records.read({
                stream: this.sessionId,
                s2Basin: this.basin,
                seqNum: 0, // Start from beginning
                count: 10000 // Max records to fetch
            });
            const events = [];
            // Process batch records
            if (batch.records && Array.isArray(batch.records)) {
                for (const record of batch.records) {
                    try {
                        const parsedEvent = JSON.parse(record.body);
                        events.push(parsedEvent);
                    }
                    catch (e) {
                        // Skip invalid records
                    }
                }
            }
            // Apply filters
            let filtered = events;
            if (filter?.agent) {
                filtered = filtered.filter(e => e.agent === filter.agent);
            }
            if (filter?.since_id) {
                const idx = events.findIndex(e => e.event_id === filter.since_id);
                if (idx !== -1) {
                    filtered = events.slice(idx + 1);
                }
            }
            return filtered;
        }
        catch (error) {
            // HTTP 416 (TailResponse) can still happen if stream doesn't exist
            if (error.statusCode === 416 || error.constructor?.name === 'TailResponse') {
                return [];
            }
            // Re-throw other errors
            throw error;
        }
    }
    async put(key, data) {
        const storageKey = `${this.sessionId}:${key}`;
        const storageStream = `storage-${this.sessionId}`;
        // Store in S2 as a separate stream for storage - fail fast
        await this.client.records.append({
            stream: storageStream,
            s2Basin: this.basin,
            appendInput: {
                records: [{
                        body: JSON.stringify({
                            key: storageKey,
                            data: data
                        })
                    }]
            }
        });
        return storageKey;
    }
    async get(storageKey) {
        // Retrieve from S2 storage stream using batch API
        const storageStream = `storage-${this.sessionId}`;
        try {
            const batch = await this.client.records.read({
                stream: storageStream,
                s2Basin: this.basin,
                seqNum: 0,
                count: 10000
            });
            // Process batch records
            if (batch.records && Array.isArray(batch.records)) {
                for (const record of batch.records) {
                    try {
                        const stored = JSON.parse(record.body);
                        if (stored.key === storageKey) {
                            return stored.data;
                        }
                    }
                    catch (e) {
                        // Skip invalid records
                    }
                }
            }
        }
        catch (error) {
            // HTTP 416 (TailResponse) means stream is empty - key doesn't exist
            if (error.statusCode === 416 || error.constructor?.name === 'TailResponse') {
                throw new Error(`Storage key not found: ${storageKey}`);
            }
            // Re-throw other errors
            throw error;
        }
        // Not found
        throw new Error(`Storage key not found: ${storageKey}`);
    }
}
/**
 * Factory function to create appropriate stream based on configuration
 */
function createExplorationStream(sessionId) {
    if (config_1.S2_CONFIG.enabled && config_1.S2_CONFIG.accessToken && config_1.S2_CONFIG.basin) {
        return new S2Stream(sessionId, config_1.S2_CONFIG.accessToken, config_1.S2_CONFIG.basin);
    }
    else {
        return new InMemoryStream(sessionId);
    }
}
//# sourceMappingURL=client.js.map