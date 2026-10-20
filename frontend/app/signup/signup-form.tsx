'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/auth/button';
import { Checkbox } from '@/components/auth/checkbox';
import { signupProblemMessage } from '@/components/auth/messages';
import { Notice } from '@/components/auth/notice';
import { TextField } from '@/components/auth/text-field';
import { signup } from '@/lib/auth-api';
import { rememberPendingEmail } from '@/lib/pending-email';
import {
  firstErrorField,
  hasErrors,
  normalizeEmail,
  toIsoBirthDate,
  validateSignup,
  type FieldErrors,
  type SignupField,
  type SignupValues,
} from '@/lib/validation';
import styles from './signup-screen.module.css';

/** Display order, also the order in which the focus goes to the first invalid field. */
const FIELD_ORDER: readonly SignupField[] = [
  'displayName',
  'handle',
  'birthDate',
  'email',
  'phone',
  'password',
  'passwordConfirmation',
  'termsAccepted',
];

const EMPTY_VALUES: SignupValues = {
  displayName: '',
  handle: '',
  birthDate: '',
  email: '',
  phone: '',
  password: '',
  passwordConfirmation: '',
  termsAccepted: false,
};

export function SignupForm() {
  const router = useRouter();
  const [values, setValues] = useState<SignupValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors<SignupField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputs = useRef<Partial<Record<SignupField, HTMLInputElement | null>>>({});

  function setField<Field extends SignupField>(field: Field, value: SignupValues[Field]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function focusFirstError(fieldErrors: FieldErrors<SignupField>) {
    const field = firstErrorField(fieldErrors, FIELD_ORDER);
    if (field) {
      inputs.current[field]?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const fieldErrors = validateSignup(values);
    const birthDate = toIsoBirthDate(values.birthDate);
    if (hasErrors(fieldErrors) || birthDate === null) {
      setErrors(fieldErrors);
      focusFirstError(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    const email = normalizeEmail(values.email);
    const phone = values.phone.trim();
    const result = await signup({
      handle: values.handle,
      displayName: values.displayName,
      email,
      password: values.password,
      birthDate,
      termsAccepted: true,
      termsVersion: '1.0',
      ...(phone ? { phone } : {}),
    });

    if (result.ok) {
      rememberPendingEmail(email);
      router.push('/signup/code');
      return;
    }

    setSubmitting(false);
    const problemMessage = signupProblemMessage(result.problem);
    if (problemMessage.field) {
      const field = problemMessage.field;
      setErrors({ [field]: problemMessage.message });
      inputs.current[field]?.focus();
    } else {
      setFormError(problemMessage.message);
    }
  }

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit}>
      <div className={styles.fields}>
        <TextField
          id="displayName"
          name="displayName"
          label="Nom affiché (obligatoire)"
          hint="50 caractères maximum."
          placeholder={'Ex. : Jeannot Dupont'}
          autoComplete="name"
          value={values.displayName}
          onChange={(event) => setField('displayName', event.target.value)}
          error={errors.displayName}
          className={styles.wide}
          ref={(element) => {
            inputs.current.displayName = element;
          }}
        />
        <TextField
          id="handle"
          name="handle"
          label="Identifiant"
          placeholder={'Ex. : Jeannot45'}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={values.handle}
          onChange={(event) => setField('handle', event.target.value)}
          error={errors.handle}
          ref={(element) => {
            inputs.current.handle = element;
          }}
        />
        <TextField
          id="birthDate"
          name="birthDate"
          label="Date de naissance"
          placeholder="JJ/MM/AAAA"
          icon="calendar"
          autoComplete="bday"
          inputMode="numeric"
          value={values.birthDate}
          onChange={(event) => setField('birthDate', event.target.value)}
          error={errors.birthDate}
          ref={(element) => {
            inputs.current.birthDate = element;
          }}
        />
        <TextField
          id="email"
          name="email"
          type="email"
          label="E-mail"
          placeholder="nom@exemple.fr"
          autoComplete="email"
          spellCheck={false}
          value={values.email}
          onChange={(event) => setField('email', event.target.value)}
          error={errors.email}
          ref={(element) => {
            inputs.current.email = element;
          }}
        />
        <TextField
          id="phone"
          name="phone"
          type="tel"
          label="Téléphone (facultatif)"
          placeholder={'Ex. : 06 12 34 56 78'}
          autoComplete="tel"
          value={values.phone}
          onChange={(event) => setField('phone', event.target.value)}
          error={errors.phone}
          ref={(element) => {
            inputs.current.phone = element;
          }}
        />
        <TextField
          id="password"
          name="password"
          type="password"
          label="Mot de passe"
          placeholder={'8 caractères minimum'}
          autoComplete="new-password"
          value={values.password}
          onChange={(event) => setField('password', event.target.value)}
          error={errors.password}
          ref={(element) => {
            inputs.current.password = element;
          }}
        />
        <TextField
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          label="Confirmer le mot de passe"
          placeholder="Retapez votre mot de passe"
          autoComplete="new-password"
          value={values.passwordConfirmation}
          onChange={(event) => setField('passwordConfirmation', event.target.value)}
          error={errors.passwordConfirmation}
          ref={(element) => {
            inputs.current.passwordConfirmation = element;
          }}
        />
      </div>
      <Checkbox
        id="termsAccepted"
        name="termsAccepted"
        label="J’accepte les Conditions d’utilisation de Y"
        checked={values.termsAccepted}
        onChange={(checked) => setField('termsAccepted', checked)}
        error={errors.termsAccepted}
        ref={(element) => {
          inputs.current.termsAccepted = element;
        }}
      />
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Création du compte…' : 'Créer mon compte'}
      </Button>
    </form>
  );
}
