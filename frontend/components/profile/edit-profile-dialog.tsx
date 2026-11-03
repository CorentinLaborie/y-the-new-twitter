'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { SheetDialog } from '@/components/dialog/sheet-dialog';
import { apiBaseUrl } from '@/lib/api-client';
import {
  updateOwnProfile,
  uploadAvatar,
  type OwnProfile,
  type OwnProfileFields,
  type ProfileView,
} from '@/lib/profile-api';
import { DISPLAY_NAME_MAX_LENGTH, HANDLE_MAX_LENGTH } from '@/lib/validation';
import { avatarFailureMessage, changedFields, photoError, saveFailureMessage } from './edit-profile-rules';
import styles from './edit-profile-dialog.module.css';

/** The bio of a profile is at most 160 characters (section 12.7, DEC-105). */
export const BIO_MAX_LENGTH = 160;

type EditProfileDialogProps = {
  open: boolean;
  profile: ProfileView;
  onClose: () => void;
  /** Called with the saved fields once the API has accepted them. */
  onSaved: (saved: OwnProfile) => void;
};

/*
 * The edit window of the own profile (plan L1, section 12.7 and DEC-105). A dialog on desktop and tablet, full screen on
 * mobile. The form is mounted only while open, so each opening starts from the saved profile. Only the changed fields
 * are sent (PATCH /users/me). A refused save keeps the window open with the typed values.
 */
export function EditProfileDialog({ open, profile, onClose, onSaved }: EditProfileDialogProps) {
  return (
    <SheetDialog open={open} title="Modifier le profil" mobile="fullscreen" wide onCancel={onClose}>
      {open ? <EditProfileForm profile={profile} onClose={onClose} onSaved={onSaved} /> : null}
    </SheetDialog>
  );
}

function EditProfileForm({
  profile,
  onClose,
  onSaved,
}: Pick<EditProfileDialogProps, 'profile' | 'onClose' | 'onSaved'>) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoFailure, setPhotoFailure] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);

  /** A photo of another format or over 2 MB is refused here, before any upload. */
  function choosePhoto(chosen: File | undefined) {
    const failure = chosen === undefined ? null : photoError(chosen);
    setPhoto(failure === null ? (chosen ?? null) : null);
    setPhotoFailure(failure);
  }

  /* The chosen photo is previewed before saving. The object address is released when the photo changes or the form closes. */
  useEffect(() => {
    if (photo === null) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  /*
   * The photo goes first, then the changed fields. If the photo is refused the window stays open with its message. If
   * the fields are refused after the photo was stored, the photo stays saved and the window stays open to retry.
   */
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes = changedFields(profile, { displayName, handle, bio });
    if (photo === null && Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setSaveFailure(null);
    let avatarUrl = profile.avatarUrl;
    if (photo !== null) {
      const uploaded = await uploadAvatar(photo);
      if (!uploaded.ok) {
        setSaving(false);
        setSaveFailure(avatarFailureMessage(uploaded.problem.status));
        return;
      }
      avatarUrl = uploaded.body.avatarUrl;
    }
    let fields: OwnProfileFields = {
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
    };
    if (Object.keys(changes).length > 0) {
      const result = await updateOwnProfile(changes);
      if (!result.ok) {
        setSaving(false);
        setSaveFailure(saveFailureMessage(result.problem.status));
        return;
      }
      fields = result.body;
    }
    setSaving(false);
    onSaved({ ...fields, avatarUrl });
  }

  return (
    <form className={styles.form} onSubmit={save}>
      <div className={styles.field}>
        <label htmlFor="profile-display-name">Nom affiché</label>
        <input
          id="profile-display-name"
          type="text"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <span className={styles.counter} aria-live="polite">
          {`${displayName.length} / ${DISPLAY_NAME_MAX_LENGTH}`}
        </span>
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-handle">Pseudo</label>
        <input
          id="profile-handle"
          type="text"
          maxLength={HANDLE_MAX_LENGTH}
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
        />
        <span className={styles.counter} aria-live="polite">
          {`${handle.length} / ${HANDLE_MAX_LENGTH}`}
        </span>
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-bio">Bio</label>
        <textarea
          id="profile-bio"
          rows={4}
          maxLength={BIO_MAX_LENGTH}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
        <span className={styles.counter} aria-live="polite">
          {`${bio.length} / ${BIO_MAX_LENGTH}`}
        </span>
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-avatar">Photo de profil</label>
        <input
          id="profile-avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => choosePhoto(event.target.files?.[0])}
        />
        <div className={styles.preview}>
          {previewUrl !== null ? (
            <img src={previewUrl} alt="Aperçu de la nouvelle photo" className={styles.previewImage} />
          ) : profile.avatarUrl !== null ? (
            <img
              src={`${apiBaseUrl()}${profile.avatarUrl}`}
              alt="Photo de profil actuelle"
              className={styles.previewImage}
            />
          ) : (
            <span className={styles.previewEmpty}>Aucune photo</span>
          )}
        </div>
        {photoFailure === null ? null : (
          <p role="alert" className={styles.error}>
            {photoFailure}
          </p>
        )}
      </div>
      {saveFailure === null ? null : (
        <p role="alert" className={styles.error}>
          {saveFailure}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className="y-btn y-btn-md y-btn-outline y-btn-pill" onClick={onClose}>
          Annuler
        </button>
        <button type="submit" className="y-btn y-btn-md y-btn-primary y-btn-pill" disabled={saving}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}
