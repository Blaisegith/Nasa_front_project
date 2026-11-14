import { useEffect, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, Flame, Loader2, LogOut, Mail, Pencil,
  Rocket, UserRound, X,
} from 'lucide-react';
import PageHeading from '../../components/PageHeading.jsx';
import { topics } from '../../data/constants.js';
import { profileInitials } from '../../lib/format.js';
import { resolveUrl } from '../../lib/apiClient.js';
import { fileToResizedBlob } from '../../lib/photo.js';
import { useAuth } from '../../state/AuthProvider.jsx';

function AccountGate() {
  const { signIn } = useAuth();
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
      setError(caught.message ?? 'Connexion impossible.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageHeading
        eyebrow="ESPACE PERSONNEL"
        title="Créez votre compte."
        subtitle="Inscrivez-vous avec votre adresse e-mail pour personnaliser votre espace."
      />
      <section className="account-gate">
        <form className="account-form" onSubmit={submit}>
          <span className="account-icon"><UserRound size={22} /></span>
          <h2>Votre espace, à vous.</h2>
          <p className="account-hint">
            Accès simplifié : votre e-mail suffit. Aucune donnée personnelle n’est utilisée pour vous authentifier.
          </p>
          <label>
            Nom complet
            <input
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex. Alex Martin"
            />
          </label>
          <label>
            Adresse e-mail
            <input
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@exemple.com"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button-primary account-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={15} className="spin" /> : null}
            Créer mon compte <ArrowRight size={15} />
          </button>
        </form>
      </section>
    </>
  );
}

function EditProfileModal({ profile, onClose }) {
  const { updateProfile, setAvatar } = useAuth();
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
      setError(caught.message ?? 'Impossible de charger cette photo.');
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
      setError(caught.message ?? 'Enregistrement impossible.');
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
            <span className="eyebrow">ESPACE PERSONNEL</span>
            <h2>Modifier le profil</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Fermer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label>
          Nom complet
          <input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Adresse e-mail
          <input value={profile.email ?? ''} readOnly aria-readonly="true" />
        </label>
        <label>
          À propos
          <textarea rows="3" value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>

        <div className="photo-field edit-photo-field">
          <span className="photo-preview">
            {photo ? <img src={resolveUrl(photo)} alt="Aperçu de la photo de profil" /> : <UserRound size={21} />}
          </span>
          <label className="photo-picker">
            Changer la photo
            <input type="file" accept="image/*" aria-label="Changer la photo" onChange={selectPhoto} />
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button className="button-secondary" type="button" onClick={onClose}>Annuler</button>
          <button className="button-primary" type="submit" disabled={isSaving}>
            {isSaving && <Loader2 size={15} className="spin" />} Enregistrer <Check size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileCard({ profile }) {
  const { signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const avatar = resolveUrl(profile.avatar_url);

  return (
    <>
      <section className="profile-layout">
        <div className="profile-card">
          <button
            className="profile-edit-button"
            aria-label="Modifier le profil"
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
          </button>
          <div className="profile-orbit">
            {avatar
              ? <img className="avatar avatar-large profile-photo" src={avatar} alt={`Photo de ${profile.display_name}`} />
              : <span className="avatar avatar-large">{profileInitials(profile.display_name)}</span>}
            <i className="orbit-dot" />
          </div>
          <h2>{profile.display_name}</h2>
          <div className="profile-email"><Mail size={15} />{profile.email}</div>
          <p className="profile-bio">{profile.bio || 'Aucune description pour le moment.'}</p>
          <div className="profile-tags">
            <span><Rocket size={13} /> EXPLORATION SPATIALE</span>
            <span><Flame size={13} /> COMBUSTION</span>
          </div>
          <div className="profile-stats">
            <div><strong>04</strong><span>SUJETS SUIVIS</span></div>
            <div><strong>12</strong><span>ARTICLES LUS</span></div>
            <div><strong>03</strong><span>ENREGISTRÉS</span></div>
          </div>
          <button className="button-secondary profile-signout" onClick={signOut}>
            <LogOut size={14} /> Se déconnecter
          </button>
        </div>

        <aside className="profile-side">
          <div className="side-note">
            <span className="side-note-icon"><UserRound size={17} /></span>
            <div>
              <span>VOTRE ESPACE</span>
              <h3>Curiosité sans frontières.</h3>
              <p>Vos centres d’intérêt façonnent les découvertes qui vous sont proposées.</p>
            </div>
          </div>
          <div className="interest-list">
            <div className="interest-heading">
              <h3>Vos centres d’intérêt</h3>
              <button onClick={() => setEditing(true)}><Pencil size={13} /> Modifier</button>
            </div>
            {topics.map((topic, index) => (
              <div className="interest-row" key={topic.label}>
                <span className={`interest-number ${topic.color}`}>0{index + 1}</span>
                <span>{topic.label}</span>
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

  if (status === 'loading') {
    return <div className="chat-loading"><Loader2 size={18} className="spin" /> Vérification de la session…</div>;
  }

  if (!profile) {
    return <AccountGate />;
  }

  return (
    <>
      <PageHeading
        eyebrow="ESPACE PERSONNEL"
        title="Votre profil."
        subtitle="Retrouvez vos informations et vos ressources enregistrées."
      />
      <ProfileCard profile={{ ...profile, email: profile.email ?? '' }} />
    </>
  );
}