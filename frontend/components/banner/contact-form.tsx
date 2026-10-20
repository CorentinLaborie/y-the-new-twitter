'use client';

import { useId, useState, type FormEvent } from 'react';
import { Notice } from '@/components/auth/notice';
import { messageForCode } from '@/lib/api-messages';
import type { ApiProblem } from '@/lib/api-client';
import styles from './contact-form.module.css';
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  contactMessageLength,
  isContactMessageValid,
  sendContactMessage,
} from './contact-message';

const SEND_FAILURE_MESSAGE = 'Votre message n’a pas été envoyé. Vérifiez votre connexion, puis réessayez.';

/** Shown after a sent message (design: Contact-Sent boards). The reference is the thread the administrator will answer. */
function ContactSentNotice({ reference }: { reference: string }) {
  return (
    <Notice tone="success">
      <strong className={styles.sentTitle}>Message envoyé</strong>
      <span className={styles.sentText}>
        Votre message a bien été transmis à l’administrateur. La réponse sera envoyée par e-mail à l’adresse
        de votre compte.
      </span>
      <span className={styles.reference}>Référence : {reference}</span>
    </Notice>
  );
}

/** The text of a refused send: the French text of its code when it has one, the generic text otherwise. */
function sendFailureMessage(problem: ApiProblem): string {
  return messageForCode(problem) ?? SEND_FAILURE_MESSAGE;
}

/**
 * Contact form of a suspended account (section 3.4). 1 to 1000 characters, counted in characters with a counter.
 * Over the limit the message is refused with a text and the button stays off. A failed send keeps the text.
 */
export function ContactForm() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const textareaId = useId();
  const hintId = useId();
  const refusalId = useId();

  const characterCount = contactMessageLength(text);
  const tooLong = characterCount > CONTACT_MESSAGE_MAX_LENGTH;
  const canSend = isContactMessageValid(text) && !sending;

  async function send() {
    setSending(true);
    setSendError(null);
    const result = await sendContactMessage(text);
    setSending(false);
    if (result.ok) {
      setReference(result.reference);
      setText('');
    } else {
      setSendError(sendFailureMessage(result.problem));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) {
      void send();
    }
  }

  if (reference !== null) {
    return <ContactSentNotice reference={reference} />;
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-label="Contacter l’administrateur">
      <label htmlFor={textareaId} className={styles.label}>
        Votre message
      </label>
      <p id={hintId} className={styles.hint}>
        1 000 caractères maximum.
      </p>
      <textarea
        id={textareaId}
        className={styles.textarea}
        rows={6}
        placeholder="Expliquez votre situation"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setSendError(null);
        }}
        aria-invalid={tooLong ? true : undefined}
        aria-describedby={tooLong ? `${hintId} ${refusalId}` : hintId}
        disabled={sending}
      />
      {tooLong ? (
        <p id={refusalId} className={styles.refusal}>
          Votre message dépasse {CONTACT_MESSAGE_MAX_LENGTH} caractères.
        </p>
      ) : null}
      {sendError ? <Notice tone="error">{sendError}</Notice> : null}
      <div className={styles.footer}>
        <span className={styles.counter} data-over={tooLong ? 'true' : undefined}>
          {characterCount}/{CONTACT_MESSAGE_MAX_LENGTH}
        </span>
        <button type="submit" className={`y-btn y-btn-primary ${styles.submit}`} disabled={!canSend}>
          {sending ? 'Envoi…' : 'Envoyer le message'}
        </button>
      </div>
      <p className={styles.note}>
        Un seul message peut être ouvert à la fois. Vous pourrez écrire à nouveau après la réponse de
        l’administrateur.
      </p>
    </form>
  );
}
