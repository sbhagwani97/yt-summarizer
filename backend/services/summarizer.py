import json
import logging
import re
import httpx
from youtube_transcript_api import YouTubeTranscriptApi
from config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a YouTube video summarizer. First detect the video type from the transcript, then return a structured JSON summary tailored to that type.

Respond ONLY with a valid JSON object — no markdown, no extra text.

The JSON must always have these top-level fields:
{
  "type": "<one of: recipe, tutorial, review, educational, news, entertainment, other>",
  "overview": "<2-3 sentence plain-language overview of the video>",
  "sections": [ ... ],
  "highlights": ["<key takeaway 1>", "<key takeaway 2>", ...(5-8 items)]
}

The "sections" array depends on the video type:

For "recipe":
  sections: [
    { "label": "Ingredients", "style": "checklist", "items": ["item 1", "item 2", ...] },
    { "label": "Steps", "style": "steps", "items": ["step 1", "step 2", ...] },
    { "label": "Tips", "style": "bullets", "items": ["tip 1", ...] }
  ]

For "tutorial":
  sections: [
    { "label": "What You'll Need", "style": "checklist", "items": ["..."] },
    { "label": "Steps", "style": "steps", "items": ["step 1", "step 2", ...] },
    { "label": "Pro Tips", "style": "bullets", "items": ["..."] }
  ]

For "review":
  sections: [
    { "label": "What's Being Reviewed", "style": "text", "content": "..." },
    { "label": "Pros", "style": "bullets", "items": ["..."] },
    { "label": "Cons", "style": "bullets", "items": ["..."] },
    { "label": "Verdict", "style": "text", "content": "..." }
  ]

For "educational":
  sections: [
    { "label": "Key Concepts", "style": "bullets", "items": ["..."] },
    { "label": "Deep Dive", "style": "text", "content": "<detailed explanation covering all major points>" },
    { "label": "Takeaways", "style": "bullets", "items": ["..."] }
  ]

For "news":
  sections: [
    { "label": "What Happened", "style": "text", "content": "..." },
    { "label": "Key Facts", "style": "checklist", "items": ["..."] },
    { "label": "Context", "style": "text", "content": "..." }
  ]

For "entertainment" or "other":
  sections: [
    { "label": "Summary", "style": "text", "content": "<thorough summary>" },
    { "label": "Key Moments", "style": "bullets", "items": ["..."] }
  ]

Be thorough and specific. Use plain conversational language, not formal or robotic."""


def extract_video_id(video_url: str) -> str:
    """Extract video ID from YouTube URL."""
    if "youtube.com/watch?v=" in video_url:
        return video_url.split("v=")[1].split("&")[0]
    elif "youtu.be/" in video_url:
        return video_url.split("youtu.be/")[1].split("?")[0]
    return video_url


async def summarize_video(video_url: str) -> dict:
    """Summarize a YouTube video using TogetherAI."""
    # Get video ID and transcript
    video_id = extract_video_id(video_url)

    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        # Pick the first available transcript (any language)
        transcript = transcript_list.find_transcript(
            [t.language_code for t in transcript_list]
        )
        fetched = transcript.fetch()
        transcript_text = " ".join([item.text for item in fetched])
        # Truncate to ~4000 tokens worth of text to stay within model limits
        transcript_text = transcript_text[:12000]
    except Exception as e:
        raise ValueError(f"Failed to get transcript: {str(e)}")

    # Call TogetherAI API
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.together.xyz/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.TOGETHER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-ai/DeepSeek-V3.1",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Video transcript:\n\n{transcript_text}"},
                ],
                "temperature": 0.7,
                "max_tokens": 2000,
            },
        )

    if response.status_code != 200:
        raise ValueError(f"TogetherAI API error: {response.text}")

    result = response.json()
    content = result["choices"][0]["message"]["content"]
    logger.info("Raw model response: %s", content)

    # Strip markdown code blocks if present
    content = re.sub(r"```(?:json)?", "", content).strip()

    # Extract JSON object from response in case model added surrounding text
    match = re.search(r"\{.*\}", content, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON found in model response: {content}")

    return json.loads(match.group())
