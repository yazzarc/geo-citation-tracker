from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from groq import AsyncGroq
from dotenv import load_dotenv
from supabase import create_client, Client
import os
import asyncio
import io
from pypdf import PdfReader

load_dotenv()

app = FastAPI()

client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase: Client | None = create_client(supabase_url, supabase_key) if supabase_url and supabase_key else None

MODELS = {
    "LLaMA 3.3": "llama-3.3-70b-versatile",
    "LLaMA 3.1": "llama-3.1-8b-instant",
}

PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
import httpx


async def get_web_sources(brand: str, query: str):
    """
    Real, search-grounded source coverage — where the brand actually shows up
    for a query, what's missing, what independent sources rank for it.
    Only works once PERPLEXITY_API_KEY is set. Until then, returns available=False
    so the frontend can show an honest "not connected yet" state instead of fake data.
    """
    if not PERPLEXITY_API_KEY:
        return {"available": False}

    prompt = f"""Search for: "{query}"
Does the brand "{brand}" show up in the results? Answer ONLY as JSON, no preamble, no markdown fences:
{{
  "sources_found": ["list of 4-6 real domain names/source types that show up, e.g. Healthline, Reddit, Nykaa, dermatologist blogs"],
  "brand_appears_in": ["where {brand} specifically appears, e.g. Official website only — or [] if nowhere"],
  "missing": ["content types {brand} is missing that competitors/top sources have, e.g. Comparison article, Reddit discussion, Quora answers, Independent reviews"]
}}"""

    try:
        async with httpx.AsyncClient(timeout=30) as http_client:
            resp = await http_client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={"Authorization": f"Bearer {PERPLEXITY_API_KEY}"},
                json={
                    "model": "sonar",
                    "messages": [{"role": "user", "content": prompt}],
                }
            )
            resp.raise_for_status()
            data = resp.json()
            import json as _json
            content = data["choices"][0]["message"]["content"]
            parsed = _json.loads(content)
            parsed["available"] = True
            return parsed
    except Exception as e:
        return {"available": False, "error": str(e)}

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



def extract_text(file_bytes, filename):
    if filename.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(file_bytes))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        text = file_bytes.decode("utf-8", errors="ignore")
    return text.strip()[:6000]  # cap length to keep prompts reasonable


async def generate_likely_queries(content, model_name):
    """From uploaded content, guess 4-5 real search queries people would actually
    type into an AI chat that this content is relevant to."""
    prompt = f"""Here is a piece of content (blog/article):
\"\"\"{content[:3000]}\"\"\"

List 4-5 realistic questions a person might ask an AI assistant (like ChatGPT) where
this content, or the brand/product it discusses, would ideally come up as an answer.
Reply with ONLY the questions, one per line, no numbering, no extra text."""
    try:
        response = await client.chat.completions.create(
            model=MODELS[model_name],
            messages=[{"role": "user", "content": prompt}]
        )
        lines = [l.strip("-• ").strip() for l in response.choices[0].message.content.splitlines() if l.strip()]
        return lines[:5]
    except Exception:
        return []


async def extract_core_subject(content, model_name):
    """Pull out the brand/product name and 3-5 key claims/keywords from the content,
    used to check whether simulated answers actually reflect this content."""
    prompt = f"""Content:
\"\"\"{content[:3000]}\"\"\"

Reply in exactly this format:
SUBJECT: <the main brand or product name this content is about, 1-3 words>
KEYWORDS: <3-5 comma-separated distinctive keywords/claims from the content>"""
    try:
        response = await client.chat.completions.create(
            model=MODELS[model_name],
            messages=[{"role": "user", "content": prompt}]
        )
        text = response.choices[0].message.content
        subject, keywords = "", []
        for line in text.splitlines():
            line = line.strip()
            if line.upper().startswith("SUBJECT:"):
                subject = line.split(":", 1)[1].strip()
            elif line.upper().startswith("KEYWORDS:"):
                keywords = [k.strip().lower() for k in line.split(":", 1)[1].split(",") if k.strip()]
        return subject, keywords
    except Exception:
        return "", []


async def simulate_query_for_model(query, subject, keywords, model_name):
    """Run one simulated query against one model and check if the content's
    subject/keywords surface in the answer."""
    try:
        answer = await get_answer(query, model_name)
    except Exception:
        return {"query": query, "matched": False, "response": ""}
    answer_lower = answer.lower()
    subject_hit = subject and subject.lower() in answer_lower
    keyword_hits = sum(1 for k in keywords if k in answer_lower)
    matched = bool(subject_hit or keyword_hits >= 2)
    return {"query": query, "matched": matched, "response": answer[:300]}


@app.options("/simulate-content")
async def options_simulate():
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )


