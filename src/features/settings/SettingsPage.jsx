import { useState } from 'react';
import { ArrowUpRight, CircleHelp, Settings } from 'lucide-react';
import PageHeading from '../../components/PageHeading.jsx';
import { settingsOptions } from '../../data/constants.js';
import { STORAGE_KEYS, readJSON, writeJSON } from '../../lib/storage.js';

const DEFAULTS = { updates: true, digest: false, research: true };

export default function SettingsPage() {
  const [enabled, setEnabled] = useState(() => ({
    ...DEFAULTS,
    ...readJSON(STORAGE_KEYS.settings, {}),
  }));

  const toggle = (key) => {
    const next = { ...enabled, [key]: !enabled[key] };
    setEnabled(next);
    writeJSON(STORAGE_KEYS.settings, next);
  };

  return (
    <>
      <PageHeading
        eyebrow="PRÉFÉRENCES"
        title="Vos paramètres."
        subtitle="Choisissez les actualités et découvertes que vous souhaitez suivre."
      />
      <section className="settings-panel">
        <div className="settings-section-title">
          <div><Settings size={17} /><h2>Notifications</h2></div>
          <span>PRÉFÉRENCES DE RÉCEPTION</span>
        </div>
        {settingsOptions.map((option) => (
          <div className="setting-row" key={option.key}>
            <div>
              <strong>{option.title}</strong>
              <span>{option.text}</span>
            </div>
            <button
              role="switch"
              aria-checked={enabled[option.key]}
              aria-label={option.title}
              className={`toggle ${enabled[option.key] ? 'on' : ''}`}
              onClick={() => toggle(option.key)}
            >
              <i />
            </button>
          </div>
        ))}
        <div className="settings-help">
          <span><CircleHelp size={16} /> Besoin d’aide ?</span>
          <a href="https://www.nasa.gov/contact/" target="_blank" rel="noreferrer">Contacter la NASA <ArrowUpRight size={13} /></a>
        </div>
      </section>
    </>
  );
}