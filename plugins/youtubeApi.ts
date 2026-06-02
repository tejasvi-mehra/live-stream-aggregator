import type { Connect, Plugin } from 'vite';

interface ParsedChannelRef {
  channelId?: string;
  handle?: string;
  username?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function parseChannelRef(channelUrl: string): ParsedChannelRef {
  const url = new URL(channelUrl);

  const channelMatch = url.pathname.match(/\/channel\/(UC[\w-]+)/i);
  if (channelMatch) {
    return { channelId: channelMatch[1] };
  }

  const handleMatch = url.pathname.match(/\/@([\w.-]+)/);
  if (handleMatch) {
    return { handle: handleMatch[1] };
  }

  const userMatch = url.pathname.match(/\/user\/([\w.-]+)/);
  if (userMatch) {
    return { username: userMatch[1] };
  }

  throw new Error('Unsupported YouTube channel URL. Use /channel/UC..., /@handle, or /user/name.');
}

function channelPageUrl(ref: ParsedChannelRef, channelUrl?: string): string {
  if (ref.channelId) {
    return `https://www.youtube.com/channel/${ref.channelId}`;
  }
  if (ref.handle) {
    return `https://www.youtube.com/@${ref.handle}`;
  }
  if (ref.username) {
    return `https://www.youtube.com/user/${ref.username}`;
  }
  if (channelUrl) {
    return channelUrl.replace(/\/$/, '');
  }
  throw new Error('Could not build YouTube channel URL');
}

function channelLivePageUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}/live`;
}

async function fetchYouTubePage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`YouTube page HTTP ${response.status}`);
  }

  return response.text();
}

function extractChannelId(html: string): string | null {
  const patterns = [
    /"channelId":"(UC[\w-]{22})"/,
    /"externalId":"(UC[\w-]{22})"/,
    /"browseId":"(UC[\w-]{22})"/,
    /\/channel\/(UC[\w-]{22})/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function parseLiveStatus(html: string): { isLive: boolean; title?: string } {
  if (/LIVE_STREAM_OFFLINE|"isLive":false|"isLiveBroadcast":false/.test(html)) {
    if (!/"isLive":true|"isLiveBroadcast":true/.test(html)) {
      return { isLive: false };
    }
  }

  if (/"isLive":true|"isLiveBroadcast":true|"status":"LIVE"/.test(html)) {
    const titleMatch =
      html.match(/"title":\{"simpleText":"([^"]+)"/) ??
      html.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
    return {
      isLive: true,
      title: titleMatch?.[1],
    };
  }

  return { isLive: false };
}

async function resolveChannelId(
  ref: ParsedChannelRef,
  channelUrl?: string
): Promise<string> {
  if (ref.channelId) {
    return ref.channelId;
  }

  const pageUrl = channelPageUrl(ref, channelUrl);
  const html = await fetchYouTubePage(pageUrl);
  const channelId = extractChannelId(html);

  if (!channelId) {
    throw new Error('Could not resolve YouTube channel ID from channel page');
  }

  return channelId;
}

async function checkChannelLive(channelId: string): Promise<{ isLive: boolean; title?: string }> {
  const html = await fetchYouTubePage(channelLivePageUrl(channelId));
  return parseLiveStatus(html);
}

function sendJson(res: Connect.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function youtubeApiPlugin(): Plugin {
  return {
    name: 'live-stream-aggregator-youtube-live',
    configureServer(server) {
      server.middlewares.use('/api/youtube/live', async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const requestUrl = new URL(req.url ?? '/', 'http://localhost');
          const channelUrl = requestUrl.searchParams.get('channelUrl');
          const channelIdParam = requestUrl.searchParams.get('channelId');

          let ref: ParsedChannelRef;
          if (channelIdParam) {
            ref = { channelId: channelIdParam };
          } else if (channelUrl) {
            ref = parseChannelRef(channelUrl);
          } else {
            sendJson(res, 400, { error: 'channelUrl or channelId query param required' });
            return;
          }

          const channelId = await resolveChannelId(ref, channelUrl ?? undefined);
          const live = await checkChannelLive(channelId);

          if (!live.isLive) {
            sendJson(res, 200, { isLive: false, channelId, error: 'Not live' });
            return;
          }

          sendJson(res, 200, {
            isLive: true,
            channelId,
            title: live.title,
          });
        } catch (error) {
          sendJson(res, 500, {
            isLive: false,
            error: error instanceof Error ? error.message : 'YouTube lookup failed',
          });
        }
      });
    },
  };
}
