import { useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, Flame, Loader2, LogOut, Mail, Pencil,
  Rocket, UserRound, X,
} from 'lucide-react';
import PageHeading from '../../components/PageHeading.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { topics } from '../../data/constants.js';
import { resolveUrl } from '../../lib/apiClient.js';
import { fileToResizedBlob } from '../../lib/photo.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';

function AccountGate() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await signIn(email, name);
    } catch (caught) {
      setError(caught.message ?? t('profile.sessionExpired'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow={t('profile.eyebrow')}
        title={t('profile.createTitle')}
        subtitle={t('profile.createSubtitle')}
      />
      <section className="account-gate">
        <form className="account-form" onSubmit={submit}>
          <span className="account-icon"><UserRound size={22} /></span>
          <h2>{t('profile.createCardTitle')}</h2>
          <p className="account-hint">{t('profile.createHint')}</p>
          <label>
            {t('profile.fullName')}
            <input
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('profile.fullNamePlaceholder')}
            />
          </label>
          <label>
            {t('profile.email')}
            <input
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('profile.emailPlaceholder')}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button-primary account-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={15} className="spin" /> : null}
            {t('profile.submitCreate')} <ArrowRight size={15} />
          </button>
        </form>
      </section>
    </>
  );
}

function EditProfileModal({ profile, onClose }) {
  const { updateProfile, setAvatar } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState(profile.display_name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [photo, setPhoto] = useState(profile.avatar_url ?? '');

  const selectPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      const resized = await fileToResizedBlob(file);
      const url = await setAvatar(resized);
      setPhoto(url ?? '');
    } catch (caught) {
      setError(caught.message ?? t('profile.photoAria'));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await updateProfile({ display_name: name.trim(), bio });
      onClose();
    } catch (caught) {
      setError(caught.message ?? t('profile.sessionExpired'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <form
        className="edit-modal"
        onSubmit={submit}
        onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{t('profile.eyebrow')}</span>
            <h2>{t('profile.editProfile')}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('common.close')} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label>
          {t('profile.fullName')}
          <input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          {t('profile.email')}
          <input value={profile.email ?? ''} readOnly aria-readonly="true" />
        </label>
        <label>
          {t('profile.bio')}
          <textarea rows="3" value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>

        <div className="photo-field edit-photo-field">
          <span className="photo-preview">
            {photo
              ? <img src={resolveUrl(photo)} alt="" />
              : <UserRound size={21} />}
          </span>
          <label className="photo-picker">
            {t('profile.changePhoto')}
            <input type="file" accept="image/*" aria-label={t('profile.changePhoto')} onChange={selectPhoto} />
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button className="button-secondary" type="button" onClick={onClose}>{t('common.cancel')}</button>
          <button className="button-primary" type="submit" disabled={isSaving}>
            {isSaving && <Loader2 size={15} className="spin" />} {t('common.save')} <Check size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileCard({ profile }) {
  const { signOut } = useAuth();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);

  return (
    <>
      <section className="profile-layout">
        <div className="profile-card">
          <button
            className="profile-edit-button"
            aria-label={t('profile.editProfile')}
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
          </button>
          <div className="profile-orbit">
            <UserAvatar profile={profile} size="lg" />
            <i className="orbit-dot" />
          </div>
          <h2>{profile.display_name}</h2>
          <div className="profile-email"><Mail size={15} />{profile.email}</div>
          <p className="profile-bio">{profile.bio || t('profile.bioEmpty')}</p>
          <div className="profile-tags">
            <span><Rocket size={13} /> {t('profile.space')}</span>
            <span><Flame size={13} /> {t('topics.combustion')}</span>
          </div>
          <div className="profile-stats">
            <div><strong>{String(topics.length).padStart(2, '0')}</strong><span>{t('profile.statsTopics')}</span></div>
            <div><strong>12</strong><span>{t('profile.statsRead')}</span></div>
            <div><strong>03</strong><span>{t('profile.statsSaved')}</span></div>
          </div>
          <button className="button-secondary profile-signout" onClick={signOut}>
            <LogOut size={14} /> {t('common.signOut')}
          </button>
        </div>

        <aside className="profile-side">
          <div className="side-note">
            <span className="side-note-icon"><UserRound size={17} /></span>
            <div>
              <span>{t('profile.space')}</span>
              <h3>{t('profile.interestsTitle')}</h3>
              <p>{t('profile.interestsText')}</p>
            </div>
          </div>
          <div className="interest-list">
            <div className="interest-heading">
              <h3>{t('profile.interests')}</h3>
              <button type="button" onClick={() => setEditing(true)}>
                <Pencil size={13} /> {t('profile.editProfile')}
              </button>
            </div>
            {topics.map((topic, index) => (
              <div className="interest-row" key={topic.id}>
                <span className={`interest-number ${topic.color}`}>{`0${index + 1}`}</span>
                <span>{t(`topics.${topic.id}`)}</span>
                <ArrowUpRight size={14} />
              </div>
            ))}
          </div>
        </aside>
      </section>

      {editing && <EditProfileModal profile={profile} onClose={() => setEditing(false)} />}
    </>
  );
}

export default function ProfilePage() {
  const { status, profile } = useAuth();
  const { t } = useI18n();

  if (status === 'loading') {
    return (
      <div className="chat-loading">
        <Loader2 size={18} className="spin" /> {t('topbar.checking')}
      </div>
    );
  }

  if (!profile) {
    return <AccountGate />;
  }

  return (
    <>
      <PageHeading
        eyebrow={t('profile.eyebrow')}
        title={t('profile.pageTitle')}
        subtitle={t('profile.pageSubtitle')}
      />
      <ProfileCard profile={{ ...profile, email: profile.email ?? '' }} />
    </>
  );
}