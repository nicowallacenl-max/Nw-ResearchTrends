import { useState } from "react";
import { BarChart2, TrendingUp, Grid, Layers, Target, Menu, X } from "lucide-react";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: BarChart2 },
  { id: "trends", label: "Trend Intelligence", icon: TrendingUp },
  { id: "catalogue", label: "Clothing Catalogue", icon: Grid },
  { id: "aesthetics", label: "Aesthetic Profiles", icon: Layers },
  { id: "opportunities", label: "Market Gaps", icon: Target },
];

export default function Sidebar({ active, onNav }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <aside
        className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}
      >
        <div className="sidebar__header">
          {!collapsed && (
            <div className="sidebar__brand">
              <span className="sidebar__brand-mark">NW</span>
              <div>
                <div className="sidebar__brand-name">ResearchTrends</div>
                <div className="sidebar__brand-sub">Luxury Streetwear Intel</div>
              </div>
            </div>
          )}
          <button className="sidebar__toggle" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
        </div>

        <nav className="sidebar__nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar__nav-item ${active === id ? "sidebar__nav-item--active" : ""}`}
              onClick={() => onNav(id)}
              title={collapsed ? label : undefined}
            >
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>

        {!collapsed && (
          <div className="sidebar__footer">
            <div className="sidebar__footer-label">Data refreshed</div>
            <div className="sidebar__footer-date">May 2026</div>
          </div>
        )}
      </aside>
    </>
  );
}
