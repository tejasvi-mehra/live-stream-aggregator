
import { apiUrl } from './apiBase';

export interface YouTubeLiveResult {
  isLive: boolean;
  channelId?: string;
  title?: string;
  error?: string;
  method?: 'scrape' | 'data_api';
}

export async function resolveYouTubeLive(
  channelUrl?: string,
  channelId?: string
): Promise<YouTubeLiveResult> {
  const params = new URLSearchParams();
  if (channelId) {
    params.set('channelId', channelId);
  } else if (channelUrl) {
    params.set('channelUrl', channelUrl);
  } else {
    return { isLive: false, error: 'Missing YouTube channel URL or ID' };
  }

  try {
    const response = await fetch(apiUrl(`/api/youtube/live?${params.toString()}`));
    return (await response.json()) as YouTubeLiveResult;
  } catch (error) {
    return {
      isLive: false,
      error: error instanceof Error ? error.message : 'YouTube lookup failed',
    };
  }
}

export function buildYouTubeLiveEmbedUrl(channelId: string): string {
  const params = new URLSearchParams({
    channel: channelId,
    autoplay: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  return `https://www.youtube.com/embed/live_stream?${params.toString()}`;
}
