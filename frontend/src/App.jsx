import { useState } from 'react'
import './App.css'

function App() {
  const [brands, setBrands] = useState("Mamaearth, Plum, Minimalist")
  const [queries, setQueries] = useState("which skincare brands should I use in India\nrecommend me Indian skincare brands\ntop affordable skincare brands India")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)

  const trackNow = async () => {
    setLoading(true)
    setResults(null)

    const brandList = brands.split(",").map(b => b.trim())
    const queryList = queries.split("\n").map(q => q.trim()).filter(q => q)
    const modelList = ["LLaMA 3.3", "LLaMA 3.1",]

    try {
      const res = await fetch("https://geo-citation-tracker-production.up.railway.app/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brands: brandList, queries: queryList, models: modelList })
      })
      const data = await res.json()
      setResults(data.results)
    } catch (err) {
      alert("Error connecting to backend. Make sure FastAPI is running.")
    }

    setLoading(false)
  }

  const getColor = (score) => {
    if (score >= 60) return "#22c55e"
    if (score >= 30) return "#f59e0b"
    return "#ef4444"
  }

  return (
    <div className="app">
      <h1>🔍 AI Citation Tracker</h1>
      <p className="subtitle">Track your brand visibility across AI models</p>

      <div className="input-section">
        <div className="input-group">
          <label>Brands (comma separated)</label>
          <input value={brands} onChange={e => setBrands(e.target.value)} />
        </div>

        <div className="input-group">
          <label>Queries (one per line)</label>
          <textarea value={queries} onChange={e => setQueries(e.target.value)} rows={4} />
        </div>

        <button onClick={trackNow} disabled={loading}>
          {loading ? "Tracking..." : "🚀 Track Now"}
        </button>
      </div>

      {results && (
        <div className="results">
          {results.map((brandData, i) => (
            <div className="brand-card" key={i}>
              <h2>{brandData.brand}</h2>
              {Object.entries(brandData.models).map(([modelName, data]) => (
                <div className="model-row" key={modelName}>
                  <div className="model-header">
                    <span>{modelName}</span>
                    <span style={{ color: getColor(data.score) }}>{data.score}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${data.score}%`, backgroundColor: getColor(data.score) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App