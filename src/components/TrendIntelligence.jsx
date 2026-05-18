import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { trendMomentumData, categoryGrowth, aestheticProfiles } from "../data/trends";

const radarData = [
  { subject: "Outerwear", value: 85 },
  { subject: "Tops", value: 91 },
  { subject: "Bottoms", value: 80 },
  { subject: "Footwear", value: 90 },
  { subject: "Accessories", value: 72 },
  { subject: "Layering", value: 68 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip__row" style={{ color: p.color }}>
          <span>{p.name}</span><span>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const signals = [
  { signal: "Logo-free premium positioning accelerating", confidence: 96, source: "Search & social" },
  { signal: "Technical fabric demand up 31% YoY", confidence: 91, source: "Trade data" },
  { signal: "Monochrome colourways dominating editorial", confidence: 88, source: "Editorial scan" },
  { signal: "Oversized silhouettes plateauing — structured relaxed rising", confidence: 84, source: "Resale data" },
  { signal: "Fleece revival showing sustained 28% growth", confidence: 86, source: "Search volume" },
  { signal: "Heritage outdoor references replacing pure streetwear", confidence: 79, source: "Brand analysis" },
];

export default function TrendIntelligence() {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Trend Intelligence</h1>
          <p className="page__subtitle">Signal tracking across search, social, resale and editorial — luxury minimalist streetwear.</p>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card chart-card--wide">
          <div className="chart-card__header">
            <h2 className="chart-card__title">Category Volume by Search Demand</h2>
            <span className="badge badge--green">May 2026</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={categoryGrowth} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis dataKey="category" tick={{ fill: "#888", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#888", fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="volume" name="Volume Index" fill="#7A8C7E" radius={[3, 3, 0, 0]} />
              <Bar dataKey="growth" name="Growth %" fill="#C9B99A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-card__header">
            <h2 className="chart-card__title">Category Radar</h2>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#2a2a2a" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "#888", fontSize: 11 }} />
              <Radar name="Demand" dataKey="value" stroke="#C9B99A" fill="#C9B99A" fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: "1.5rem" }}>
        <div className="chart-card__header">
          <h2 className="chart-card__title">Live Market Signals</h2>
          <span className="badge badge--muted">Confidence scored</span>
        </div>
        <div className="signal-list">
          {signals.map((s) => (
            <div key={s.signal} className="signal-row">
              <div className="signal-row__dot" style={{ background: s.confidence > 90 ? "#7A8C7E" : s.confidence > 80 ? "#C9B99A" : "#888" }} />
              <div className="signal-row__body">
                <div className="signal-row__text">{s.signal}</div>
                <div className="signal-row__source">{s.source}</div>
              </div>
              <div className="signal-row__right">
                <div className="confidence-bar">
                  <div className="confidence-bar__fill" style={{ width: `${s.confidence}%` }} />
                </div>
                <span className="signal-row__conf">{s.confidence}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="aesthetic-grid">
        {aestheticProfiles.map((profile) => (
          <div key={profile.id} className="aesthetic-card">
            <div className="aesthetic-card__swatch" style={{ background: profile.color }} />
            <div className="aesthetic-card__body">
              <div className="aesthetic-card__name">{profile.name}</div>
              <div className="aesthetic-card__desc">{profile.description}</div>
              <div className="aesthetic-card__trait">
                <span className="label">Character:</span> {profile.characterTrait}
              </div>
              <div className="aesthetic-card__score">
                <div className="score-bar">
                  <div className="score-bar__fill" style={{ width: `${profile.growthScore}%`, background: profile.color }} />
                </div>
                <span>{profile.growthScore}/100</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
