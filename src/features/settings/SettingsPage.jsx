import { useState } from 'react';
import {
  ArrowUpRight, CircleHelp, Globe, Rocket, Settings, Users,
} from 'lucide-react';
import PageHeading from '../../components/PageHeading.jsx';
import { PLATFORM_NAME, TEAM_NAME, settingsKeys } from '../../data/constants.js';
import { LOCALES } from '../../i18n/translations.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { STORAGE_KEYS, readJSON, writeJSON } from '../../lib/storage.js';

const DEFAULTS = { updates: true, digest: false, research: true };

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
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
        eyebrow={t('settings.eyebrow')}
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <section className="settings-panel">
        <div className="settings-section-title">
          <div><Globe size={17} /><h2>{t('settings.languageTitle')}</h2></div>
          <span>{t('settings.languageText')}</span>
        </div>
        <div className="setting-row">
          <div>
            <strong>{t('topbar.language')}</strong>
            <span>{t('settings.languageText')}</span>
          </div>
          <div className="language-switch" role="group" aria-label={t('topbar.language')}>
            {LOCALES.map((code) => (
              <button
                key={code}
                className={locale === code ? 'active' : ''}
                aria-pressed={locale === code}
                onClick={() => setLocale(code)}
              >
                {code === 'fr' ? 'FR' : 'EN'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="settings-panel">
        <div className="settings-section-title">
          <div><Settings size={17} /><h2>{t('settings.notifications')}</h2></div>
          <span>{t('settings.preferencesLabel')}</span>
        </div>
        {settingsKeys.map((option) => (
          <div className="setting-row" key={option.key}>
            <div>
              <strong>{t(option.titleKey)}</strong>
              <span>{t(option.textKey)}</span>
            </div>
            <button
              role="switch"
              aria-checked={enabled[option.key]}
              aria-label={t(option.titleKey)}
              className={`toggle ${enabled[option.key] ? 'on' : ''}`}
              onClick={() => toggle(option.key)}
            >
              <i />
            </button>
          </div>
        ))}
        <div className="settings-help">
          <span><CircleHelp size={16} /> {t('settings.help')}</span>
          <a href="https://www.nasa.gov/contact/" target="_blank" rel="noreferrer">
            {t('settings.contact')} <ArrowUpRight size={13} />
          </a>
        </div>
      </section>

      <section className="settings-panel">
        <div className="settings-section-title">
          <div><Users size={17} /><h2>{t('settings.about')}</h2></div>
          <span>{t('settings.aboutLabel')}</span>
        </div>

        <div className="settings-team">
          <span className="settings-team-mark" aria-hidden="true"><Users size={22} /></span>
          <div className="settings-team-copy">
            <small>{t('settings.team')}</small>
            <strong>{TEAM_NAME}</strong>
            <p>{t('settings.teamText')}</p>
          </div>
        </div>

        <div className="setting-row">
          <div>
            <strong>{t('settings.platform')}</strong>
            <span>{PLATFORM_NAME}</span>
          </div>
          <Rocket size={16} className="settings-row-icon" aria-hidden="true" />
        </div>
      </section>
    </>
  );
}