import { useState } from "react";
import { Search, Filter } from "lucide-react";
import { clothingItems, trendCategories } from "../data/trends";

const momentumColors = { rising: "#7A8C7E", peak: "#C9B99A", stable: "#888" };

export default function ClothingCatalogue() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("trendScore");

  const filtered = clothingItems
    .filter((item) => {
      const matchCat = activeCategory === "all" || item.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.aesthetic.toLowerCase().includes(q) ||
        item.tags.some((t) => t.includes(q));
      return matchCat && matchSearch;
    })
    .sort((a, b) => b[sortBy] - a[sortBy]);

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Clothing Catalogue</h1>
          <p className="page__subtitle">All tracked premium minimalist pieces — scored, categorised, and analysed.</p>
        </div>
      </div>

      <div className="catalogue-controls">
        <div className="search-box">
          <Search size={16} />
          <input
            className="search-box__input"
            placeholder="Search pieces, aesthetics, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-row">
          <Filter size={15} />
          <select
            className="select-input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="trendScore">Sort: Trend Score</option>
            <option value="growthRate">Sort: Growth Rate</option>
          </select>
        </div>
      </div>

      <div className="category-tabs">
        <button
          className={`category-tab ${activeCategory === "all" ? "category-tab--active" : ""}`}
          onClick={() => setActiveCategory("all")}
        >
          All
        </button>
        {trendCategories.map(({ id, label, icon }) => (
          <button
            key={id}
            className={`category-tab ${activeCategory === id ? "category-tab--active" : ""}`}
            onClick={() => setActiveCategory(id)}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div className="catalogue-grid">
        {filtered.map((item) => (
          <div key={item.id} className="catalogue-card">
            <div className="catalogue-card__top">
              <div className="catalogue-card__category-badge">{item.category}</div>
              <div
                className="catalogue-card__momentum"
                style={{ color: momentumColors[item.momentum] }}
              >
                {item.momentum === "rising" ? "↑" : item.momentum === "peak" ? "◆" : "—"} {item.momentum}
              </div>
            </div>
            <h3 className="catalogue-card__name">{item.name}</h3>
            <div className="catalogue-card__brand">{item.brand}</div>
            <p className="catalogue-card__desc">{item.description}</p>

            <div className="catalogue-card__tags">
              {item.tags.map((tag) => (
                <span key={tag} className="tag">#{tag}</span>
              ))}
            </div>

            <div className="catalogue-card__footer">
              <div className="catalogue-card__stat">
                <span className="catalogue-card__stat-label">Trend Score</span>
                <div className="catalogue-card__score-row">
                  <div className="score-bar">
                    <div className="score-bar__fill" style={{ width: `${item.trendScore}%` }} />
                  </div>
                  <span className="catalogue-card__score-val">{item.trendScore}</span>
                </div>
              </div>
              <div className="catalogue-card__stat">
                <span className="catalogue-card__stat-label">Growth Rate</span>
                <span className="catalogue-card__growth">+{item.growthRate}% YoY</span>
              </div>
              <div className="catalogue-card__stat">
                <span className="catalogue-card__stat-label">Price Range</span>
                <span className="catalogue-card__price">{item.priceRange}</span>
              </div>
            </div>

            <div className="catalogue-card__aesthetic">{item.aesthetic}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">No items match your search.</div>
      )}
    </div>
  );
}
