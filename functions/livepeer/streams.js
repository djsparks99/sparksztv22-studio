export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const body = await request.json().catch(() => ({}));
    const streamName = body.name || "stream-session";

    const apiKey = env.LIVEPEER_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "LIVEPEER_API_KEY environment variable is not configured in Cloudflare Pages.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const livepeerResponse = await fetch("https://livepeer.studio/api/stream", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: streamName }),
    });

    if (!livepeerResponse.ok) {
      const errorText = await livepeerResponse.text();
      return new Response(
        JSON.stringify({
          error: "Livepeer API request failed",
          details: errorText,
        }),
        {
          status: livepeerResponse.status,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const streamData = await livepeerResponse.json();

    return new Response(
      JSON.stringify({
        id: streamData.id,
        streamKey: streamData.streamKey,
        playbackId: streamData.playbackId,
        stream_key: streamData.streamKey,
        playback_id: streamData.playbackId,
        rtmp_url: "rtmp://rtmp.livepeer.com/live",
        playback_url: `https://livepeer.com/playback/${streamData.playbackId}/index.m3u8`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
