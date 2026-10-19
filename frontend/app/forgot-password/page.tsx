import { ForgotPanel } from './forgot-panel';
import { RequestForm } from './request-form';

/** Step 1: the e-mail address. The first step carries the Y mark and the mobile "Retour" link, as on the boards. */
export default function ForgotPasswordPage() {
  return (
    <ForgotPanel mark back={{ href: '/login', label: 'Retour' }}>
      <RequestForm />
    </ForgotPanel>
  );
}
