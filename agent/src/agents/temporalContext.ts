import { ExplorationStream } from '../s2/client';
import { TemporalContextOutput, DiscoveryOutput, TimelineData } from '../types';
import { queryHelpers } from '../tools/sql';

/**
 * Temporal Context Agent - Analyzes timeline patterns
 * 
 * Strategy: Understand when things happened:
 * - Activity spikes
 * - Change frequency
 * - Urgency indicators
 */
export async function temporalContextAgent(
  stream: ExplorationStream,
  projectId: string
): Promise<void> {
  console.log(`[TemporalContext] Starting timeline analysis...`);

  try {
    // 1. Read Discovery event from stream
    const events = await stream.read();
    const discoveryEvent = events.find(e => e.agent === 'discovery' && e.action === 'find_seeds');
    
    if (!discoveryEvent) {
      throw new Error('No discovery event found in stream');
    }

    const seeds = discoveryEvent.output as DiscoveryOutput;
    console.log(`[TemporalContext] Analyzing ${seeds.counts.interactions} interactions, ${seeds.counts.commits} commits`);

    // 2. Analyze interaction timeline
    console.log('[TemporalContext] Analyzing interaction timeline...');
    const { timeline } = await queryHelpers.analyzeTimeline(seeds.interaction_ids);
    
    // 3. Get commit timeline
    console.log('[TemporalContext] Analyzing commit timeline...');
    const commitTimeline = await queryHelpers.getCommitTimeline(seeds.commit_hashes);

    // 4. Calculate metrics
    if (timeline.length === 0) {
      console.log('[TemporalContext] No timeline data available');
      
      await stream.append({
        agent: 'temporal_context',
        phase: 'parallel',
        action: 'analyze_timeline',
        output: {
          date_range: 'N/A',
          activity_spikes: [],
          change_frequency: '0 commits/day',
          urgency_level: 'low' as const,
          summary: 'No timeline data available'
        }
      });
      
      return;
    }

    // Find date range
    const dates = timeline.map((d: any) => new Date(d.date));
    const firstEvent = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
    const lastEvent = new Date(Math.max(...dates.map((d: Date) => d.getTime())));
    const daySpan = Math.max(1, (lastEvent.getTime() - firstEvent.getTime()) / (1000 * 60 * 60 * 24));

    // Identify activity spikes (> 2x average)
    const avgActivity = timeline.reduce((sum: number, d: any) => sum + d.interaction_count, 0) / timeline.length;
    const spikes = timeline
      .filter((d: any) => d.interaction_count > avgActivity * 2)
      .map((d: any) => d.date);

    // Calculate change frequency
    const changeFrequency = seeds.counts.commits / daySpan;
    
    // Determine urgency
    let urgency: 'low' | 'moderate' | 'high';
    if (changeFrequency > 0.5) {
      urgency = 'high';
    } else if (changeFrequency > 0.2) {
      urgency = 'moderate';
    } else {
      urgency = 'low';
    }

    // 5. Create output summary
    const output: TemporalContextOutput = {
      date_range: `${firstEvent.toISOString().split('T')[0]} to ${lastEvent.toISOString().split('T')[0]}`,
      activity_spikes: spikes,
      change_frequency: `${changeFrequency.toFixed(2)} commits/day`,
      urgency_level: urgency,
      summary: `${urgency.toUpperCase()} urgency: ${seeds.counts.commits} changes over ${Math.round(daySpan)} days`
    };

    console.log(`[TemporalContext] Results:`, output);

    // 6. Store full timeline data
    const timelineData: TimelineData = {
      timeline,
      spikes: timeline.filter((d: any) => d.interaction_count > avgActivity * 2),
      commitTimeline,
      metrics: {
        firstEvent,
        lastEvent,
        daySpan,
        changeFrequency,
        urgency
      }
    };

    const timelineKey = await stream.put('temporal_analysis', timelineData);

    // 7. Write findings to stream
    await stream.append({
      agent: 'temporal_context',
      phase: 'parallel',
      action: 'analyze_timeline',
      output,
      storage: {
        timeline: timelineKey
      },
      references: [discoveryEvent.event_id!]
    });

    console.log('[TemporalContext] Analysis written to stream');
  } catch (error) {
    console.error('[TemporalContext] Error:', error);
    
    // Write error event to stream
    await stream.append({
      agent: 'temporal_context',
      phase: 'parallel',
      action: 'error',
      output: {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    
    throw error;
  }
}

