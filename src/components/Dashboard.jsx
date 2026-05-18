import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, Package, Target, Layers, ArrowUpRight } from "lucide-react";
import { trendMomentumData, categoryGrowth, clothingItems, marketOpportunities } from "../data/trends";

const statCards = [
  { label: "Trends Tracked", value: "48", delta: "+6 this month", icon: TrendingUp, color: "#C9B99A" },
  { label: "Clothing Items", value: "12", delta: "4 categories", icon: Package, color: "#7A8C7E" },
  { label: "Market Gaps", value: "5", delta: "High potential", icon: Target, color: "#4A4A5A" },
  { label: "Aesthetic Profiles", value: "4", delta: "Rising scores", icon: Layers, color: "#8B6F47" },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip__row" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard({ onNav }) {
  const topItems = [...clothingItems].sort((a, b) => b.trendScore - a.trendScore).slice(0, 4);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Intelligence Overview</h1>
          <p className="page__subtitle">Premium luxury streetwear — minimalist niche. May 2026.</p>
        </div>
      </div>

      <div className="stat-grid">
        {statCards.map(({ label, value, delta, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-card__icon" style={{ background: color + "22", color }}>
              <Icon size={20} />
            </div>
            <div className="stat-card__body">
              <div className="stat-card__value">{value}</div>
              <div className="stat-card__label">{label}</div>
              <div className="stat-card__delta">{delta}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="chart-card chart-card--wide">
          <div className="chart-card__header">
            <h2 className="chart-card__title">Aesthetic Momentum (6 months)</h2>
            <span className="badge badge--green">Live Tracking</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendMomentumData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="month" tick={{ fill: "#888", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#888", fontSize: 12 }} axisLine={false} tickLine={false} domain={[50, 100]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#aaa" }} />
              <Line type="monotone" dataKey="quietLuxury" name="Quiet Luxury" stroke="#C9B99A" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="utilitarian" name="Utilitarian Minimal" stroke="#7A8C7E" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="deconstructed" name="Deconstructed Art" stroke="#9A8FC9" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="heritageSport" name="Heritage Sport" stroke="#C9956A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-card__header">
            <h2 className="chart-card__title">Category Growth %</h2>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={categoryGrowth} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis dataKey="category" tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="growth" name="Growth %" fill="#C9B99A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="section-row">
        <div className="list-card">
          <div className="list-card__header">
            <h2 className="list-card__title">Top Trending Items</h2>
            <button className="link-btn" onClick={() => onNav("catalogue")}>View all <ArrowUpRight size={14} /></button>
          </div>
          <div className="item-list">
            {topItems.map((item) => (
              <div key={item.id} className="item-row">
                <div className="item-row__info">
                  <div className="item-row__name">{item.name}</div>
                  <div className="item-row__meta">{item.aesthetic} · {item.category}</div>
                </div>
                <div className="item-row__right">
                  <div className="score-bar">
                    <div className="score-bar__fill" style={{ width: `${item.trendScore}%` }} />
                  </div>
                  <span className="item-row__score">{item.trendScore}</span>
                  <span className={`badge badge--${item.momentum}`}>{item.momentum}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="list-card">
          <div className="list-card__header">
            <h2 className="list-card__title">Top Market Gaps</h2>
            <button className="link-btn" onClick={() => onNav("opportunities")}>View all <ArrowUpRight size={14} /></button>
          </div>
          <div className="item-list">
            {marketOpportunities.slice(0, 4).map((opp) => (
              <div key={opp.id} className="item-row">
                <div className="item-row__info">
                  <div className="item-row__name">{opp.title}</div>
                  <div className="item-row__meta">{opp.timeframe} · Barrier: {opp.entryBarrier}</div>
                </div>
                <div className="item-row__right">
                  <div className="score-bar">
                    <div className="score-bar__fill score-bar__fill--gold" style={{ width: `${opp.potential}%` }} />
                  </div>
                  <span className="item-row__score">{opp.potential}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
