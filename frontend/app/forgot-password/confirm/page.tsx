import { ForgotPanel } from '../forgot-panel';
import { ConfirmStep } from './confirm-step';

/** Step 2: code and new password. The e-mail address comes from step 1 (see lib/pending-email.ts). */
export default function ConfirmPage() {
  return (
    <ForgotPanel>
      <ConfirmStep />
    </ForgotPanel>
  );
}
