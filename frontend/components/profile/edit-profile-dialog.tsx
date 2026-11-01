'use client';

import { useState } from 'react';
import { SheetDialog } from '@/components/dialog/sheet-dialog';
import type { ProfileView } from '@/lib/profile-api';
import { DISPLAY_NAME_MAX_LENGTH, HANDLE_MAX_LENGTH } from '@/lib/validation';
import styles from './edit-profile-dialog.module.css';

/** The bio of a profile is at most 160 characters (section 12.7, DEC-105). */
export const BIO_MAX_LENGTH = 160;

type EditProfileDialogProps = {
  open: boolean;
  profile: ProfileView;
  onClose: () => void;
};

/*
 * The edit window of the own profile (plan L1, section 12.7 and DEC-105). A dialog on desktop and tablet, full screen on
 * mobile. The form is mounted only while open, so each opening starts from the saved profile. The save is wired in step
 * 5 and the error messages come in step 4.3.
 */
export function EditProfileDialog({ open, profile, onClose }: EditProfileDialogProps) {
  return (
    <SheetDialog open={open} title="Modifier le profil" mobile="fullscreen" onCancel={onClose}>
      {open ? <EditProfileForm profile={profile} onClose={onClose} /> : null}
    </SheetDialog>
  );
}

function EditProfileForm({ profile, onClose }: Pick<EditProfileDialogProps, 'profile' | 'onClose'>) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio ?? '');

  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
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
        <input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" />
      </div>
      <div className={styles.actions}>
        <button type="button" className="y-btn y-btn-md y-btn-outline y-btn-pill" onClick={onClose}>
          Annuler
        </button>
        <button type="submit" className="y-btn y-btn-md y-btn-primary y-btn-pill">
          Enregistrer
        </button>
      </div>
    </form>
  );
}
