import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import './App.css'

const AVAILABLE_MODELS = ["LLaMA 3.3", "LLaMA 3.1", "LLaMA 4 Scout"]
const API_BASE = "https://geo-citation-tracker-production.up.railway.app"

function App() {
  const [brands, setBrands] = useState("")
const [queries, setQueries] = useState("")
  const [selectedModels, setSelectedModels] = useState(["LLaMA 3.3", "LLaMA 3.1"])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [openReplay, setOpenReplay] = useState(null) // "brand|model|idx" key of the open chip
  const [showInsights, setShowInsights] = useState(false)
  const [simFile, setSimFile] = useState(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simResults, setSimResults] = useState(null)
  const [simError, setSimError] = useState(null)

  // --- History tab state ---
  const [activeTab, setActiveTab] = useState("track") // "track" | "history"
  const [historyBrand, setHistoryBrand] = useState("")
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  const [pastRuns, setPastRuns] = useState([])
  const [compareA, setCompareA] = useState("")
  const [compareB, setCompareB] = useState("")
  const [compareData, setCompareData] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)

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
      const res = await fetch(`${API_BASE}/track`, {
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

  const handleSimulate = async () => {
    if (!simFile) {
      setSimError("Please choose a PDF or text file first.")
      return
    }
    setSimLoading(true)
    setSimResults(null)
    setSimError(null)

    const formData = new FormData()
    formData.append("file", simFile)
    formData.append("models", selectedModels.join(","))

    try {
      const res = await fetch(`${API_BASE}/simulate-content`, {
        method: "POST",
        body: formData
      })
      const data = await res.json()
      if (data.error) {
        setSimError(data.error)
      } else {
        setSimResults(data)
      }
    } catch (err) {
      setSimError("Error connecting to backend. Please try again.")
    }
    setSimLoading(false)
  }

  const fetchHistory = async () => {
    if (!historyBrand.trim()) {
      setHistoryError("Enter a brand name first.")
      return
    }
    setHistoryLoading(true)
    setHistoryError(null)
    setHistoryData(null)
    try {
      const res = await fetch(`${API_BASE}/history?brand=${encodeURIComponent(historyBrand.trim())}`)
      const data = await res.json()
      if (data.error) {
        setHistoryError(data.error)
      } else if (!data.history || data.history.length === 0) {
        setHistoryError("No history found for this brand yet — track it at least once.")
      } else {
        setHistoryData(data.history)
      }
    } catch (err) {
      setHistoryError("Error connecting to backend. Please try again.")
    }
    setHistoryLoading(false)
  }

  const fetchPastRuns = async () => {
    try {
      const res = await fetch(`${API_BASE}/runs`)
      const data = await res.json()
      setPastRuns(data.runs || [])
    } catch (err) {
      // silent — the runs dropdown just stays empty
    }
  }

  const fetchCompare = async () => {
    if (!compareA || !compareB) return
    setCompareLoading(true)
    setCompareData(null)
    try {
      const [resA, resB] = await Promise.all([
        fetch(`${API_BASE}/runs/${compareA}`),
        fetch(`${API_BASE}/runs/${compareB}`)
      ])
      const dataA = await resA.json()
      const dataB = await resB.json()
      setCompareData({ a: dataA, b: dataB })
    } catch (err) {
      // keep it simple — leave compareData null on failure
    }
    setCompareLoading(false)
  }

  const getHistoryChartData = () => {
    if (!historyData) return []
    // group by created_at (rounded to the run), one row per timestamp, one line per model
    const byTime = {}
    historyData.forEach(row => {
      const t = new Date(row.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      if (!byTime[t]) byTime[t] = { time: t }
      byTime[t][row.model] = row.score
    })
    return Object.values(byTime)
  }

  const getColor = (score) => {
    if (score >= 60) return "#4fd1ae"
    if (score >= 30) return "#ffb020"
    return "#ff5d5d"
  }

  const getSentimentEmoji = (sentiment) => {
    if (sentiment === "positive") return "😊"
    if (sentiment === "negative") return "😟"
    return "😐"
  }

  const getSentimentColor = (sentiment) => {
    if (sentiment === "positive") return "#4fd1ae"
    if (sentiment === "negative") return "#ff5d5d"
    return "#ffb020"
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
 const modelColors = { 
  "LLaMA 3.3": "#ffb020", 
  "LLaMA 3.1": "#4fd1ae",
  "LLaMA 4 Scout": "#e8874a"
}

  return (
    <div className="app">
      <div className="app-header">
        <div className="eyebrow"><span className="dot"></span>Live signal tracking</div>
        <h1>AI Citation Tracker</h1>
        <p className="subtitle">Track your brand visibility across AI models</p>
        <div className="scan-rule"></div>
      </div>

      <div className="tab-switcher" style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '1.5rem 0' }}>
        <button
          className={`model-chip ${activeTab === 'track' ? 'active' : ''}`}
          onClick={() => setActiveTab('track')}
        >
          🚀 Track
        </button>
        <button
          className={`model-chip ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => { setActiveTab('history'); fetchPastRuns() }}
        >
          📈 History
        </button>
      </div>

      {activeTab === 'history' && (
        <div className="input-section">
          <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>
            <span className="dot"></span>Score over time
          </div>

          <div className="input-group">
            <label>Brand name</label>
            <input value={historyBrand} onChange={e => setHistoryBrand(e.target.value)} placeholder="e.g. nike" />
          </div>
          <button onClick={fetchHistory} disabled={historyLoading}>
            {historyLoading ? "⏳ Loading..." : "📊 Show Trend"}
          </button>

          {historyError && <div className="error-banner">⚠️ {historyError}</div>}

          {historyData && (
            <div className="chart-section" style={{ marginTop: '1.5rem' }}>
              <div className="chart-header">
                <h3>{historyBrand} — visibility over time</h3>
                <p className="chart-sub">Score per model across past runs</p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={getHistoryChartData()} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <XAxis dataKey="time" tick={{ fill: '#8a9186', fontSize: 11, fontFamily: 'IBM Plex Mono' }} axisLine={{ stroke: '#23291f' }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#8a9186', fontSize: 11, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ background: '#0e120f', border: '1px solid #23291f', borderRadius: '6px', padding: '10px 16px', fontFamily: 'IBM Plex Mono' }}
                    labelStyle={{ color: '#f2ede2', fontWeight: 700, marginBottom: 6 }}
                    itemStyle={{ color: '#cfd3c9', fontSize: 13 }}
                  />
                  <Legend wrapperStyle={{ fontFamily: 'IBM Plex Mono', fontSize: 12 }} />
                  {AVAILABLE_MODELS.map(model => (
                    <Line key={model} type="monotone" dataKey={model} stroke={modelColors[model]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="eyebrow" style={{ marginTop: '2.5rem', marginBottom: '0.6rem' }}>
            <span className="dot"></span>Compare two runs
          </div>

          <div className="input-group">
            <label>Run A</label>
            <select value={compareA} onChange={e => setCompareA(e.target.value)} className="model-chip" style={{ width: '100%', textAlign: 'left' }}>
              <option value="">Select a run...</option>
              {pastRuns.map(r => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleString('en-IN')} — {r.brands.join(', ')}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label>Run B</label>
            <select value={compareB} onChange={e => setCompareB(e.target.value)} className="model-chip" style={{ width: '100%', textAlign: 'left' }}>
              <option value="">Select a run...</option>
              {pastRuns.map(r => (
                <option key={r.id} value={r.id}>
                  {new Date(r.created_at).toLocaleString('en-IN')} — {r.brands.join(', ')}
                </option>
              ))}
            </select>
          </div>
          <button onClick={fetchCompare} disabled={compareLoading || !compareA || !compareB}>
            {compareLoading ? "⏳ Comparing..." : "⚖️ Compare Runs"}
          </button>

          {compareData && (
            <div className="results" style={{ marginTop: '1.5rem' }}>
              {['a', 'b'].map(side => (
                <div className="brand-card" key={side}>
                  <h2>Run {side.toUpperCase()} — {new Date(compareData[side].run.created_at).toLocaleString('en-IN')}</h2>
                  {compareData[side].results.map((r, idx) => (
                    <div className="model-row" key={idx}>
                      <div className="model-header">
                        <span>{r.brand} · {r.model}</span>
                        <span style={{ color: getColor(r.score) }}>{r.score}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${r.score}%`, backgroundColor: getColor(r.score) }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'track' && (
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
      )}

      {activeTab === 'track' && (
      <>
      {/* AI CONTENT SIMULATOR */}
      <div className="sim-section">
        <div className="eyebrow" style={{ marginBottom: '0.6rem' }}>
          <span className="dot"></span>AI Content Simulator
        </div>
        <h2 className="sim-heading">Predict before you publish</h2>
        <p className="subtitle" style={{ marginBottom: '1.6rem', marginTop: '0.4rem' }}>
          Upload a blog or article — see its odds of surfacing in AI answers.
        </p>

        <label className="sim-upload-card">
          <input
            type="file"
            accept=".pdf,.txt"
            onChange={e => setSimFile(e.target.files[0])}
            className="sim-file-input"
          />
          <span className="sim-upload-text">
            {simFile ? simFile.name : "Choose a PDF or .txt file"}
          </span>
        </label>

        <button className="sim-analyze-btn" onClick={handleSimulate} disabled={simLoading}>
          {simLoading ? "⏳ Simulating..." : "🔮 Predict AI Visibility"}
        </button>

        {!simResults && !simError && (
          <div className="sim-checklist">
            <div className="sim-checklist-label">Get insights into:</div>
            <div className="sim-check-item"><span className="check-icon">✓</span>AI Visibility Score</div>
            <div className="sim-check-item"><span className="check-icon">✓</span>Detected Subject &amp; Keywords</div>
            <div className="sim-check-item"><span className="check-icon">✓</span>Simulated Query Match</div>
            <div className="sim-check-item"><span className="check-icon">✓</span>Per-Model Breakdown</div>
          </div>
        )}

        {simError && <div className="error-banner" style={{ marginTop: '1rem' }}>⚠️ {simError}</div>}

        {simResults && (
          <div className="sim-results">
            <div className="sim-meta">
              <span className="weakness-label strong" style={{ marginRight: 6 }}>Detected subject:</span>
              {simResults.subject || "unknown"}
            </div>
            <div className="sim-disclaimer">{simResults.disclaimer}</div>

            <div className="sim-score-grid">
              {Object.entries(simResults.models).map(([modelName, data]) => (
                <div className="sim-score-card" key={modelName}>
                  <div className="sim-score-model">{modelName}</div>
                  <div className="sim-score-value" style={{ color: getColor(data.score) }}>{data.score}%</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${data.score}%`, background: getColor(data.score) }}></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="sim-queries">
              <div className="weakness-title" style={{ marginBottom: '0.6rem' }}>Simulated queries used</div>
              {simResults.queries.map((q, qi) => (
                <div key={qi} className="sim-query-row">"{q}"</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {errorMsg && <div className="error-banner">⚠️ {errorMsg}</div>}

      {results && (
        <div className="results-float">
          {/* BAR CHART */}
<div className="chart-section">
  <div className="chart-header">
    <h3>AI Visibility Comparison</h3>
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
        tick={{ fill: '#8a9186', fontSize: 13, fontWeight: 600, fontFamily: 'IBM Plex Mono' }}
        axisLine={{ stroke: '#23291f' }}
        tickLine={false}
      />
      <YAxis
        domain={[0, 100]}
        tick={{ fill: '#8a9186', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
        axisLine={false}
        tickLine={false}
        unit="%"
      />
      <Tooltip
        cursor={{ fill: 'rgba(255,176,32,0.04)' }}
        contentStyle={{
          background: '#0e120f',
          border: '1px solid #23291f',
          borderRadius: '6px',
          padding: '10px 16px',
          fontFamily: 'IBM Plex Mono'
        }}
        labelStyle={{ color: '#f2ede2', fontWeight: 700, marginBottom: 6 }}
        itemStyle={{ color: '#cfd3c9', fontSize: 13 }}
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
              fill={entry[model] >= 60 ? '#4fd1ae' : entry[model] >= 30 ? '#ffb020' : modelColors[model]}
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
      <span className="legend-dot" style={{ background: '#4fd1ae' }}></span>
      <span>60%+ Good</span>
    </div>
    <div className="legend-item">
      <span className="legend-dot" style={{ background: '#ffb020' }}></span>
      <span>30-59% Medium</span>
    </div>
    <div className="legend-item">
      <span className="legend-dot" style={{ background: '#e8874a' }}></span>
      <span>0-29% Low</span>
    </div>
  </div>
</div>

          {/* INSIGHTS TOGGLE */}
          <button className="insights-toggle-btn" onClick={() => setShowInsights(v => !v)}>
            {showInsights ? "▲ Hide AI Insights (Weakness + Citation Replay)" : "🔍 Show AI Insights (Weakness + Citation Replay)"}
          </button>

          {/* BRAND CARDS */}
          <div className="results">
            {results.map((brandData, i) => (
              <div className="brand-card" key={i}>
                <h2>{brandData.brand}</h2>

                {showInsights && brandData.weakness_profile && (
                  <div className="weakness-panel">
                    <div className="weakness-title">Coverage breakdown</div>
                    <div className="weakness-col">
                      <span className="weakness-label strong">Strong</span>
                      {brandData.weakness_profile.strong.length > 0 ? (
                        brandData.weakness_profile.strong.map((tag, ti) => (
                          <div key={ti} className="weakness-tag strong">✓ {tag}</div>
                        ))
                      ) : (
                        <div className="weakness-tag empty">none yet</div>
                      )}
                    </div>
                    <div className="weakness-col">
                      <span className="weakness-label weak">Weak</span>
                      {brandData.weakness_profile.weak.length > 0 ? (
                        brandData.weakness_profile.weak.map((tag, ti) => (
                          <div key={ti} className="weakness-tag weak">✗ {tag}</div>
                        ))
                      ) : (
                        <div className="weakness-tag empty">none</div>
                      )}
                    </div>
                  </div>
                )}
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
                        {data.details.map((d, idx) => {
                          const key = `${brandData.brand}|${modelName}|${idx}`
                          const isOpen = openReplay === key
                          return (
                            <div key={idx} className="replay-wrap">
                              <div
                                className="sentiment-chip"
                                style={{ borderColor: d.mentioned ? getSentimentColor(d.sentiment) : '#333', cursor: (showInsights && d.replay) ? 'pointer' : 'default' }}
                                onClick={() => showInsights && d.replay && setOpenReplay(isOpen ? null : key)}
                                title={d.query}
                              >
                                <span className="sentiment-emoji">{d.mentioned ? getSentimentEmoji(d.sentiment) : '➖'}</span>
                                <span className="sentiment-label" style={{ color: d.mentioned ? getSentimentColor(d.sentiment) : '#666' }}>
                                  {d.mentioned ? d.sentiment : 'not mentioned'}
                                </span>
                                {showInsights && d.replay && <span className="replay-icon">{isOpen ? '▲' : '🔁'}</span>}
                              </div>

                              {showInsights && isOpen && d.replay && (
                                <div className="replay-panel">
                                  <div className="replay-badge">AI Citation Replay · reasoning rationale, not verified sources</div>
                                  <div className="replay-query">"{d.query}"</div>
                                  <div className="replay-row"><strong>Thinking:</strong> {d.replay.thinking || '—'}</div>
                                  <div className="replay-row"><strong>Why selected:</strong> {d.replay.selected || '—'}</div>
                                  <div className="replay-row"><strong>Why ignored:</strong> {d.replay.ignored || '—'}</div>
                                  <div className="replay-row"><strong>Content gap:</strong> {d.replay.content_gap || '—'}</div>
                                </div>
                              )}
                            </div>
                          )
                        })}
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
        </div>
      )}
      </>
      )}
    </div>
  )
}

export default App