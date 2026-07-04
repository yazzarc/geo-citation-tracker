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

async def query_model(brand, query, model_name):
    try:
        response = await client.chat.completions.create(
            model=MODELS[model_name],
            messages=[{"role": "user", "content": query}]
        )
        answer = response.choices[0].message.content
        is_mentioned = brand.lower() in answer.lower()

        sentiment = "neutral"
        if is_mentioned:
            positive_words = ["best", "recommend", "great", "top", "excellent", "good", "popular", "loved", "trusted", "effective"]
            negative_words = ["avoid", "bad", "worst", "poor", "harmful", "dangerous", "overpriced", "disappointing"]
            answer_lower = answer.lower()
            pos_score = sum(1 for w in positive_words if w in answer_lower)
            neg_score = sum(1 for w in negative_words if w in answer_lower)
            if pos_score > neg_score:
                sentiment = "positive"
            elif neg_score > pos_score:
                sentiment = "negative"

        return {
            "query": query,
            "mentioned": is_mentioned,
            "sentiment": sentiment,
            "response": answer[:300],
            "error": None
        }
    except Exception as e:
        error_msg = str(e)
        if "rate_limit" in error_msg.lower() or "429" in error_msg:
            error_text = "Rate limit reached. Please try again in a few minutes."
        else:
            error_text = "Something went wrong."
        return {
            "query": query,
            "mentioned": False,
            "sentiment": "neutral",
            "response": "",
            "error": error_text
        }
    

@app.get("/")
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

@app.post("/track")
async def track(req: TrackRequest):
    results = []

    for brand in req.brands:
        brand_data = {"brand": brand, "models": {}}

        for model_name in req.models:
            tasks = [query_model(brand, query, model_name) for query in req.queries]
            details = await asyncio.gather(*tasks)

            mentioned = sum(1 for d in details if d["mentioned"])
            score = (mentioned / len(req.queries)) * 100

            brand_data["models"][model_name] = {
                "score": round(score),
                "details": details
            }

        results.append(brand_data)

    return JSONResponse(
        content={"results": results},
        headers={"Access-Control-Allow-Origin": "*"}
    )