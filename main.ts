// main.ts
import { serve } from "https://deno.land/std@0.140.0/http/server.ts";
import { config } from "https://deno.land/x/dotenv/mod.ts";

const env = config();

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "POST") {
    const { videoUrl } = await request.json();
    
    // YouTube API 호출
    const ytResponse = await fetch(`https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${getVideoId(videoUrl)}&key=${env.YOUTUBE_API_KEY}`);
    const ytData = await ytResponse.json();
    
    // Claude API 호출
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.CLAUDE_API_KEY,
      },
      body: JSON.stringify({
        model: "claude-3.5-sonnet",
        max_tokens: 1000,
        messages: [
          { role: "user", content: `다음 텍스트를 한국어로 번역하고 요약해주세요: ${ytData.items[0].snippet.text}` }
        ]
      }),
    });
    const claudeData = await claudeResponse.json();
    
    // Notion API 호출
    await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: env.NOTION_DATABASE_ID },
        properties: {
          Title: { title: [{ text: { content: videoUrl } }] },
          Content: { rich_text: [{ text: { content: claudeData.content } }] }
        }
      }),
    });

    return new Response(JSON.stringify({ success: true, summary: claudeData.content }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

function getVideoId(url: string): string {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : "";
}

serve(handleRequest);
