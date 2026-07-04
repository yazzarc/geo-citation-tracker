import { useState } from 'react'
import './App.css'

const AVAILABLE_MODELS = ["LLaMA 3.3", "LLaMA 3.1"]

function App() {
  const [brands, setBrands] = useState("Mamaearth, Plum, Minimalist")
  const [queries, setQueries] = useState("which skincare brands should I use in India\nrecommend me Indian skincare brands\ntop affordable skincare brands India")
  const [selectedModels, setSelectedModels] = useState(["LLaMA 3.3", "LLaMA 3.1"])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const toggleModel = (model) => {
    setSelectedModels(prev =>
      prev.includes(model)
        ? prev.filter(m => m !== model)
        : [...prev, model]
    )
  }

  const trackNow = async () => {
    if (selectedModels.length === 0) {
      setErrorMsg("Please select at least one AI model.")
      return
    }
    setLoading(true)
    setResults(null)
    setErrorMsg(null)

    const brandList = brands.split(",").map(b => b.trim()).filter(b => b)
    const queryList = queries.split("\n").map(q => q.trim()).filter(q => q)

    try {
      const res = await fetch("https://geo-citation-tracker-production.up.railway.app/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brands: brandList, queries: queryList, models: selectedModels })
      })
      const data = await res.json()
      setResults(data.results)
    } catch (err) {
      setErrorMsg("Error connecting to backend. Please try again.")
    }
    setLoading(false)
  }

  const getColor = (score) => {
    if (score >= 60) return "#22c55e"
    if (score >= 30) return "#f59e0b"
    return "#ef4444"
  }

  const getSentimentEmoji = (sentiment) => {
    if (sentiment === "positive") return "😊"
    if (sentiment === "negative") return "😟"
    return "😐"
  }

  const getSentimentColor = (sentiment) => {
    if (sentiment === "positive") return "#22c55e"
    if (sentiment === "negative") return "#ef4444"
    return "#f59e0b"
  }

  const downloadCSV = () => {
    if (!results) return
    let csv = "Brand,Model,Query,Mentioned,Sentiment,Response\n"
    results.forEach(brandData => {
      Object.entries(brandData.models).forEach(([modelName, data]) => {
        data.details.forEach(d => {
          const mentioned = d.error ? "Error" : (d.mentioned ? "Yes" : "No")
          const sentiment = d.sentiment || "neutral"
          const response = d.error ? d.error : d.response.replace(/"/g, '""').replace(/\n/g, ' ')
          csv += `"${brandData.brand}","${modelName}","${d.query.replace(/"/g, '""')}","${mentioned}","${sentiment}","${response}"\n`
        })
      })
    })
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ai_visibility_report_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

        <div className="input-group">
          <label>Select AI Models</label>
          <div className="model-selector">
            {AVAILABLE_MODELS.map(model => (
              <button
                key={model}
                className={`model-chip ${selectedModels.includes(model) ? 'active' : ''}`}
                onClick={() => toggleModel(model)}
              >
                {model}
              </button>
            ))}
          </div>
        </div>

        <button onClick={trackNow} disabled={loading}>
          {loading ? "Tracking..." : "🚀 Track Now"}
        </button>
      </div>

      {errorMsg && <div className="error-banner">⚠️ {errorMsg}</div>}

      {results && (
        <>
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
                      <div className="progress-fill" style={{ width: `${data.score}%`, backgroundColor: getColor(data.score) }} />
                    </div>

                    {data.details && (
                      <div className="sentiment-row">
                        {data.details.map((d, idx) => (
                          <div key={idx} className="sentiment-chip" style={{ borderColor: d.mentioned ? getSentimentColor(d.sentiment) : '#333' }}>
                            <span className="sentiment-emoji">{d.mentioned ? getSentimentEmoji(d.sentiment) : '➖'}</span>
                            <span className="sentiment-label" style={{ color: d.mentioned ? getSentimentColor(d.sentiment) : '#666' }}>
                              {d.mentioned ? d.sentiment : 'not mentioned'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <button className="csv-btn" onClick={downloadCSV}>
            📥 Download CSV Report
          </button>
        </>
      )}
    </div>
  )
}

export default App