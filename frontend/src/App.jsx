import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import './App.css'

const AVAILABLE_MODELS = ["LLaMA 3.3", "LLaMA 3.1"]

function App() {
  const [brands, setBrands] = useState("")
const [queries, setQueries] = useState("")
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

  const getChartData = () => {
    if (!results) return []
    return results.map(brandData => {
      const row = { brand: brandData.brand }
      Object.entries(brandData.models).forEach(([modelName, data]) => {
        row[modelName] = data.score
      })
      return row
    })
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

  const chartData = getChartData()
  const modelColors = { "LLaMA 3.3": "#6366f1", "LLaMA 3.1": "#22c55e" }

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
          {loading ? "⏳ Tracking..." : "🚀 Track Now"}
        </button>
      </div>

      {errorMsg && <div className="error-banner">⚠️ {errorMsg}</div>}

      {results && (
        <>
          {/* BAR CHART */}
<div className="chart-section">
  <div className="chart-header">
    <h3>📊 AI Visibility Comparison</h3>
    <p className="chart-sub">Visibility score across AI models — higher is better</p>
  </div>

  <ResponsiveContainer width="100%" height={320}>
    <BarChart
      data={chartData}
      margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
      barCategoryGap="30%"
      barGap={4}
    >
      <XAxis
        dataKey="brand"
        tick={{ fill: '#aaa', fontSize: 13, fontWeight: 600 }}
        axisLine={{ stroke: '#2a2a2a' }}
        tickLine={false}
      />
      <YAxis
        domain={[0, 100]}
        tick={{ fill: '#666', fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        unit="%"
      />
      <Tooltip
        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
        contentStyle={{
          background: '#111',
          border: '1px solid #2a2a2a',
          borderRadius: '10px',
          padding: '10px 16px'
        }}
        labelStyle={{ color: '#fff', fontWeight: 700, marginBottom: 6 }}
        itemStyle={{ color: '#ccc', fontSize: 13 }}
        formatter={(value, name) => [`${value}%`, name]}
      />
      {selectedModels.map(model => (
        <Bar
          key={model}
          dataKey={model}
          fill={modelColors[model]}
          radius={[6, 6, 0, 0]}
          maxBarSize={60}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={index}
              fill={entry[model] >= 60 ? '#22c55e' : entry[model] >= 30 ? '#f59e0b' : modelColors[model]}
              fillOpacity={0.9}
            />
          ))}
        </Bar>
      ))}
    </BarChart>
  </ResponsiveContainer>

  <div className="chart-legend">
    {selectedModels.map(model => (
      <div key={model} className="legend-item">
        <span className="legend-dot" style={{ background: modelColors[model] }}></span>
        <span>{model}</span>
      </div>
    ))}
    <div className="legend-item">
      <span className="legend-dot" style={{ background: '#22c55e' }}></span>
      <span>60%+ Good</span>
    </div>
    <div className="legend-item">
      <span className="legend-dot" style={{ background: '#f59e0b' }}></span>
      <span>30-59% Medium</span>
    </div>
    <div className="legend-item">
      <span className="legend-dot" style={{ background: '#6366f1' }}></span>
      <span>0-29% Low</span>
    </div>
  </div>
</div>

          {/* BRAND CARDS */}
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