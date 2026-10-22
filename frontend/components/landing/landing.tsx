import Image from 'next/image';
import Link from 'next/link';
import { YMark } from '@/components/brand/y-mark';
import { LandingIcon } from './landing-icon';
import { ConversationPreview, QuestionPreview } from './question-preview';
import styles from './landing.module.css';

/*
 * Visitor landing (guests). Boards: design/canvas-build/project/Main.dc.html (desktop), Landing-Tablet.dc.html and
 * Landing-Mobile.dc.html. The same sections at every width; the CSS module sets the widths, gaps and type sizes of each board.
 */
export function Landing() {
  return (
    <>
      <main className={styles.page}>
        <div className={styles.logo} aria-hidden="true">
          <span className="y-logo y-logo-primary">
            <YMark size={100} />
          </span>
        </div>
        <h1 className={styles.title}>Y, le réseau social qui vous fait réfléchir.</h1>
        <p className={styles.tagline}>On ne demande jamais assez Why&nbsp;?</p>

        <div className={styles.carousel}>
          <div className={[styles.frame, styles.sideLeft].join(' ')} aria-hidden="true">
            <Image src="/images/landing/side-left.jpg" alt="" fill sizes="(min-width: 600px) 220px, 160px" />
          </div>
          <figure className={[styles.frame, styles.centerCard].join(' ')}>
            <Image
              src="/images/landing/hero.jpg"
              alt="Un homme consulte son téléphone"
              fill
              priority
              sizes="(min-width: 600px) 480px, 264px"
            />
            <figcaption className={styles.caption}>Des questions, des échanges, des liens.</figcaption>
          </figure>
          <div className={[styles.frame, styles.sideRight].join(' ')} aria-hidden="true">
            <Image src="/images/landing/side-right.jpg" alt="" fill sizes="(min-width: 600px) 220px, 160px" />
          </div>
        </div>
        <div className={styles.actions}>
          <a href="#demo" className="y-btn y-btn-primary y-btn-lg y-btn-rounded">
            Découvrir Y
          </a>
          <a href="#safety" className="y-btn y-btn-outline y-btn-lg y-btn-rounded">
            En savoir plus
          </a>
        </div>

        <div className={styles.content}>
          <section id="demo" className={styles.demo}>
            <div className={styles.demoIntro}>
              <h2 className={styles.demoTitle}>Une expérience sociale&nbsp;concrète</h2>
              <p className={styles.demoText}>
                Posez vos questions, donnez votre avis et réfléchissez ensemble.
              </p>
            </div>
            <div className={styles.feed}>
              <h3 className={styles.feedTitle}>Vos questions…</h3>
              <div className={styles.preview} aria-hidden="true">
                <QuestionPreview
                  author="AliceY"
                  date="14/10/2026 10h41"
                  tags={['#online_life', '#irl_vs_online']}
                  body={
                    '« Pourquoi les gens préfèrent-ils les réponses rapides plutôt que les questions profondes ? »'
                  }
                  reactions={{ like: '124', dislike: '12', y: '49' }}
                  bookmark={{ saved: false }}
                />
              </div>
              <h3 className={[styles.feedTitle, styles.feedTitleNext].join(' ')}>
                …forment un flux de questions
              </h3>
              <p className={styles.feedNote}>
                Au bout de 50&nbsp;Y, une conversation s’ouvre sous la question.
              </p>
              <div className={styles.preview} aria-hidden="true">
                <QuestionPreview
                  author="MarkL"
                  date="14/10/2026 09h12"
                  tags={['#online_life', '#irl_vs_online']}
                  body={
                    '« Qu’est-ce qui fait qu’une conversation en ligne peut être plus sincère qu’une rencontre en personne ? »'
                  }
                  reactions={{ like: '2 000', dislike: '450', y: '89' }}
                  followed
                  yActive
                  bookmark={{ saved: true }}
                >
                  <ConversationPreview replyTo="MarkL">
                    <QuestionPreview
                      author="AliceY"
                      date="14/10/2026 09h41"
                      tags={[]}
                      body="Peut-être que les gens ont envie de se protéger derrière un écran ? La sécurité d’abord !"
                      reactions={{ like: '124', dislike: '12' }}
                      compact
                    />
                  </ConversationPreview>
                </QuestionPreview>
              </div>
            </div>
          </section>

          <section id="safety" className={styles.panel}>
            <h2 className={styles.panelTitle}>Un espace sûr pour&nbsp;réfléchir</h2>
            <p className={styles.panelText}>
              Sur Y, la sécurité accompagne chaque échange&nbsp;: confidentialité, signalement et respect de
              la communauté.
              <br />
              Notre modèle IA est entraîné pour vérifier les posts dans un principe de bienséance et de
              respect d’autrui.
            </p>
            <ul className={styles.perks}>
              <li>
                <LandingIcon name="shield" size={20} />
                <span>Participez à la modération de la plateforme</span>
              </li>
              <li>
                <LandingIcon name="eye-off" size={20} />
                <span>Une protection des mineurs accrue</span>
              </li>
              <li>
                <LandingIcon name="flag" size={20} />
                <span>Signalez rapidement les contenus inappropriés</span>
              </li>
            </ul>
          </section>

          <section className={styles.cta}>
            <h2 className={styles.ctaTitle}>Rejoignez la communauté</h2>
            <p className={styles.ctaText}>
              L’inscription est réservée aux adultes de 18&nbsp;ans et plus.
              <br />
              Les mineurs ne peuvent pas créer de compte sur Y.
              <br />
              Vérification avec VerifAge.
            </p>
            <Link href="/signup" className="y-btn y-btn-primary y-btn-lg y-btn-rounded">
              Créer mon compte
            </Link>
            <p className={styles.signIn}>
              Vous avez déjà un compte&nbsp;? <Link href="/login">Se connecter</Link>
            </p>
          </section>
        </div>
      </main>

      <footer className={['y-footer', 'y-footer-page', styles.footer].join(' ')}>
        <nav className="y-footer-links" aria-label="Informations légales">
          <Link href="/terms">Conditions d’utilisation</Link> ·{' '}
          <Link href="/privacy">Politique de confidentialité</Link> ·{' '}
          <Link href="/cookies">Utilisation des cookies</Link>
        </nav>
        <p>
          Ce site est un prototype à but non lucratif créé dans le cadre d’un portfolio.
          <br />© 2026 Laborie Corentin.
        </p>
      </footer>
    </>
  );
}
