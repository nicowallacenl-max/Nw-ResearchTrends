import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import TrendIntelligence from "./components/TrendIntelligence";
import ClothingCatalogue from "./components/ClothingCatalogue";
import AestheticProfiles from "./components/AestheticProfiles";
import MarketOpportunities from "./components/MarketOpportunities";
import "./App.css";

const views = {
  dashboard: Dashboard,
  trends: TrendIntelligence,
  catalogue: ClothingCatalogue,
  aesthetics: AestheticProfiles,
  opportunities: MarketOpportunities,
};

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const View = views[activeView] || Dashboard;

  return (
    <div className="app">
      <Sidebar active={activeView} onNav={setActiveView} />
      <main className="main">
        <View onNav={setActiveView} />
      </main>
    </div>
  );
}
