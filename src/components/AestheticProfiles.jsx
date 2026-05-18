import { aestheticProfiles, clothingItems } from "../data/trends";

const characterQuotes = {
  "quiet-luxury": "You don't need to shout. The quality speaks before you walk in the room.",
  "utilitarian-minimal": "Every detail has a reason. You move with intention. Nothing is excess.",
  "deconstructed-art": "You challenge what clothing is supposed to say. The unfinished edge is the statement.",
  "heritage-sport": "Rooted in real activity. Grounded in craft. Never performing — just present.",
};

export default function AestheticProfiles() {
  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Aesthetic Profiles</h1>
          <p className="page__subtitle">
            The minimalist luxury space is character-driven. Each aesthetic surfaces a different kind of person.
          </p>
        </div>
      </div>

      <div className="profile-grid">
        {aestheticProfiles.map((profile) => {
          const relatedItems = clothingItems.filter((item) =>
            item.aesthetic.toLowerCase().includes(profile.name.split(" ")[0].toLowerCase())
          );

          return (
            <div key={profile.id} className="profile-card">
              <div className="profile-card__accent" style={{ background: profile.color }} />
              <div className="profile-card__body">
                <div className="profile-card__header">
                  <h2 className="profile-card__name">{profile.name}</h2>
                  <div className="profile-card__score-pill" style={{ background: profile.color + "33", color: profile.color }}>
                    {profile.growthScore} / 100
                  </div>
                </div>

                <p className="profile-card__desc">{profile.description}</p>

                <blockquote className="profile-card__quote" style={{ borderColor: profile.color }}>
                  "{characterQuotes[profile.id]}"
                </blockquote>

                <div className="profile-card__section-label">Character Trait</div>
                <div className="profile-card__trait">{profile.characterTrait}</div>

                <div className="profile-card__section-label" style={{ marginTop: "1rem" }}>Key Pieces</div>
                <div className="profile-card__pieces">
                  {profile.keyPieces.map((piece) => (
                    <span key={piece} className="piece-pill">{piece}</span>
                  ))}
                </div>

                {relatedItems.length > 0 && (
                  <>
                    <div className="profile-card__section-label" style={{ marginTop: "1rem" }}>
                      Catalogue Items ({relatedItems.length})
                    </div>
                    <div className="profile-card__items">
                      {relatedItems.map((item) => (
                        <div key={item.id} className="profile-item-row">
                          <span className="profile-item-row__name">{item.name}</span>
                          <span className="profile-item-row__score" style={{ color: profile.color }}>
                            {item.trendScore}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="profile-card__momentum-bar">
                  <div className="profile-card__momentum-label">Aesthetic momentum</div>
                  <div className="score-bar score-bar--tall">
                    <div
                      className="score-bar__fill"
                      style={{ width: `${profile.growthScore}%`, background: profile.color }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
