from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from groq import AsyncGroq
from dotenv import load_dotenv
import os
import asyncio

load_dotenv()

app = FastAPI()

client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

MODELS = {
    "LLaMA 3.3": "llama-3.3-70b-versatile",
    "LLaMA 3.1": "llama-3.1-8b-instant",
}

class TrackRequest(BaseModel):
    brands: list[str]
    queries: list[str]
    models: list[str]

def score_sentiment(answer_lower):
    positive_words = ["best", "recommend", "great", "top", "excellent", "good", "popular", "loved", "trusted", "effective"]
    negative_words = ["avoid", "bad", "worst", "poor", "harmful", "dangerous", "overpriced", "disappointing"]
    pos_score = sum(1 for w in positive_words if w in answer_lower)
    neg_score = sum(1 for w in negative_words if w in answer_lower)
    if pos_score > neg_score:
        return "positive"
    elif neg_score > pos_score:
        return "negative"
    return "neutral"


async def get_answer(query, model_name):
    """One call per (query, model) — the answer doesn't depend on which brand we're checking for."""
    response = await client.chat.completions.create(
        model=MODELS[model_name],
        messages=[{"role": "user", "content": query}]
    )
    return response.choices[0].message.content


async def get_replay(query, answer, all_brands, mentioned_brands, model_name):
    """
    Citation Replay: post-hoc reasoning trace from the model about its own answer.
    IMPORTANT: this is a rationalization the model generates when asked to explain
    itself after the fact — it is NOT the model's actual internal reasoning, and
    since these models aren't web-search-grounded, there are no real "sources"
    either. We label it as reasoning/rationale in the UI, not as ground truth.
    """
    ignored = [b for b in all_brands if b not in mentioned_brands]
    replay_prompt = f"""You already answered this query: "{query}"
Your answer was: "{answer}"

Brands being tracked: {', '.join(all_brands)}
Brands your answer mentioned: {', '.join(mentioned_brands) if mentioned_brands else 'none'}
Brands your answer did NOT mention: {', '.join(ignored) if ignored else 'none'}

Explain, briefly and honestly, in plain text with these exact labeled lines:
THINKING: <1 sentence on what factors likely shaped the answer, e.g. price, popularity, category fit>
SELECTED: <1 sentence on why the mentioned brand(s) fit, or "none mentioned" if none>
IGNORED: <1 sentence on why the other brand(s) were likely left out, or "none" if all were mentioned>
CONTENT_GAP: <1 sentence: what kind of content/positioning the ignored brand(s) seem to be missing>"""

    try:
        response = await client.chat.completions.create(
            model=MODELS[model_name],
            messages=[{"role": "user", "content": replay_prompt}]
        )
        text = response.choices[0].message.content
        replay = {"thinking": "", "selected": "", "ignored": "", "content_gap": ""}
        for line in text.splitlines():
            line = line.strip()
            if line.upper().startswith("THINKING:"):
                replay["thinking"] = line.split(":", 1)[1].strip()
            elif line.upper().startswith("SELECTED:"):
                replay["selected"] = line.split(":", 1)[1].strip()
            elif line.upper().startswith("IGNORED:"):
                replay["ignored"] = line.split(":", 1)[1].strip()
            elif line.upper().startswith("CONTENT_GAP:"):
                replay["content_gap"] = line.split(":", 1)[1].strip()
        return replay
    except Exception:
        return None
    

async def get_topic(query, model_name):
    """Extract a short attribute/topic tag for a query, e.g. 'best running shoes
    under 5000' -> 'running'. Used to group mentions into strengths/weaknesses."""
    try:
        response = await client.chat.completions.create(
            model=MODELS[model_name],
            messages=[{"role": "user", "content": f"""Query: "{query}"
In 1-2 lowercase words, name the single core attribute or use-case this query is about (e.g. "running", "waterproof", "budget", "durability", "marathon"). Reply with ONLY the words, nothing else."""}]
        )
        tag = response.choices[0].message.content.strip().lower()
        tag = tag.strip('."\'').split("\n")[0]
        return tag[:30] if tag else "general"
    except Exception:
        return "general"


def build_weakness_profile(brand, query_topics, all_details_by_query):
    """
    Competitor Weakness Detector: for a brand, bucket each query's topic into
    'strong' (brand was mentioned for that topic in at least one model) or
    'weak' (brand was never mentioned for that topic).
    """
    strong, weak = set(), set()
    for query, topic in query_topics.items():
        mentioned_anywhere = any(d["mentioned"] for d in all_details_by_query[query] if d["brand"] == brand)
        if mentioned_anywhere:
            strong.add(topic)
        else:
            weak.add(topic)
    # a topic shouldn't be both — if mentioned in even one model call, it counts as strong
    weak -= strong
    return {"strong": sorted(strong), "weak": sorted(weak)}



async def root():
    return JSONResponse(
        content={"status": "AI Citation Tracker API Running"},
        headers={"Access-Control-Allow-Origin": "*"}
    )

@app.options("/track")
async def options_track():
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )

async def process_query(query, model_name, brands, include_replay):
    """Fetch one answer for this query+model, check every brand against it, and
    optionally attach a comparative citation replay."""
    try:
        answer = await get_answer(query, model_name)
    except Exception as e:
        error_msg = str(e)
        if "rate_limit" in error_msg.lower() or "429" in error_msg:
            error_text = "Rate limit reached. Please try again in a few minutes."
        else:
            error_text = "Something went wrong."
        return {b: {"brand": b, "query": query, "mentioned": False, "sentiment": "neutral", "response": "", "error": error_text, "replay": None} for b in brands}

    answer_lower = answer.lower()
    mentioned_brands = [b for b in brands if b.lower() in answer_lower]

    replay = None
    if include_replay:
        replay = await get_replay(query, answer, brands, mentioned_brands, model_name)

    per_brand = {}
    for b in brands:
        is_mentioned = b in mentioned_brands
        per_brand[b] = {
            "brand": b,
            "query": query,
            "mentioned": is_mentioned,
            "sentiment": score_sentiment(answer_lower) if is_mentioned else "neutral",
            "response": answer[:300],
            "error": None,
            "replay": replay
        }
    return per_brand


@app.post("/track")
async def track(req: TrackRequest, include_replay: bool = True, include_weakness: bool = True):
    results = {b: {"brand": b, "models": {}} for b in req.brands}
    # collects every detail across all models, keyed by query, for the weakness profile
    all_details_by_query = {q: [] for q in req.queries}

    for model_name in req.models:
        tasks = [process_query(query, model_name, req.brands, include_replay) for query in req.queries]
        query_results = await asyncio.gather(*tasks)  # list of {brand: detail}, one per query

        for query, qr in zip(req.queries, query_results):
            all_details_by_query[query].extend(qr.values())

        for brand in req.brands:
            details = [qr[brand] for qr in query_results]
            mentioned = sum(1 for d in details if d["mentioned"])
            score = (mentioned / len(req.queries)) * 100
            results[brand]["models"][model_name] = {
                "score": round(score),
                "details": details
            }

    if include_weakness and req.queries:
        topic_model = req.models[0]
        unique_queries = list(dict.fromkeys(req.queries))
        topic_tasks = [get_topic(q, topic_model) for q in unique_queries]
        topics = await asyncio.gather(*topic_tasks)
        query_topics = dict(zip(unique_queries, topics))

        for brand in req.brands:
            results[brand]["weakness_profile"] = build_weakness_profile(brand, query_topics, all_details_by_query)

    return JSONResponse(
        content={"results": list(results.values())},
        headers={"Access-Control-Allow-Origin": "*"}
    )