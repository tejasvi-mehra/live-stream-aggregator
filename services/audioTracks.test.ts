import { describe, expect, it } from 'vitest';
import {
  findFailoverAudioTrack,
  getEventAudioTracks,
  isAudioTrackPlayable,
} from './audioTracks';
import { StreamEvent, StreamAudioTrack, StreamSource } from '../types';

const buildAudioTrack = (
  id: string,
  url: string,
  reachable: boolean
): StreamAudioTrack => ({
  id,
  url,
  label: id,
  status: {
    reachable,
    latencyMs: reachable ? 50 : null,
    checkedAt: new Date().toISOString(),
  },
});

const buildSource = (
  id: string,
  url: string,
  audioTracks: StreamAudioTrack[] = []
): StreamSource => ({
  id,
  eventId: 'event-1',
  type: 'hls',
  url,
  hidden: false,
  audioTracks,
  status: {
    reachable: true,
    latencyMs: 50,
    checkedAt: new Date().toISOString(),
  },
});

describe('audioTracks', () => {
  it('dedupes event audio tracks by URL', () => {
    const sharedAudio = buildAudioTrack('shared-audio', 'https://example.com/audio.m3u8', true);
    const event: StreamEvent = {
      id: 'event-1',
      name: 'Demo',
      logo: '',
      categoryId: 'soccer',
      categoryName: 'Soccer',
      streams: [
        buildSource('src-0', 'https://example.com/720.m3u8', [sharedAudio]),
        buildSource('src-1', 'https://example.com/240.m3u8', [
          buildAudioTrack('other-id', 'https://example.com/audio.m3u8', true),
        ]),
      ],
    };

    expect(getEventAudioTracks(event)).toHaveLength(1);
  });

  it('failovers to the next playable audio track on another source', () => {
    const deadAudio = buildAudioTrack(
      'dead-audio',
      'https://example.com/dead-audio.m3u8',
      false
    );
    const backupAudio = buildAudioTrack(
      'backup-audio',
      'https://example.com/backup-audio.m3u8',
      true
    );

    const event: StreamEvent = {
      id: 'event-1',
      name: 'Demo',
      logo: '',
      categoryId: 'soccer',
      categoryName: 'Soccer',
      streams: [
        buildSource('src-0', 'https://example.com/720.m3u8', [deadAudio]),
        buildSource('src-1', 'https://example.com/240.m3u8', [backupAudio]),
      ],
    };

    const fallback = findFailoverAudioTrack(event, event.streams[0], deadAudio.id);
    expect(fallback?.id).toBe(backupAudio.id);
    expect(isAudioTrackPlayable(fallback!)).toBe(true);
  });
});
