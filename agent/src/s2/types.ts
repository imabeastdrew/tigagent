import { ExplorationEvent } from '../types';

export interface StreamFilter {
  agent?: string;
  since_id?: string;
}

export interface IExplorationStream {
  sessionId: string;
  
  append(event: Omit<ExplorationEvent, 'event_id' | 'timestamp'>): Promise<string>;
  read(filter?: StreamFilter): Promise<ExplorationEvent[]>;
  put(key: string, data: any): Promise<string>;
  get(storageKey: string): Promise<any>;
}