@app.post("/simulate-content")
async def simulate_content(file: UploadFile = File(...), models: str = Form(...)):
    """
    AI Content Simulator: before publishing, estimate how likely this content
    is to surface in AI answers. This is a HEURISTIC estimate based on simulated
    queries — not a guarantee, since these models aren't web-search-grounded and
    haven't actually seen the unpublished content.
    """
    selected_models = [m.strip() for m in models.split(",") if m.strip() in MODELS]
    if not selected_models:
        selected_models = list(MODELS.keys())

    file_bytes = await file.read()
    content = extract_text(file_bytes, file.filename)

    if not content:
        return JSONResponse(
            content={"error": "Could not extract text from this file."},
            headers={"Access-Control-Allow-Origin": "*"}
        )

    primary_model = selected_models[0]
    subject, keywords = await extract_core_subject(content, primary_model)
    queries = await generate_likely_queries(content, primary_model)

    if not queries:
        return JSONResponse(
            content={"error": "Could not generate simulated queries for this content."},
            headers={"Access-Control-Allow-Origin": "*"}
        )

    per_model_results = {}
    for model_name in selected_models:
        tasks = [simulate_query_for_model(q, subject, keywords, model_name) for q in queries]
        details = await asyncio.gather(*tasks)
        matched = sum(1 for d in details if d["matched"])
        score = round((matched / len(queries)) * 100)
        per_model_results[model_name] = {"score": score, "details": details}

    return JSONResponse(
        content={
            "subject": subject,
            "keywords": keywords,
            "queries": queries,
            "models": per_model_results,
            "disclaimer": "Estimated likelihood based on simulated queries — not a guaranteed outcome."
        },
        headers={"Access-Control-Allow-Origin": "*"}
    )



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

    run_id = None
    if supabase:
        try:
            run_row = supabase.table("runs").insert({
                "brands": req.brands,
                "queries": req.queries,
                "models": req.models,
            }).execute()
            run_id = run_row.data[0]["id"]

            result_rows = []
            for brand in req.brands:
                for model_name, model_data in results[brand]["models"].items():
                    mentioned_count = sum(1 for d in model_data["details"] if d["mentioned"])
                    result_rows.append({
                        "run_id": run_id,
                        "brand": brand,
                        "model": model_name,
                        "score": model_data["score"],
                        "mentioned_count": mentioned_count,
                        "total_queries": len(req.queries),
                    })
            if result_rows:
                supabase.table("results").insert(result_rows).execute()
        except Exception as e:
            # persistence failure should never break the actual tracking response
            print(f"Supabase save failed: {e}")

    return JSONResponse(
        content={"results": list(results.values()), "run_id": run_id},
        headers={"Access-Control-Allow-Origin": "*"}
    )


@app.get("/runs")
async def get_runs(limit: int = 20):
    """List past runs, most recent first."""
    if not supabase:
        return JSONResponse(content={"runs": []}, headers={"Access-Control-Allow-Origin": "*"})
    try:
        res = supabase.table("runs").select("*").order("created_at", desc=True).limit(limit).execute()
        return JSONResponse(content={"runs": res.data}, headers={"Access-Control-Allow-Origin": "*"})
    except Exception as e:
        return JSONResponse(content={"runs": [], "error": str(e)}, headers={"Access-Control-Allow-Origin": "*"})


@app.get("/runs/{run_id}")
async def get_run_detail(run_id: str):
    """Full results for one past run — used for run-to-run comparison."""
    if not supabase:
        return JSONResponse(content={"error": "No database configured."}, headers={"Access-Control-Allow-Origin": "*"})
    try:
        run_res = supabase.table("runs").select("*").eq("id", run_id).single().execute()
        results_res = supabase.table("results").select("*").eq("run_id", run_id).execute()
        return JSONResponse(
            content={"run": run_res.data, "results": results_res.data},
            headers={"Access-Control-Allow-Origin": "*"}
        )
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, headers={"Access-Control-Allow-Origin": "*"})


@app.get("/history")
async def get_history(brand: str, model: str | None = None):
    """Score-over-time for one brand (optionally filtered to one model) — feeds the trend line chart."""
    if not supabase:
        return JSONResponse(content={"history": []}, headers={"Access-Control-Allow-Origin": "*"})
    try:
        query = supabase.table("results").select("score, model, created_at, run_id").eq("brand", brand)
        if model:
            query = query.eq("model", model)
        res = query.order("created_at", desc=False).execute()
        return JSONResponse(content={"history": res.data}, headers={"Access-Control-Allow-Origin": "*"})
    except Exception as e:
        return JSONResponse(content={"history": [], "error": str(e)}, headers={"Access-Control-Allow-Origin": "*"})


def _cors_options():
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )


@app.options("/action-plan")
async def options_action_plan():
    return _cors_options()


@app.options("/generate-reddit-strategy")
async def options_reddit():
    return _cors_options()


@app.options("/generate-blog")
async def options_blog():
    return _cors_options()


@app.options("/source-coverage")
async def options_coverage():
    return _cors_options()


