import { marketOpportunities } from "../data/trends";
import { Target, Clock, TrendingUp, Shield } from "lucide-react";

const barrierColor = { Low: "#7A8C7E", "Low-Medium": "#C9B99A", Medium: "#C9956A", High: "#9A5A5A" };
const potentialColor = (p) => (p >= 90 ? "#7A8C7E" : p >= 85 ? "#C9B99A" : "#888");

export default function MarketOpportunities() {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Market Gaps</h1>
          <p className="page__subtitle">
            Underserved spaces in premium minimalist streetwear — mapped for brand entry.
          </p>
        </div>
      </div>

      <div className="opp-summary-row">
        <div className="opp-summary-card">
          <Target size={20} />
          <div className="opp-summary-card__val">5</div>
          <div className="opp-summary-card__label">Identified gaps</div>
        </div>
        <div className="opp-summary-card">
          <TrendingUp size={20} />
          <div className="opp-summary-card__val">89</div>
          <div className="opp-summary-card__label">Avg potential score</div>
        </div>
        <div className="opp-summary-card">
          <Clock size={20} />
          <div className="opp-summary-card__val">3–18mo</div>
          <div className="opp-summary-card__label">Entry timeframes</div>
        </div>
        <div className="opp-summary-card">
          <Shield size={20} />
          <div className="opp-summary-card__val">Low–Med</div>
          <div className="opp-summary-card__label">Entry barriers</div>
        </div>
      </div>

      <div className="opp-list">
        {marketOpportunities.map((opp, idx) => (
          <div key={opp.id} className="opp-card">
            <div className="opp-card__left">
              <div className="opp-card__number">0{idx + 1}</div>
              <div
                className="opp-card__potential-ring"
                style={{
                  background: `conic-gradient(${potentialColor(opp.potential)} ${opp.potential}%, #1e1e1e ${opp.potential}%)`,
                }}
              >
                <div className="opp-card__potential-inner">{opp.potential}</div>
              </div>
            </div>

            <div className="opp-card__body">
              <div className="opp-card__top-row">
                <h2 className="opp-card__title">{opp.title}</h2>
                <div className="opp-card__meta-chips">
                  <span
                    className="chip"
                    style={{ background: barrierColor[opp.entryBarrier] + "22", color: barrierColor[opp.entryBarrier] }}
                  >
                    Barrier: {opp.entryBarrier}
                  </span>
                  <span className="chip chip--muted">
                    <Clock size={12} /> {opp.timeframe}
                  </span>
                  <span className="chip chip--muted">{opp.category}</span>
                </div>
              </div>

              <div className="opp-card__gap-box">
                <span className="opp-card__gap-label">The Gap</span>
                <p className="opp-card__gap-text">{opp.gap}</p>
              </div>

              <p className="opp-card__desc">{opp.description}</p>

              <div className="opp-card__bottom">
                <div className="opp-card__strategy-block">
                  <div className="opp-card__strategy-label">Recommended Entry Strategy</div>
                  <div className="opp-card__strategy">{opp.strategy}</div>
                </div>

                <div className="opp-card__competitors-block">
                  <div className="opp-card__competitors-label">Existing players (fragmented)</div>
                  <div className="opp-card__competitors">
                    {opp.competitors.map((c) => (
                      <span key={c} className="competitor-tag">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
