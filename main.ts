import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";
import { config } from "https://deno.land/x/dotenv/mod.ts";

const env = config();

const app = new Application();
const router = new Router();

// CORS 미들웨어 추가
app.use(oakCors({ origin: "*" }));

router.post("/extract", async (ctx) => {
  try {
    const body = await ctx.request.body().value;
    const { videoUrl } = body;

    // YouTube API 호출
    const videoId = extractVideoId(videoUrl);
    const transcriptResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${env.YOUTUBE_API_KEY}`
    );
    const transcriptData = await transcriptResponse.json();

    if (!transcriptData.items || transcriptData.items.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "No captions found for this video" };
      return;
    }

    const captionId = transcriptData.items[0].id;
    const captionResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/captions/${captionId}?key=${env.YOUTUBE_API_KEY}`
    );
    const captionData = await captionResponse.text();

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
          { role: "user", content: `다음 텍스트를 한국어로 번역하고 요약해주세요: ${captionData}` }
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

    ctx.response.body = { summary: claudeData.content };
  } catch (error) {
    console.error("Error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "An error occurred while processing the request" };
  }
});

function extractVideoId(url: string): string {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : "";
}

app.use(router.routes());
app.use(router.allowedMethods());

const port = 8000;
console.log(`Server running on http://localhost:${port}`);
await app.listen({ port });