class FixPlanRequest(BaseModel):
    brand: str
    weak_topics: list[str]
    model: str = "LLaMA 3.3"


@app.post("/action-plan")
async def fix_plan(req: FixPlanRequest):
    """
    Fix Plan: takes a brand's weak topics and returns a PRIORITIZED list —
    what to create/answer/publish first, with an estimated impact per item.
    Impact numbers are LLM-estimated, not measured — labeled as such in the UI.
    """
    if not req.weak_topics:
        return JSONResponse(content={"error": "No weak topics provided."}, headers={"Access-Control-Allow-Origin": "*"})

    model_id = MODELS.get(req.model, MODELS["LLaMA 3.3"])
    topics_str = "\n".join(f"- {t}" for t in req.weak_topics)

    prompt = f"""Brand: {req.brand}
This brand is weak (not showing up) in AI answers for these topics:
{topics_str}

Build a prioritized fix plan — rank items by how much they'd likely improve visibility, highest impact first.
Respond ONLY as JSON, no preamble, no markdown fences:
{{
  "plans": [
    {{
      "priority": 1,
      "topic": "...",
      "action_type": "Create | Answer | Publish",
      "content_idea": "one specific piece of content (headline-level, concrete)",
      "distribution": ["2-3 short channel names, e.g. Reddit thread, comparison blog post, Quora answer"],
      "estimated_impact": "rough visibility gain estimate, e.g. +18%",
      "reasoning": "one sentence on why this closes the gap"
    }}
  ]
}}
Order the "plans" array by priority (1 = do first, highest impact)."""

    try:
        response = await client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        import json
        data = json.loads(response.choices[0].message.content)
        return JSONResponse(content=data, headers={"Access-Control-Allow-Origin": "*"})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, headers={"Access-Control-Allow-Origin": "*"})


class RedditStrategyRequest(BaseModel):
    brand: str
    topic: str
    model: str = "LLaMA 3.3"


@app.post("/generate-reddit-strategy")
async def generate_reddit_strategy(req: RedditStrategyRequest):
    """Suggests where/how to engage on Reddit for a weak topic — subreddit, tone, angle, non-promotional framing."""
    model_id = MODELS.get(req.model, MODELS["LLaMA 3.3"])
    prompt = f"""Brand: {req.brand}
Weak topic: {req.topic}

Suggest a Reddit engagement strategy. Respond ONLY as JSON, no preamble, no markdown fences:
{{
  "subreddits": ["2-3 relevant subreddit names, without r/ prefix"],
  "tone": "one short phrase describing the tone to use",
  "avoid": "one short phrase on what NOT to do (e.g. don't sound promotional)",
  "question_to_answer": "a realistic question/thread angle worth answering",
  "sample_opening_line": "one honest, non-salesy opening line for the reply"
}}"""
    try:
        response = await client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        import json
        data = json.loads(response.choices[0].message.content)
        return JSONResponse(content=data, headers={"Access-Control-Allow-Origin": "*"})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, headers={"Access-Control-Allow-Origin": "*"})


class BlogGenRequest(BaseModel):
    brand: str
    topic: str
    model: str = "LLaMA 3.3"


@app.post("/generate-blog")
async def generate_blog(req: BlogGenRequest):
    """Generates an SEO/AI-optimized blog outline (with schema + citation notes) for a weak topic."""
    model_id = MODELS.get(req.model, MODELS["LLaMA 3.3"])
    prompt = f"""Brand: {req.brand}
Weak topic: {req.topic}

Write a blog plan optimized for both SEO and AI-answer visibility. Respond ONLY as JSON, no preamble, no markdown fences:
{{
  "title": "SEO-optimized blog title",
  "outline": ["5-7 section headings in order"],
  "schema_notes": "what structured data/schema markup to add, e.g. FAQ schema, Product schema",
  "internal_links": "what kind of internal pages to link to",
  "external_citations": "what kind of external sources to cite for credibility"
}}"""
    try:
        response = await client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        import json
        data = json.loads(response.choices[0].message.content)
        return JSONResponse(content=data, headers={"Access-Control-Allow-Origin": "*"})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, headers={"Access-Control-Allow-Origin": "*"})


class SourceCoverageRequest(BaseModel):
    brand: str
    query: str


@app.post("/source-coverage")
async def source_coverage(req: SourceCoverageRequest):
    """
    Real search-grounded source coverage (Perplexity-backed). Returns available=False
    with an honest message until PERPLEXITY_API_KEY is set — no fake numbers.
    """
    data = await get_web_sources(req.brand, req.query)
    if not data.get("available"):
        return JSONResponse(
            content={
                "available": False,
                "message": data.get("error") or "Source Coverage needs a Perplexity API key to show real search-grounded data. Add PERPLEXITY_API_KEY to enable it."
            },
            headers={"Access-Control-Allow-Origin": "*"}
        )
    return JSONResponse(content=data, headers={"Access-Control-Allow-Origin": "*"})