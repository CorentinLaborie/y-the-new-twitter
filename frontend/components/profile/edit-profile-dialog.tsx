'use client';

import { SheetDialog } from '@/components/dialog/sheet-dialog';
import type { ProfileView } from '@/lib/profile-api';
import styles from './edit-profile-dialog.module.css';

type EditProfileDialogProps = {
  open: boolean;
  profile: ProfileView;
  onClose: () => void;
};

/*
 * The edit window of the own profile (plan L1, step 4.1, section 12.7 and DEC-105). A dialog on desktop and tablet, full
 * screen on mobile. The form is mounted only while open, so each opening starts from the saved profile. The fields are
 * filled in step 4.2 and the save is wired in step 5; for now only the window and Annuler work.
 */
export function EditProfileDialog({ open, profile, onClose }: EditProfileDialogProps) {
  return (
    <SheetDialog open={open} title="Modifier le profil" mobile="fullscreen" onCancel={onClose}>
      {open ? <EditProfileForm profile={profile} onClose={onClose} /> : null}
    </SheetDialog>
  );
}

function EditProfileForm({ profile, onClose }: Pick<EditProfileDialogProps, 'profile' | 'onClose'>) {
  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
      <div className={styles.field}>
        <label htmlFor="profile-display-name">Nom affiché</label>
        <input id="profile-display-name" type="text" defaultValue={profile.displayName} />
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-handle">Pseudo</label>
        <input id="profile-handle" type="text" defaultValue={profile.handle} />
      </div>
      <div className={styles.field}>
        <label htmlFor="profile-bio">Bio</label>
        <textarea id="profile-bio" rows={4} defaultValue={profile.bio ?? ''} />
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
