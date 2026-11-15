import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { DEFAULT_LOCALE, getTranslations, resolveLocale } from './translations.js';
import { readString, writeString } from '../lib/storage.js';
import { setActiveLocale } from '../lib/format.js';

const STORAGE_KEY = 'nasa-locale';
const I18nContext = createContext(null);

function interpolate(template, values) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

/**
 * Langue de l'interface (fr / en).
 *
 * - persistée dans `localStorage` ;
 * - répercutée sur `<html lang>` ;
 * - partagée avec les formateurs de nombres et de dates.
 */
export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => resolveLocale(readString(STORAGE_KEY, DEFAULT_LOCALE)));

  useEffect(() => {
    setActiveLocale(locale);
    document.documentElement.lang = locale;
    writeString(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next) => {
    setLocaleState(resolveLocale(next));
  }, []);

  const t = useCallback((path, values) => {
    const dictionary = getTranslations(locale);
    const segments = String(path).split('.');
    let node = dictionary;
    for (const segment of segments) {
      if (node == null || typeof node !== 'object') return path;
      node = node[segment];
    }
    if (typeof node !== 'string') return path;
    return interpolate(node, values);
  }, [locale]);

  const value = useMemo(() => {
    const { meta } = getTranslations(locale);
    return {
      locale,
      intlLocale: meta.intl,
      htmlLang: meta.htmlLang,
      languageLabel: meta.label,
      languageShort: meta.short,
      setLocale,
      t,
    };
  }, [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n doit être utilisé dans <I18nProvider>.');
  return context;
}

export { STORAGE_KEY as LOCALE_STORAGE_KEY };