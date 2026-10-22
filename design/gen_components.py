"""Generates App-Components.dc.html: the Y component library (element x Desktop / Tablet / Mobile).

usage: python3 gen_components.py <out.dc.html> <height>

Every cell uses the real design-system component (YDS.*) or markup copied from the reference
boards (App-Desktop / App-Tablet / App-Mobile / App-Mobile-Menu and the fixed view boards).
Notification rows are extracted verbatim from the Notifications boards at generation time.
"""
import os
import re
import sys

OUT = sys.argv[1]
H = int(sys.argv[2]) if len(sys.argv) > 2 else 12000
HERE = os.path.dirname(os.path.abspath(__file__))
BOARDS = os.path.join(HERE, 'canvas-build', 'project')
BUNDLE = os.path.join(HERE, '..', '..', 'design-system', 'ds-build', 'project', 'components', 'bundle.js')

YES = '{{yes}}'
NO = '{{no}}'


def V(name):
    """Template value from renderVals()."""
    return '{{' + name + '}}'


def C(comp, children='', **attrs):
    """<x-import> of a YDS component. attrs: python names, '_' -> '-'."""
    a = ''.join(f' {k.rstrip("_").replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<x-import component-from-global-scope="YDS.{comp}"{a}>{children}</x-import>'


def I(n, s=24, c='#1e293b', **kw):
    return C('Icon', name=n, size=s, color=c, **kw)


def AV(name, size, var):
    return f'<span style="flex: none; width: {size}px; height: {size}px; display: flex;">{C("Avatar", name=name, size=V(var))}</span>'


# ---------------------------------------------------------------- library layout helpers
def cap(t):
    return f'<div class="lib-cap">{t}</div>'


def v(caption, html, below=False):
    """One variant: caption above (or below) the element."""
    if below:
        return f'<div class="lib-v">{html}{cap(caption)}</div>'
    return f'<div class="lib-v">{cap(caption)}{html}</div>'


def hrow(*items, gap=24, align='flex-start'):
    return f'<div class="lib-hrow" style="gap: {gap}px; align-items: {align};">{"".join(items)}</div>'


def vcol(*items, gap=16, align='stretch'):
    return f'<div class="lib-vcol" style="gap: {gap}px; align-items: {align};">{"".join(items)}</div>'


def stage(inner, w, pad='16px 17px', bg='#ffffff', extra=''):
    """A piece of screen: fixed width, 1px ring drawn outside the layout (box-shadow)."""
    return f'<div class="lib-stage" style="width: {w}px; padding: {pad}; background: {bg};{extra}">{inner}</div>'


# Desktop/Tablet main = 600 with 1px borders -> 566 content after the 16px padding.
def main_d(inner, pad='16px 17px', extra=''):
    return stage(inner, 600, pad, extra=extra)


def main_m(inner, pad='16px', extra=''):
    return stage(inner, 360, pad, extra=extra)


def bleed_d(inner, extra=''):
    return stage(inner, 600, '0 1px', extra=extra)


def bleed_m(inner, extra=''):
    return stage(inner, 360, '0', extra=extra)


def side(inner):
    """Desktop right column: 350 wide, padding-left 24 -> 326 content, page bg."""
    return stage(inner, 350, '16px 0 16px 24px', '#f8fafc')


def na(t):
    return f'<div class="lib-na">{t}</div>'


def row(name, comp, used, d, t, m):
    return (f'<div class="lib-row"><div class="lib-label"><div class="lib-name">{name}</div><div class="lib-comp">{comp}</div><div class="lib-used">{used}</div></div>'
            f'<div class="lib-cell bp-d">{d}</div><div class="lib-cell bp-d">{t}</div><div class="lib-cell bp-m">{m}</div></div>\n')


def row_all(name, comp, used, inner, scope='bp-d'):
    """Element identical on the three supports: one cell spanning the three columns."""
    return (f'<div class="lib-row"><div class="lib-label"><div class="lib-name">{name}</div><div class="lib-comp">{comp}</div><div class="lib-used">{used}</div></div>'
            f'<div class="lib-cell lib-span {scope}">{inner}</div></div>\n')


SECTION_N = [0]


def section(title, desc, cols=('Desktop', 'Tablet', 'Mobile')):
    SECTION_N[0] += 1
    n = f'{SECTION_N[0]:02d}'
    return (f'<div class="lib-section"><span class="lib-num">{n}</span><h2>{title}</h2><span class="lib-desc">{desc}</span></div>\n'
            f'<div class="lib-cols"><span></span><span>{cols[0]}</span><span>{cols[1]}</span><span>{cols[2]}</span></div>\n')


# ---------------------------------------------------------------- extraction from the view boards
def board(name):
    with open(os.path.join(BOARDS, name), encoding='utf-8') as f:
        return f.read()


def article(src, label, var_map):
    m = re.search(r'<article aria-label="' + re.escape(label) + r'"[\s\S]*?</article>', src)
    if not m:
        raise SystemExit(f'notification "{label}" not found')
    a = m.group(0)
    for k, val in var_map.items():
        a = a.replace(k, val)
    return a


def icon_names():
    src = open(BUNDLE, encoding='utf-8').read()
    block = src[src.index('var ICONS = {'):src.index('};', src.index('var ICONS = {'))]
    return re.findall(r"^\s*'([a-z0-9-]+)':", block, re.M)


# ================================================================ 01 Fondations
R = ''
R += section('Fondations', 'Icônes, logo, avatars')

ICON_TILES = ''.join(f'<div class="lib-icon">{I(n, 24)}<span>{n}</span></div>' for n in icon_names())
R += row_all('Icônes', 'YDS.Icon', f'Lucide, grille 24, trait 2&nbsp;px · {len(icon_names())} icônes du bundle · actif&nbsp;: <code>home-filled</code> ou trait 2,5 (voir Navigation)',
             f'<div class="lib-icons">{ICON_TILES}</div>')

R += row('Logo', 'YDS.YLogo', 'Haut de la navigation (D), du rail (T), barre du haut et menu (M)',
         hrow(v('40 · navigation', C('YLogo', size=40))),
         hrow(v('36 · rail', C('YLogo', size=36))),
         hrow(v('28 · barre du haut, menu', C('YLogo', size=28))))

R += row('Avatar', 'YDS.Avatar', 'Initiale sur fond accent · tailles réellement utilisées',
         hrow(v('28<br>notif', AV('AliceY', 28, 'a28'), True), v('40<br>nav, fil, DM', AV('Corentin Laborie', 40, 'a40'), True),
              v('64<br>contact DM', AV('MarkL', 64, 'a64'), True), v('112<br>profil', AV('AliceY', 112, 'a112'), True), align='flex-end'),
         hrow(v('28<br>notif', AV('AliceY', 28, 'a28'), True), v('40<br>rail, fil, DM', AV('Corentin Laborie', 40, 'a40'), True),
              v('64<br>contact DM', AV('MarkL', 64, 'a64'), True), v('112<br>profil', AV('AliceY', 112, 'a112'), True), align='flex-end'),
         hrow(v('24<br>notif', AV('AliceY', 24, 'a24'), True), v('32<br>barre, fil', AV('Corentin Laborie', 32, 'a32'), True),
              v('40<br>menu, DM', AV('Corentin Laborie', 40, 'a40'), True), v('56<br>contact', AV('MarkL', 56, 'a56'), True),
              v('72<br>profil', AV('AliceY', 72, 'a72'), True), gap=16, align='flex-end'))

# ================================================================ 02 Navigation
R += section('Navigation', 'Navigation principale, compte, en-têtes')

NAV = [('home', 'Accueil'), ('search', 'Explorer'), ('bell', 'Notifications'), ('mail', 'Messages'),
       ('bookmark', 'Signets'), ('user', 'Profil'), ('circle-ellipsis', 'Plus')]


def navlist(comp, active=False, gap=6, extra=''):
    a = {'active': YES} if active else {}
    items = ''.join(C(comp, icon=i, label=l, **a) for i, l in NAV)
    return f'<nav aria-label="{"Navigation principale" if not active else "États actifs"}" style="display: flex; flex-direction: column; gap: {gap}px;{extra}">{items}</nav>'


R += row('Entrée de navigation', 'YDS.NavItem · YDS.RailItem', 'Actif = <code>active</code>&nbsp;: maison pleine, autres icônes trait 2,5 + libellé gras + <code>aria-current</code>',
         hrow(v('inactif', navlist('NavItem')), v('actif (une vue à la fois)', navlist('NavItem', True)), gap=32),
         hrow(v('inactif', navlist('RailItem', gap=8)), v('actif', navlist('RailItem', True, gap=8)), gap=32),
         v('actif · menu (inactif&nbsp;: voir Menu mobile)', navlist('NavItem', True, gap=2)))

R += row('Badge · survol', 'NavItem badge · hover', 'Notifications <code>badge="3"</code> partout sauf sur la vue Notifications',
         hrow(v('badge', C('NavItem', icon='bell', label='Notifications', badge='3')), v('survol', C('NavItem', icon='bell', label='Notifications', hover=YES))),
         hrow(v('badge', C('RailItem', icon='bell', label='Notifications', badge='3')), v('vue Notifications', C('RailItem', icon='bell', label='Notifications', active=YES))),
         hrow(v('badge (menu)', C('NavItem', icon='bell', label='Notifications', badge='3'))))

ACCOUNT_D = ('<button type="button" class="y-account" aria-label="Options du compte Corentin Laborie" style="margin-top: 0;">'
             + AV('Corentin Laborie', 40, 'a40')
             + '<span style="flex: 1; min-width: 0; line-height: 18px;"><span style="display: block; font-size: 15px; font-weight: 700; color: #1e293b;">Corentin Laborie</span><span style="display: block; font-size: 15px; color: #6b7280;">@corentin</span></span>'
             + I('ellipsis', 18) + '</button>')
ACCOUNT_T = ('<button type="button" aria-label="Options du compte Corentin Laborie" style="width: 50px; height: 50px; padding: 0; border: 0; border-radius: 9999px; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer;">'
             + f'<span style="width: 40px; height: 40px; display: flex;">{C("Avatar", name="Corentin Laborie", size=V("a40"))}</span></button>')
POSTER_D = C('Button', 'Poster', variant='primary', size='lg', shape='pill', block=YES)
POSTER_M = C('Button', 'Poster', variant='primary', size='lg', shape='pill', block=YES)
MENU_IDENTITY = ('<div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-top: 4px; border-bottom: 1px solid #e2e8f0;">'
                 + AV('Corentin Laborie', 40, 'a40')
                 + '<div style="line-height: 18px;"><div style="font-size: 15px; font-weight: 700; color: #1e293b;">Corentin Laborie</div><div style="font-size: 15px; color: #6b7280;">@corentin</div></div></div>')

LEFTCOL = ('<div style="width: 275px; box-sizing: border-box; padding: 8px 23px 16px 8px; display: flex; flex-direction: column; background: #f8fafc; box-shadow: 0 0 0 1px #e2e8f0;">'
           f'<div style="padding: 4px 10px 8px;">{C("YLogo", size=40)}</div>'
           '<nav aria-label="Navigation principale" style="display: flex; flex-direction: column; gap: 6px; margin-left: -7px;">'
           + ''.join(C('NavItem', icon=i, label=l, **({'active': YES} if i == 'home' else {}), **({'badge': '3'} if i == 'bell' else {})) for i, l in NAV)
           + f'</nav><div style="margin-top: 20px;">{POSTER_D}</div><div style="margin-top: 32px;">{ACCOUNT_D}</div></div>')
RAIL = ('<div style="width: 88px; box-sizing: border-box; padding: 12px 0 16px; display: flex; flex-direction: column; align-items: center; background: #f8fafc; box-shadow: 0 0 0 1px #e2e8f0;">'
        f'<div style="display: flex; padding: 7px 0;">{C("YLogo", size=36)}</div>'
        '<nav aria-label="Navigation principale" style="display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 4px;">'
        + ''.join(C('RailItem', icon=i, label=l, **({'active': YES} if i == 'home' else {}), **({'badge': '3'} if i == 'bell' else {})) for i, l in NAV)
        + f'</nav><div style="margin-top: 16px;">{C("RailPoster")}</div><div style="margin-top: 32px;">{ACCOUNT_T}</div></div>')
MENU_MODAL = ('<div style="width: 360px; box-sizing: border-box; padding: 8px; background: rgba(30, 41, 59, 0.5);">'
              '<div role="dialog" aria-modal="true" aria-label="Menu" style="box-sizing: border-box; background: #ffffff; border-radius: 16px; box-shadow: 0px 10px 30px -5px rgba(0, 0, 0, 0.25); padding: 12px 12px 16px; display: flex; flex-direction: column;">'
              f'<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 4px 0 16px; height: 40px;">{C("YLogo", size=28)}'
              '<button type="button" aria-label="Fermer le menu" style="width: 36px; height: 36px; padding: 0; border: 0; border-radius: 9999px; background: #f8fafc; box-shadow: inset 0 0 0 1px #e2e8f0; display: flex; align-items: center; justify-content: center; cursor: pointer;">'
              + I('x', 20) + '</button></div>' + MENU_IDENTITY
              + '<nav aria-label="Navigation principale" style="display: flex; flex-direction: column; gap: 2px; padding: 8px 0;">'
              + ''.join(C('NavItem', icon=i, label=l, **({'active': YES} if i == 'home' else {}), **({'badge': '3'} if i == 'bell' else {})) for i, l in NAV)
              + f'</nav><div style="margin-top: 8px;">{POSTER_M}</div></div></div>')

R += row('Colonne de navigation', 'logo + nav + Poster + compte', 'Composition complète (vue Accueil active) · D&nbsp;: colonne 275 · T&nbsp;: rail 88 · M&nbsp;: menu ouvert par ☰',
         LEFTCOL, RAIL, MENU_MODAL)

R += row('Bouton Poster', 'YDS.Button lg pill · YDS.RailPoster', 'Sous la navigation · M&nbsp;: dans le menu',
         f'<div style="width: 244px;">{POSTER_D}</div>', C('RailPoster'), f'<div style="width: 320px;">{POSTER_M}</div>')

R += row('Compte connecté', 'button.y-account · Avatar', 'Bas de la colonne (D), bas du rail (T), barre du haut et haut du menu (M)',
         f'<div style="width: 244px;">{ACCOUNT_D}</div>', ACCOUNT_T,
         vcol(v('barre du haut', f'<a href="#" aria-label="Profil" style="display: flex; width: 36px; height: 36px; align-items: center; text-decoration: none;">{C("Avatar", name="Corentin Laborie", size=V("a32"))}</a>'),
              v('haut du menu', f'<div style="width: 320px;">{MENU_IDENTITY}</div>')))

SETTINGS_BTN = C('IconButton', icon='settings', label='Paramètres des notifications')
NEWMSG_BTN = C('IconButton', icon='mail-plus', label='Nouveau message', tone='ink')
R += row('Barre du haut mobile', 'YDS.MobileTopBar', 'Mobile uniquement (53&nbsp;px) · titre centré exactement · actions avant ☰ · <code>title-href</code> rend le titre cliquable',
         na('Desktop&nbsp;: colonne de navigation + PageHeader'), na('Tablet&nbsp;: rail + PageHeader'),
         vcol(v('défaut · avatar / logo / ☰ (Accueil)', bleed_m(C('MobileTopBar'))),
              v('titre centré (vue)', bleed_m(C('MobileTopBar', title='Explorer'))),
              v('titre + sous-titre', bleed_m(C('MobileTopBar', title='Signets', subtitle='@corentin · 5 questions enregistrées'))),
              v('retour + titre (sous-page)', bleed_m(C('MobileTopBar', back=YES, title='AliceY', subtitle='38 questions'))),
              v('retour + titre lien (title-href · conversation)', bleed_m(C('MobileTopBar', back=YES, back_label='Retour aux messages', title='MarkL', subtitle='@MarkL', title_href='#', title_label='Voir le profil de MarkL'))),
              v('avec action (Notifications&nbsp;: réglages)', bleed_m(C('MobileTopBar', SETTINGS_BTN, title='Notifications'))), gap=12))

R += row('En-tête de page', 'YDS.PageHeader', 'Haut de <code>main</code> (53&nbsp;px) · titre 20/26 800, sous-titre 13/16',
         vcol(v('titre', bleed_d(C('PageHeader', title='Explorer'))),
              v('titre + sous-titre', bleed_d(C('PageHeader', title='Signets', subtitle='@corentin · 5 questions enregistrées'))),
              v('retour (sous-page)', bleed_d(C('PageHeader', back=YES, title='AliceY', subtitle='38 questions'))),
              v('avec action', bleed_d(C('PageHeader', SETTINGS_BTN, title='Notifications'))), gap=12),
         vcol(v('titre', bleed_d(C('PageHeader', title='Explorer'))),
              v('titre + sous-titre', bleed_d(C('PageHeader', title='Signets', subtitle='@corentin · 5 questions enregistrées'))),
              v('retour (sous-page)', bleed_d(C('PageHeader', back=YES, title='AliceY', subtitle='38 questions'))),
              v('avec action', bleed_d(C('PageHeader', SETTINGS_BTN, title='Notifications'))), gap=12),
         na('Remplacé par la barre du haut (MobileTopBar)'))

# ================================================================ 03 Accueil
R += section('Accueil', 'Fil d’actualité')


def tablist(a, b, h, label=''):
    al = f' aria-label="{label}"' if label else ''
    return (f'<div role="tablist"{al} style="display: flex; border-bottom: 1px solid #d1d5db; height: {h}px; box-sizing: border-box; background: #ffffff; flex: none;">'
            + C('Tab', label=a, active=YES, style='flex: 1;') + C('Tab', label=b, style='flex: 1;') + '</div>')


R += row('Onglets', 'YDS.Tab · role="tablist"', 'Accueil (Pour vous / Abonnements), Notifications (Toutes / Mentions) · 53&nbsp;px D/T, 48&nbsp;px M',
         bleed_d(tablist('Pour vous', 'Abonnements', 53)), bleed_d(tablist('Pour vous', 'Abonnements', 53)),
         bleed_m(tablist('Pour vous', 'Abonnements', 48), extra=' padding-bottom: 5px;'))

COMPOSER_D = ('<section style="background: #f8fafc; border-radius: 16px; padding: 16px 20px; display: flex; gap: 12px;">' + AV('Corentin Laborie', 40, 'a40')
              + '<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px;">'
              '<label for="ask-{k}" style="font-size: 13px; font-weight: 700; color: #1e293b;">Posez votre question</label>'
              '<textarea id="ask-{k}" placeholder="Quelle est votre question&nbsp;?" style="display: block; width: 100%; height: 72px; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; font-family: inherit; font-size: 15px; color: #1e293b; resize: none;"></textarea>'
              '<div style="display: flex; align-items: center; justify-content: space-between;">'
              '<div style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #6366f1;">' + I('globe', 16, '#6366f1') + '<span>Tout le monde peut répondre</span></div>'
              + C('Button', 'Poster', variant='primary', size='md', disabled=YES) + '</div></div></section>')
COMPOSER_M = ('<section style="background: #f8fafc; border-radius: 16px; padding: 12px; display: flex; gap: 10px;">' + AV('Corentin Laborie', 32, 'a32')
              + '<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px;">'
              '<label for="ask-m" style="font-size: 13px; font-weight: 700; color: #1e293b;">Posez votre question</label>'
              '<textarea id="ask-m" placeholder="Quelle est votre question&nbsp;?" style="display: block; width: 100%; height: 56px; box-sizing: border-box; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; font-family: inherit; font-size: 14px; color: #1e293b; resize: none;"></textarea>'
              '<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">'
              '<div style="display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: #6366f1; white-space: nowrap;">' + I('globe', 14, '#6366f1') + '<span>Tout le monde peut répondre</span></div>'
              + C('Button', 'Poster', variant='primary', size='sm', disabled=YES) + '</div></div></section>')
R += row('Composer', 'section + YDS.Button (désactivé tant que vide)', 'Haut du fil Accueil',
         main_d(COMPOSER_D.replace('{k}', 'd')), main_d(COMPOSER_D.replace('{k}', 't')), main_m(COMPOSER_M))

NEWQ = ('<button type="button" style="display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 32px; flex: none; border: 1px solid #6366f1; border-radius: 9999px; background: #ffffff; color: #6366f1; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;">'
        + I('plus', 14, '#6366f1') + 'Afficher 12 nouvelles questions</button>')
R += row('Nouvelles questions', 'bouton contour pill 32', 'Sous le composer', main_d(NEWQ), main_d(NEWQ), main_m(NEWQ))

# ================================================================ 04 Questions
R += section('Questions', 'Carte question, conversation, réactions')


def qpost(children='', **kw):
    return C('QuestionPost', children, **kw)


Q_DEFAULT = qpost(author='AliceY', date='14/10/2026 10h41', tags=V('postA.tags'), body=V('postA.body'), reactions=V('postA.reactions'), bookmarkable=YES)
REPLY = qpost(author='AliceY', date='14/10/2026 09h41', body=V('replyA.body'), reactions=V('replyA.reactions'), compact=YES)


def q_full(size=None):
    box = C('ConversationBox', REPLY, reply_to='MarkL', **({'size': size} if size else {}))
    return qpost(box, author='MarkL', date='14/10/2026 09h12', tags=V('postB.tags'), body=V('postB.body'), reactions=V('postB.reactions'),
                 followed=YES, y_active=YES, bookmarkable=YES, saved=YES)


R += row('Question', 'YDS.QuestionPost', 'Fil, Explorer, Profil, Signets · « ⋯ » options · nombres formatés « 2&nbsp;000 » · &lt;&nbsp;50&nbsp;Y = pas de conversation',
         main_d(Q_DEFAULT), main_d(Q_DEFAULT), main_m(Q_DEFAULT))
R += row('Question · suivie, Y actif, enregistrée', 'QuestionPost followed y-active saved + YDS.ConversationBox', '≥&nbsp;50&nbsp;Y&nbsp;: conversation ouverte avec au moins une réponse et « Voir plus de réponses » · ConversationBox md (D/T, « Signaler ce post »), sm (M, « Signaler »)',
         main_d(q_full()), main_d(q_full()), main_m(q_full('sm')))

REPLY_NOFOLLOW = qpost(author='AliceY', date='15/10/2026 10h18', body=V('nReply.body'), reactions=V('nReply.reactions'), compact=YES, hide_follow=YES)
R += row('Réponse compacte', 'QuestionPost compact', 'Dans ConversationBox · sans « Suivre » (<code>hide-follow</code>) dans une notification ou sur son propre profil',
         main_d(vcol(v('compact', REPLY), v('compact · hide-follow', REPLY_NOFOLLOW))),
         main_d(vcol(v('compact', REPLY), v('compact · hide-follow', REPLY_NOFOLLOW))),
         main_m(vcol(v('compact', REPLY), v('compact · hide-follow', REPLY_NOFOLLOW))))

MENU_OTHER = C('Menu', items=V('menuOther'), label='Options de la question')
MENU_MINE = C('Menu', items=V('menuMine'), label='Options de la question')
R += row('Menu d’options', 'YDS.Menu', 'Ouvert par « ⋯ » d’une question · « Supprimer » sur ses propres questions · rouge = action destructive',
         hrow(v('question d’un autre', MENU_OTHER), v('ma question', MENU_MINE)),
         hrow(v('question d’un autre', MENU_OTHER), v('ma question', MENU_MINE)),
         vcol(v('question d’un autre', MENU_OTHER), v('ma question', MENU_MINE)))

PILLS = hrow(v('j’aime', C('ReactionPill', kind='like', count='124')), v('pas d’accord', C('ReactionPill', kind='dislike', count='12')),
             v('Y', C('ReactionPill', kind='y', count='49')), v('Y actif', C('ReactionPill', kind='y', count='89', active=YES)), gap=12)
R += row('Réactions', 'YDS.ReactionPill', 'Actions d’une question · 32&nbsp;px D/T, 30&nbsp;px M · Y actif = fond accent',
         PILLS, PILLS, PILLS)
SAVE = hrow(v('non enregistré', C('SaveButton')), v('enregistré', C('SaveButton', saved=YES)), gap=24)
R += row('Signet', 'YDS.SaveButton', 'Fin de la ligne d’actions · enregistré = icône pleine, fond accent', SAVE, SAVE, SAVE)
FOLLOW = hrow(v('suivre', C('FollowButton')), v('suivi', C('FollowButton', followed=YES)),
              v('md', C('FollowButton', size='md')), v('md · suivi', C('FollowButton', size='md', followed=YES)), gap=12)
R += row('Suivre', 'YDS.FollowButton', 'En-tête de question, Suggestions, notifications · « Suivi&nbsp;! » uniquement sur MarkL',
         FOLLOW, FOLLOW, FOLLOW)

# ================================================================ 05 Barre latérale
R += section('Barre latérale', 'Desktop uniquement (colonne 350, contenu 326)', cols=('Desktop', '', ''))

CONCEPT = ('<section style="background: #6366f1; border-radius: 24px; box-shadow: 0px 4px 8px -1px rgba(0, 0, 0, 0.1); padding: 20px; color: #ffffff;">'
           '<h2 style="margin: 0 0 4px; font-size: 20px; line-height: 26px; font-weight: 700;">Une expérience sociale concrète</h2>'
           '<p style="margin: 0 0 14px; font-size: 13px; line-height: 18px; color: rgba(255, 255, 255, 0.85);">Posez vos questions, donnez votre avis et réfléchissez ensemble.</p>'
           '<div style="background: #ffffff; border-radius: 16px; padding: 14px 16px; color: #1e293b;">'
           '<div style="font-size: 13px; line-height: 18px; font-weight: 700;">Au bout de 50&nbsp;Y, une conversation s’ouvre sous la question.</div>'
           '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">'
           + C('ReactionPill', kind='like', count='J’aime') + C('ReactionPill', kind='dislike', count='Pas d’accord')
           + C('ReactionPill', kind='y', count='Why&nbsp;?', active=YES) + '</div></div></section>')
TRENDS = ('<section class="y-side-card"><h2>Tendances pour vous</h2>'
          '<a href="#" class="y-trend"><strong>#online_life</strong><span>2&nbsp;000 questions</span></a>'
          '<a href="#" class="y-trend"><strong>#irl_vs_online</strong><span>1&nbsp;240 questions</span></a>'
          '<a href="#" class="y-trend"><strong>#human_life</strong><span>864 questions</span></a>'
          '<a href="#" class="y-trend"><strong>#communication</strong><span>512 questions</span></a></section>')


def user_row(n):
    return f'<div class="y-user-row">{AV(n, 40, "a40")}<div class="y-user-row-text"><strong>{n}</strong><span>@{n}</span></div>{C("FollowButton")}</div>'


SUGG = '<section class="y-side-card"><h2>Suggestions</h2>' + ''.join(user_row(n) for n in ('RizaHawkeye', 'AntonyGille', 'Robert44')) + '</section>'

R += row_all('Barre latérale', 'SearchField · section indigo · .y-side-card · .y-user-row · Footer', 'Desktop uniquement (Accueil, Profil, Signets, Plus, Notifications) · Tablet et Mobile&nbsp;: absente · cartes espacées de 16&nbsp;px',
             hrow(vcol(v('recherche · YDS.SearchField md', side(C('SearchField', label='Rechercher une question'))),
                       v('carte concept · règle des 50&nbsp;Y', side(CONCEPT)), gap=24),
                  v('tendances · hashtags uniquement', side(TRENDS)),
                  v('suggestions · jamais MarkL (déjà suivi)', side(SUGG)),
                  v('pied de page · YDS.Footer sidebar', side(C('Footer', variant='sidebar'))), gap=32))

# ================================================================ 06 Explorer
R += section('Explorer', 'Recherche, tendances, questions populaires')
XSEARCH = dict(show_label=YES, label='Rechercher une question ou un #hashtag', placeholder='Ex.&nbsp;: #slow_social, débat, AliceY…')
R += row('Recherche avec libellé', 'YDS.SearchField show-label', 'Haut de la vue Explorer · md (D/T), sm (M)',
         main_d(C('SearchField', size='md', **XSEARCH)), main_d(C('SearchField', size='md', **XSEARCH)), main_m(C('SearchField', size='sm', **XSEARCH)))


def xhead(icon, title):
    return f'<div class="y-xsec-head">{I(icon, 20, "#6366f1")}<h2>{title}</h2></div>'


R += row('Titre de section', '.y-xsec-head · Icon 20 + h2', 'Tendances, Questions populaires · 18/24 700 (D/T), 15/20 (M)',
         main_d(vcol(xhead('hash', 'Tendances'), xhead('trending-up', 'Questions populaires'), gap=12)),
         main_d(vcol(xhead('hash', 'Tendances'), xhead('trending-up', 'Questions populaires'), gap=12)),
         main_m(vcol(xhead('hash', 'Tendances'), xhead('trending-up', 'Questions populaires'), gap=12)))

XTR = [('#online_life', '2&nbsp;000'), ('#irl_vs_online', '1&nbsp;240'), ('#human_life', '864'), ('#communication', '512'), ('#slow_social', '348'), ('#debat_sain', '215')]
XTRENDS = ('<section class="y-xtrends" aria-label="Tendances"><ol>'
           + ''.join(f'<li><a href="#" class="y-xtrend"><span class="y-xtrend-rank">{i + 1}.</span><span class="y-xtrend-text"><strong>{t}</strong><span>{n}&nbsp;questions</span></span>{I("trending-up", 16, "#6b7280")}</a></li>'
                     for i, (t, n) in enumerate(XTR)) + '</ol></section>')
R += row('Tendances (classement)', 'section.y-xtrends', 'Explorer · 6 hashtags · 2 colonnes × 3 (D/T), 1 colonne (M)',
         main_d(XTRENDS), main_d(XTRENDS), main_m(XTRENDS))

# ================================================================ 07 Notifications
R += section('Notifications', 'En-tête, filtres, lignes de notification')
R += row('En-tête + filtres', 'PageHeader bordered=no + IconButton · MobileTopBar · Tab', 'Réglages&nbsp;: engrenage dans l’en-tête (D/T) et dans la barre du haut (M) · pas de badge sur cette vue',
         bleed_d(C('PageHeader', SETTINGS_BTN, title='Notifications', bordered=NO) + tablist('Toutes', 'Mentions', 53, 'Filtrer les notifications')),
         bleed_d(C('PageHeader', SETTINGS_BTN, title='Notifications', bordered=NO) + tablist('Toutes', 'Mentions', 53, 'Filtrer les notifications')),
         bleed_m(C('MobileTopBar', SETTINGS_BTN, title='Notifications') + tablist('Toutes', 'Mentions', 48, 'Filtrer les notifications'), extra=' padding-bottom: 5px;'))

ND, NT, NM = board('Notifications-Desktop.dc.html'), board('Notifications-Tablet.dc.html'), board('Notifications-Mobile.dc.html')
VM_D = {'{{avS}}': V('a28'), '{{reply.': '{{nReply.'}
VM_M = {'{{avS}}': V('a24'), '{{reply.': '{{nReply.'}
NOTIFS = [
    ('Conversation ouverte', 'Non lue · cercle Y + bouton « Rejoindre la conversation »', 'Non lue : votre question a atteint 50 Y, la conversation est ouverte'),
    ('Réactions Y groupées', 'Non lue · YLogo + 3 avatars max + « et N autres »', 'Non lue : MarkL et 12 autres ont réagi Y à votre question'),
    ('Réponse', 'Non lue · réponse intégrée (QuestionPost compact, hide-follow)', 'Non lue : AliceY a répondu à votre question'),
    ('Nouvel abonné', 'Lue · « Suivre en retour »', 'RizaHawkeye vous suit désormais'),
    ('J’aime groupés', 'Lue · citation grise', 'Robert44 et 24 autres aiment votre question'),
    ('Pas d’accord', 'Lue · pouce rouge', 'AntonyGille et 3 autres ne sont pas d’accord avec votre question'),
    ('Mention', 'Onglet Mentions · citation de la réponse', 'MarkL vous a mentionné dans une réponse'),
]
for name, used, label in NOTIFS:
    R += row('Notif · ' + name, 'article · Avatar · Icon / YLogo', used,
             bleed_d(article(ND, label, VM_D)), bleed_d(article(NT, label, VM_D)), bleed_m(article(NM, label, VM_M)))

# ================================================================ 08 Messages
R += section('Messages', 'Liste des conversations et fil privé')


def dm_row(name, when, text, unread=False, sel=False):
    cls = 'y-dm-row is-unread' if unread else 'y-dm-row'
    cur = ' aria-current="true"' if sel else ''
    dot = '<span class="y-dm-dot" role="img" aria-label="Non lu"></span>' if unread else ''
    return (f'<li><a href="#" class="{cls}"{cur}><span class="y-dm-av">{C("Avatar", name=name, size=V("a40"))}</span>'
            f'<span class="y-dm-text"><span class="y-dm-l1"><strong>{name}</strong><span class="y-dm-handle">@{name}</span><span class="y-dm-when">· {when}</span></span>'
            f'<span class="y-dm-l2"><span class="y-dm-prev">{text}</span>{dot}</span></span></a></li>')


R_SEL = dm_row('MarkL', '09h33', 'Vous&nbsp;: Poste-la&nbsp;! Je mets le premier Y.', sel=True)
R_NORM = dm_row('MarkL', '09h33', 'Vous&nbsp;: Poste-la&nbsp;! Je mets le premier Y.')
R_UNREAD = dm_row('AliceY', '08h52', 'Tu as vu les réponses sous ma question #human_life&nbsp;? Il y en a une qui m’a fait changer d’avis.', unread=True)
R_READ = dm_row('RizaHawkeye', '14/10', 'Merci pour ta réponse, je la garde en signet.')


def dm_list(w, rows):
    return stage(f'<ul class="y-dm-rows" aria-label="Conversations">{rows}</ul>', w, '0')


DM_HEAD_DT = (lambda w: stage(C('PageHeader', NEWMSG_BTN, title='Messages')
                              + f'<div class="y-dm-search">{C("SearchField", label="Rechercher dans les messages")}</div>', w, '0'))
R += row('En-tête de liste', 'PageHeader + IconButton · SearchField', 'Haut de la liste · « Nouveau message » = IconButton mail-plus',
         v('liste 380', DM_HEAD_DT(380)), v('liste 320', DM_HEAD_DT(320)),
         v('sous la barre du haut « Messages »', bleed_m(f'<div class="y-dm-search"><div>{C("SearchField", label="Rechercher dans les messages", size="sm")}</div>{NEWMSG_BTN}</div>')))
R += row('Ligne de conversation', 'a.y-dm-row · Avatar 40', 'Sélectionnée = fond + liseré droit · non lue = aperçu gras + point · M&nbsp;: pas d’état sélectionné (liste plein écran)',
         vcol(v('sélectionnée', dm_list(380, R_SEL)), v('non lue', dm_list(380, R_UNREAD)), v('lue', dm_list(380, R_READ)), gap=12),
         vcol(v('sélectionnée', dm_list(320, R_SEL)), v('non lue', dm_list(320, R_UNREAD)), v('lue', dm_list(320, R_READ)), gap=12),
         vcol(v('lue', dm_list(360, R_NORM)), v('non lue', dm_list(360, R_UNREAD)), gap=12))

DM_HEAD = ('<header class="y-dm-head" style="border-bottom: 0;">' + f'<span class="y-dm-av">{C("Avatar", name="MarkL", size=V("a40"))}</span>'
           + '<div class="y-dm-head-text"><h2>MarkL</h2><p>@MarkL</p></div>' + C('Button', 'Voir le profil', variant='outline', size='sm', shape='pill') + '</header>')
R += row('En-tête de conversation', '.y-dm-head · MobileTopBar retour', 'Haut du fil · M&nbsp;: retour « Retour aux messages » + nom + @',
         stage(DM_HEAD, 569, '0'), stage(DM_HEAD, 359, '0'),
         bleed_m(C('MobileTopBar', back=YES, back_label='Retour aux messages', title='MarkL', subtitle='@MarkL', title_href='#', title_label='Voir le profil de MarkL')))


def dm_thread(av):
    return ('<div class="y-dm-thread"><div class="y-dm-contact">'
            f'<span class="y-dm-contact-av">{C("Avatar", name="MarkL", size=V(av))}</span>'
            '<strong>MarkL</strong><span class="y-dm-contact-handle">@MarkL</span>'
            '<p>Je pose des questions sur nos vies en ligne, et j’écoute surtout les réponses.</p>'
            '<span class="y-dm-contact-meta">A rejoint Y en janvier 2026 · <b>1&nbsp;120</b> abonnés</span></div>'
            '<div class="y-dm-day">Aujourd’hui</div>'
            '<div class="y-dm-bubble y-dm-in">Salut Corentin&nbsp;! J’ai vu ton Y sous ma question <a href="#">#irl_vs_online</a>.</div>'
            '<div class="y-dm-bubble y-dm-in">Tu penses vraiment qu’on est plus sincère derrière un écran&nbsp;?</div>'
            '<div class="y-dm-time is-in">MarkL · 09h20</div>'
            '<div class="y-dm-bubble y-dm-out">Pas forcément plus sincère. Mais on prend le temps de choisir ses mots.</div>'
            '<div class="y-dm-time is-out">09h24</div>'
            '<div class="y-dm-bubble y-dm-out">Poste-la&nbsp;! Je mets le premier Y.</div>'
            '<div class="y-dm-time is-out">09h33 · Vu</div></div>')


R += row('Fil privé', '.y-dm-contact · .y-dm-day · .y-dm-bubble', 'Carte contact, séparateur de jour, bulles reçues (gris, à gauche) et envoyées (indigo, à droite), heure · « Vu »',
         stage(dm_thread('a64'), 569, '0'), stage(dm_thread('a64'), 359, '0'), bleed_m(dm_thread('a56')))

DM_COMPOSE = ('<form class="y-dm-compose" style="border-top: 0;" onsubmit="return false"><label for="dm-{k}" class="y-sr">Écrire un message à MarkL</label>'
              '<textarea id="dm-{k}" class="y-dm-input" rows="1" placeholder="Écrire un message"></textarea>'
              '<button type="submit" class="y-dm-send" aria-label="Envoyer">' + I('send', 20, '#ffffff') + '</button></form>')
R += row('Composer message', 'form.y-dm-compose', 'Bas du fil · champ pill + bouton envoyer rond (44&nbsp;px D/T, 40&nbsp;px M)',
         stage(DM_COMPOSE.replace('{k}', 'd'), 569, '0'), stage(DM_COMPOSE.replace('{k}', 't'), 359, '0'), bleed_m(DM_COMPOSE.replace('{k}', 'm')))

# ================================================================ 09 Signets
R += section('Signets', 'Questions enregistrées')
SORT = C('Select', inline=YES, label='Trier par', options=V('sortOptions'), value=V('sortValue'))
R += row('Recherche + tri', 'YDS.SearchField · YDS.Select inline', 'Haut de la vue Signets (sous PageHeader / MobileTopBar « Signets »)',
         main_d(vcol(C('SearchField', label='Rechercher dans vos signets'), SORT, gap=12)),
         main_d(vcol(C('SearchField', label='Rechercher dans vos signets'), SORT, gap=12)),
         main_m(vcol(C('SearchField', label='Rechercher dans vos signets', size='sm'), SORT, gap=12)))

# ================================================================ 10 Profil
R += section('Profil', 'Page utilisateur (AliceY)')
PROFILE = ('<div class="y-prof-cover"></div><section class="y-prof" aria-label="Profil de AliceY" style="border-bottom: 0;">'
           '<div class="y-prof-avatar">{AV}</div><div class="y-prof-actions">'
           + C('Button', variant='outline', size='md', shape='pill', icon='mail', class_name='y-prof-msg', aria_label='Envoyer un message à AliceY')
           + C('Button', 'Suivre', variant='primary', size='md', shape='pill', icon='user-plus', aria_pressed='false') + '</div>'
           '<h2 class="y-prof-name">AliceY</h2><p class="y-prof-handle">@AliceY</p>'
           '<p class="y-prof-bio">Curieuse de tout, je pose les questions que personne n’ose poser. Ici pour réfléchir ensemble, pas pour avoir raison.</p>'
           '<p class="y-prof-meta">' + I('calendar', 18, '#6b7280') + 'A rejoint Y en mars 2026</p>'
           '<div class="y-prof-counts"><a href="#"><strong>182</strong> abonnements</a><a href="#"><strong>2&nbsp;340</strong> abonnés</a></div></section>')
R += row('En-tête de profil', '.y-prof · Avatar · Button md pill', 'Sous PageHeader / MobileTopBar retour « AliceY · 38 questions » · bannière 150 (D/T), 90 (M)',
         stage(PROFILE.replace('{AV}', C('Avatar', name='AliceY', size=V('a112'))), 600, '0 1px'),
         stage(PROFILE.replace('{AV}', C('Avatar', name='AliceY', size=V('a112'))), 600, '0 1px'),
         bleed_m(PROFILE.replace('{AV}', C('Avatar', name='AliceY', size=V('a72')))))

# ================================================================ 11 Plus
R += section('Plus', 'Paramètres et assistance')


def set_row(icon, label, desc):
    return (f'<a href="#" class="y-set-row"><span class="y-set-ico">{I(icon, 18, "#6366f1")}</span><span class="y-set-text"><strong>{label}</strong><span>{desc}</span></span>'
            f'<span class="y-set-chev">{I("chevron-right", 18, "#6b7280")}</span></a>')


SETTINGS = ('<div class="y-set" style="padding: 0;"><section class="y-set-section" aria-labelledby="{k}-compte"><h2 id="{k}-compte">Votre compte</h2><div class="y-set-card">'
            + set_row('user', 'Modifier mon profil', 'Nom, bio, @identifiant et adresse e-mail')
            + set_row('lock', 'Changer mon mot de passe', 'Mettez à jour votre mot de passe régulièrement') + '</div></section></div>')
LOGOUT = C('Button', 'Se déconnecter', variant='destructive', size='lg', shape='pill', block=YES, icon='log-out')
R += row('Groupe de réglages', '.y-set-section · .y-set-row', 'Votre compte, Assistance · titre 15/20 700, carte radius 16, lignes 62&nbsp;px séparées par 1&nbsp;px',
         main_d(SETTINGS.replace('{k}', 'd')), main_d(SETTINGS.replace('{k}', 't')), main_m(SETTINGS.replace('{k}', 'm')))
R += row('Déconnexion', 'YDS.Button destructive lg pill block', 'Bas de la vue Plus', main_d(LOGOUT), main_d(LOGOUT), main_m(LOGOUT))

# ================================================================ 12 Composants génériques
R += section('Composants génériques', 'Identiques sur les trois supports', cols=('Desktop · Tablet · Mobile', '', ''))

BTN_VARIANTS = ['primary', 'outline', 'secondary', 'ghost', 'destructive', 'danger']
BTN_GRID = ('<div class="lib-btngrid"><span></span>' + ''.join(f'<span class="lib-cap">{s}</span>' for s in ('sm', 'md', 'lg', 'sm pill', 'md pill', 'lg pill'))
            + ''.join(f'<span class="lib-cap">{vr}</span>' + ''.join(C('Button', 'Bouton', variant=vr, size=s) for s in ('sm', 'md', 'lg'))
                      + ''.join(C('Button', 'Bouton', variant=vr, size=s, shape='pill') for s in ('sm', 'md', 'lg')) for vr in BTN_VARIANTS) + '</div>')
R += row_all('Bouton', 'YDS.Button', 'Variantes × tailles (sm 32 / md 40 / lg 48 · pill sm 34 / lg 52) · destructive = contour #ef4444, texte #dc2626 · danger = plein rouge',
             vcol(BTN_GRID, hrow(v('avec icône', C('Button', 'Rejoindre la conversation', variant='primary', size='sm', shape='pill', icon='message-circle')),
                                 v('icône à droite (Y)', C('Button', 'Rejoindre la communauté', variant='secondary', size='lg', icon_right='y')),
                                 v('désactivé', C('Button', 'Poster', variant='primary', size='md', disabled=YES)), gap=32), gap=24))
R += row_all('Bouton icône', 'YDS.IconButton', 'Actions d’en-tête · 36&nbsp;px · <code>label</code> obligatoire · primary = réglages Notifications, ink = nouveau message (Messages)',
             hrow(v('primary', SETTINGS_BTN), v('primary · survol', C('IconButton', icon='settings', label='Paramètres', hover=YES)),
                  v('muted', C('IconButton', icon='mail-plus', label='Nouveau message', tone='muted')),
                  v('muted · survol', C('IconButton', icon='mail-plus', label='Nouveau message', tone='muted', hover=YES)),
                  v('ink', C('IconButton', icon='mail-plus', label='Nouveau message', tone='ink')),
                  v('ink · survol', C('IconButton', icon='mail-plus', label='Nouveau message', tone='ink', hover=YES)), gap=32))
R += row_all('Champ de texte', 'YDS.TextField', 'Formulaires Auth · libellé 18 600, champ 56&nbsp;px · erreur via <code>error</code> / <code>errors</code> (aria-invalid, texte #dc2626)',
             f'<div class="lib-fields">'
             + v('défaut', C('TextField', label='Identifiant', placeholder='Email ou numéro de téléphone'))
             + v('erreur', C('TextField', label='Identifiant', value='RobertoCarlos', error='Cet identifiant existe déjà dans notre système.'))
             + v('mot de passe (afficher / masquer)', C('TextField', label='Mot de passe', placeholder='Votre mot de passe sécurisé', type='password', revealable=YES))
             + v('icône', C('TextField', label='Date de naissance', placeholder='JJ/MM/AAAA', icon='calendar'))
             + v('erreurs multiples', C('TextField', label='Confirmer le mot de passe', type='password', value='motdepasse', errors=V('pwErrors')))
             + v('multiligne', C('TextField', label='Bio', multiline=YES, rows='3', placeholder='Présentez-vous en quelques mots'))
             + '</div>')
R += row_all('Case à cocher · liste', 'YDS.Checkbox · YDS.Select', 'Conditions d’utilisation (Auth) · tri des Signets',
             hrow(v('non cochée', C('Checkbox', label='J’accepte les termes d’utilisation de Y')),
                  v('cochée', C('Checkbox', label='J’accepte les termes d’utilisation de Y', checked=YES)),
                  v('select inline', SORT), v('select avec libellé au-dessus', C('Select', label='Trier par', options=V('sortOptions'), value=V('sortValue'))), gap=40))
R += row_all('Champ de recherche', 'YDS.SearchField', 'md 44&nbsp;px (D/T), sm 40&nbsp;px (M) · libellé visible seulement sur Explorer · valeur = bouton effacer du composant (croix native masquée)',
             f'<div class="lib-fields">'
             + v('md', C('SearchField', label='Rechercher une question'))
             + v('sm', C('SearchField', label='Rechercher dans vos signets', size='sm'))
             + v('avec valeur', C('SearchField', label='Rechercher une question', value='#slow_social'))
             + '</div>')
R += row_all('Dialogue · toast · état vide', 'YDS.Dialog · YDS.Toast · YDS.EmptyState', 'Confirmation destructive, retour d’action, liste vide (composants de la bibliothèque)',
             hrow(v('Dialog tone="danger"', '<div style="width: 360px;">' + C('Dialog', title='Supprimer la question&nbsp;?', text='Elle disparaîtra de votre profil, du fil et des signets. Cette action est définitive.',
                                                                        confirm_label='Supprimer', cancel_label='Annuler', tone='danger') + '</div>'),
                  v('Toast', C('Toast', message='Retiré de vos signets', action='Annuler')),
                  v('EmptyState', '<div style="width: 420px; box-shadow: 0 0 0 1px #e2e8f0;">' + C('EmptyState', icon='bookmark', title='Aucun signet pour l’instant',
                                                                                                   text='Enregistrez une question avec l’icône signet pour la retrouver ici.') + '</div>'), gap=40))

# ================================================================ 13 Landing
R += section('Landing', 'Page d’accueil publique (Main · Landing-Tablet · Landing-Mobile)')

HERO = ('<div style="display: flex; flex-direction: column; align-items: center; text-align: center;">' + C('YLogo', size=100)
        + '<h1 style="margin: {mt}px 0 0; font-size: {h}px; line-height: {lh}px; font-weight: 700; color: #1e293b;">Y, le réseau social qui vous fait réfléchir.</h1>'
        '<p style="margin: {pm}px 0 0; font-size: {p}px; line-height: {plh}px; color: #6366f1;">On ne demande jamais assez Why&nbsp;?</p></div>')
R += row('Hero', 'YLogo 100 + h1 + accroche', 'Haut de page, centré · h1 64/72 (D), 48/58 (T), 18/26 (M) · accroche indigo',
         vcol(cap('aperçu à 39&nbsp;% · largeur réelle 1440'), main_d('<div style="width: 1440px; zoom: 0.393; padding: 40px 0;">' + HERO.format(mt=50, h=64, lh=72, pm=12, p=24, plh=32) + '</div>', pad='0 1px'), gap=8),
         vcol(cap('aperçu à 74&nbsp;% · largeur réelle 768'), main_d('<div style="width: 768px; zoom: 0.737; padding: 32px 0;">' + HERO.format(mt=27, h=48, lh=58, pm=24, p=20, plh=32) + '</div>', pad='0 1px'), gap=8),
         vcol(cap('taille réelle'), main_m(HERO.format(mt=16, h=18, lh=26, pm=8, p=16, plh=24)), gap=8))

CTA = lambda s, g: f'<div style="display: flex; justify-content: center; gap: {g}px;">' + C('Button', 'Découvrir Y', variant='primary', size=s) + C('Button', 'En savoir plus', variant='outline', size=s) + '</div>'
R += row('Boutons d’appel', 'YDS.Button primary + outline', 'Sous le carrousel · lg (D/T), md (M)', main_d(CTA('lg', 16)), main_d(CTA('lg', 16)), main_m(CTA('md', 16)))

DOTS = ('<div style="display: flex; justify-content: center; gap: 6px; margin-top: 16px;"><span style="width: 6px; height: 6px; border-radius: 9999px; background: #e0e7ff;"></span>'
        '<span style="width: 6px; height: 6px; border-radius: 9999px; background: #6366f1;"></span><span style="width: 6px; height: 6px; border-radius: 9999px; background: #e0e7ff;"></span></div>')


def slide(w, fs, lh, r):
    return (f'<div style="position: relative; width: {w}px; height: 300px; margin: 0 auto; border-radius: {r}px; overflow: hidden; background: #e0e7ff; box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.15);">'
            f'<img src="/_blob/fa1e1aa44634afa7f8e1473f4ae59929" alt="Un homme consulte son téléphone" style="width: {w}px; height: 300px; object-fit: cover; display: block; color: transparent;">'
            f'<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 60px; background: linear-gradient(to top, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0)); display: flex; align-items: flex-end; padding: 0 12px 10px; box-sizing: border-box; color: #ffffff; font-size: {fs}px; line-height: {lh}px;">Des questions, des échanges, des liens.</div></div>'
            + DOTS)


R += row('Carrousel', 'cadre 480 × 300 + légende + points', 'Image centrale (photo non chargée en local) · point actif indigo',
         main_d(slide(480, 12, 16, 16)), main_d(slide(480, 12, 16, 16)), main_m(slide(328, 14, 18, 16)))
EXPLAIN = '<p style="margin: 0; font-size: {f}px; line-height: {l}px; color: #6b7280;">Au bout de 50&nbsp;Y, une conversation s’ouvre sous la question.</p>'
R += row('Ligne d’explication', 'p muted', 'Bandeau « Une expérience sociale concrète », au-dessus de la question avec conversation',
         main_d(EXPLAIN.format(f=13, l=18)), main_d(EXPLAIN.format(f=13, l=18)), main_m(EXPLAIN.format(f=12, l=16)))
SAFE = ('<ul style="margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 14px; font-size: {f}px; line-height: {l}px; color: #1e293b;">'
        '<li style="display: flex; align-items: center; gap: 10px;">' + I('shield', 20, '#6366f1') + '<span>Soyez acteurs des dires de la plateforme</span></li>'
        '<li style="display: flex; align-items: center; gap: 10px;">' + I('eye-off', 20, '#6366f1') + '<span>Une protection des mineurs accrue</span></li>'
        '<li style="display: flex; align-items: center; gap: 10px;">' + I('flag', 20, '#6366f1') + '<span>Signalez rapidement les contenus inappropriés</span></li></ul>')
R += row('Liste sécurité', 'li · Icon 20 indigo + texte', 'Carte « Un espace sûr pour réfléchir » · 16/22 (D/T), 14/20 (M)',
         main_d(SAFE.format(f=16, l=22)), main_d(SAFE.format(f=16, l=22)), main_m(SAFE.format(f=14, l=20)))
JOIN = ('<section style="box-sizing: border-box; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; display: flex; flex-direction: column; align-items: center; text-align: center; padding: {p};">'
        '<h2 style="margin: 0 0 16px; font-size: 24px; line-height: 30px; font-weight: 700; color: #1e293b;">Rejoignez la communauté</h2>'
        '<p style="margin: 0 0 24px; font-size: {f}px; line-height: {l}px; color: #6b7280;">L’inscription est réservée aux adultes de 18&nbsp;ans et plus.<br>Les mineurs ne peuvent pas créer de compte sur Y.<br>Âge calculé à partir de la date de naissance déclarée</p>'
        + C('Button', 'Créer mon compte', variant='primary', size='lg') + '</section>')
R += row('Carte d’inscription', 'section + YDS.Button lg', 'Bas de page, centrée',
         main_d(JOIN.format(p='32px 24px', f=16, l=22)), main_d(JOIN.format(p='32px 24px', f=16, l=22)), main_m(JOIN.format(p='24px 16px', f=14, l=20).replace('<br>', ' ')))
FOOT_PAGE = C('Footer', variant='page', links=YES)
R += row('Pied de page', 'YDS.Footer variant="page" links', 'Bas de Landing et Auth · mention 12/18 · liens légaux',
         main_d(FOOT_PAGE, pad='0 1px'), main_d(FOOT_PAGE, pad='0 1px'), main_m(FOOT_PAGE, pad='0'))

# ================================================================ 14 Auth
R += section('Auth', 'Connexion, inscription, code')


def auth_title(l1, l2, f1, lh1, f2, lh2, w1=600):
    return ('<h1 style="margin: 0; text-align: center;">'
            f'<span style="display: block; font-size: {f1}px; line-height: {lh1}px; font-weight: {w1}; color: #1e293b;">{l1}</span>'
            f'<span style="display: block; font-size: {f2}px; line-height: {lh2}px; font-weight: 700; color: #6366f1; text-decoration: underline; text-decoration-thickness: {4 if f2 > 40 else 2}px; text-underline-offset: {9 if f2 > 40 else 5}px;">{l2}</span></h1>')


R += row('Bloc titre', 'h1 deux lignes', 'Connexion « why&nbsp;? » · Inscription « Why not&nbsp;? » · 40 + 54 (D), 32 (T), 18 + 20 (M)',
         main_d(vcol(auth_title('On ne demande jamais assez', 'why&nbsp;?', 40, 48, 54, 64), auth_title('Nous rejoindre&nbsp;?', 'Why not&nbsp;?', 40, 48, 54, 64), gap=32), pad='24px'),
         main_d(vcol(auth_title('On ne demande jamais assez', 'why&nbsp;?', 32, 40, 32, 40), auth_title('Nous rejoindre&nbsp;?', 'Why not&nbsp;?', 32, 40, 32, 40), gap=32), pad='24px'),
         main_m(vcol(auth_title('On ne demande jamais assez', 'why&nbsp;?', 18, 24, 20, 26), auth_title('Nous rejoindre&nbsp;?', 'Why not&nbsp;?', 18, 24, 20, 26), gap=24)))


def retour(f, lh, ic):
    return (f'<a href="#" style="display: inline-flex; align-items: center; gap: 8px; color: #6366f1; font-size: {f}px; line-height: {lh}px; font-weight: 600; text-decoration: none;">'
            + C('Icon', name='arrow-left', size=ic, stroke_width='2.5') + 'Retour</a>')


R += row('Lien Retour', 'a + Icon arrow-left (trait 2,5)', 'Haut à gauche des étapes Inscription / Code (et Connexion mobile)',
         main_d(retour(28, 34, 28)), main_d(retour(24, 28, 28)), main_m(retour(14, 20, 18)))
R += row('Champs', 'YDS.TextField', 'Défaut, erreur, mot de passe · même composant sur les 3 supports',
         main_d(vcol(C('TextField', label='Identifiant', placeholder='Email ou numéro de téléphone'),
                     C('TextField', label='Email', value='alex@', error='Cet email existe déjà dans notre système.'),
                     C('TextField', label='Mot de passe', placeholder='Votre mot de passe sécurisé', type='password', revealable=YES))),
         main_d(vcol(C('TextField', label='Identifiant', placeholder='Email ou numéro de téléphone'),
                     C('TextField', label='Email', value='alex@', error='Cet email existe déjà dans notre système.'),
                     C('TextField', label='Mot de passe', placeholder='Votre mot de passe sécurisé', type='password', revealable=YES))),
         main_m(vcol(C('TextField', label='Identifiant', placeholder='Email ou numéro de téléphone'),
                     C('TextField', label='Email', value='alex@', error='Cet email existe déjà dans notre système.'),
                     C('TextField', label='Mot de passe', placeholder='Votre mot de passe sécurisé', type='password', revealable=YES))))
CHECK = C('Checkbox', label='J’accepte les termes d’utilisation de Y')
R += row('Case conditions', 'YDS.Checkbox', 'Inscription, au-dessus du bouton principal', main_d(CHECK), main_d(CHECK), main_m(CHECK))
MAIN_BTNS = (lambda: vcol(C('Button', 'Créer mon compte', variant='primary', size='lg', block=YES),
                          '<div style="display: flex; justify-content: center;">' + C('Button', 'Connexion', variant='primary', size='lg', icon='log-in') + '</div>', gap=12))
R += row('Bouton principal', 'YDS.Button primary lg', 'Pleine largeur du formulaire (Inscription, Code) · centré avec icône (Connexion)',
         main_d(MAIN_BTNS()), main_d(MAIN_BTNS()), main_m(MAIN_BTNS()))
DIV = '<div role="separator" style="width: {w}px; height: 4px; margin: 0 auto; border-radius: 9999px; background: #6366f1;"></div>'
R += row('Séparateur', 'barre indigo 4&nbsp;px', 'Entre le bouton principal et la suite · 360 (D/T), 296 (M)',
         main_d(DIV.format(w=360)), main_d(DIV.format(w=360)), main_m(DIV.format(w=296)))
JOIN_BTN = C('Button', 'Rejoindre la communauté', variant='secondary', size='lg', icon_right='y')
R += row('Rejoindre la communauté', 'YDS.Button secondary lg · icon-right="y"', 'Connexion → Inscription',
         main_d(f'<div style="display: flex; justify-content: center;">{JOIN_BTN}</div>'), main_d(f'<div style="display: flex; justify-content: center;">{JOIN_BTN}</div>'),
         main_m(C('Button', 'Rejoindre la communauté', variant='secondary', size='lg', icon_right='y', block=YES)))
LEGAL = ('<p style="margin: 0; text-align: center; font-size: 11px; line-height: 18px; color: #6b7280;">En vous connectant, vous acceptez nos '
         '<a href="#" class="lib-legal">Conditions d’utilisation</a>, notre <a href="#" class="lib-legal">Politique de confidentialité</a> et notre <a href="#" class="lib-legal">Utilisation des cookies</a>.</p>')
R += row('Phrase légale', 'p 11/18 muted + liens', 'Sous les boutons · 11&nbsp;px minimum sur tous les supports', main_d(LEGAL), main_d(LEGAL), main_m(LEGAL))

# ================================================================ page
CSS = r'''body{margin:0}
a{color:#6366f1}a:hover{color:#4338ca}
code{font-family:'JetBrains Mono',monospace;font-size:11px;color:#4338ca;white-space:nowrap}
.lib-v .y-save{margin-left:0}
.lib-section{display:flex;align-items:baseline;gap:12px;margin-top:56px;padding-bottom:12px;border-bottom:2px solid #1e293b}
.lib-section h2{margin:0;font-size:24px;line-height:32px;font-weight:800;color:#1e293b}
.lib-num{font-family:'JetBrains Mono',monospace;font-size:13px;line-height:16px;color:#6366f1}
.lib-desc{font-size:14px;line-height:20px;color:#6b7280}
.lib-cols,.lib-row{display:grid;grid-template-columns:224px 600px 600px 360px;column-gap:32px}
.lib-cols{padding:10px 0;border-bottom:1px solid #e2e8f0;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:16px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}
.lib-row{padding:24px 0;border-bottom:1px solid #e2e8f0;align-items:start}
.lib-label{padding-top:2px}
.lib-name{font-size:15px;line-height:20px;font-weight:700;color:#1e293b}
.lib-comp{margin-top:4px;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:16px;color:#6366f1}
.lib-used{margin-top:6px;font-size:12px;line-height:17px;color:#6b7280}
.lib-cell{min-width:0}
.lib-span{grid-column:2 / -1}
.lib-cap{font-family:'JetBrains Mono',monospace;font-size:11px;line-height:16px;color:#6b7280;white-space:nowrap}
.lib-v{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0}
.lib-hrow{display:flex;flex-wrap:wrap}
.lib-vcol{display:flex;flex-direction:column}
.lib-stage{box-sizing:border-box;box-shadow:0 0 0 1px #e2e8f0;position:relative}
.lib-na{box-sizing:border-box;min-height:56px;padding:12px 16px;border:1px dashed #d1d5db;border-radius:8px;background:#f8fafc;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;line-height:16px;color:#6b7280}
.lib-icons{display:grid;grid-template-columns:repeat(10,1fr);gap:8px}
.lib-icon{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 4px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;color:#1e293b}
.lib-icon span{font-family:'JetBrains Mono',monospace;font-size:11px;line-height:14px;color:#6b7280;text-align:center}
.lib-btngrid{display:grid;grid-template-columns:110px repeat(6,max-content);column-gap:24px;row-gap:14px;align-items:center}
.lib-fields{display:grid;grid-template-columns:repeat(3,1fr);column-gap:32px;row-gap:24px;align-items:start}
.lib-fields .lib-v{align-items:stretch}
.lib-legal{font-weight:700;color:#1e293b;text-decoration:underline}
.lib-legal:hover{color:#4338ca}
.bp-d .y-qpost{padding:20px 20px 22px}
.bp-d .y-qpost.is-compact{padding:18px 20px 16px}
.bp-d .y-qpost-who strong{font-size:15px}
.bp-d .y-qpost-who span{font-size:11px}
.bp-d .y-qpost-tags{font-size:11px}
.bp-d .y-qpost-body{font-size:16px;line-height:22px;margin:17px 0 18px}
.bp-d .y-qpost.is-compact .y-qpost-body{font-size:16px;line-height:22px;margin:15px 0 16px}
.bp-d .y-qpost-actions{gap:12px}
.bp-d .y-react{height:32px;padding:0 14px;font-size:14px}
.bp-d .y-qpost-head{gap:12px}
.bp-d .y-qpost-head .y-avatar{width:40px!important;height:40px!important;font-size:16px!important}
.bp-d .y-follow{height:26px!important;font-size:11px!important}
.bp-d .y-follow-md{height:32px!important;font-size:13px!important}
.bp-d .y-react{white-space:nowrap}
.bp-d .y-save{width:32px;height:32px}
.bp-m .y-qpost{padding:14px 14px 16px}
.bp-m .y-qpost.is-compact{padding:12px 12px 12px}
.bp-m .y-qpost-who strong{font-size:14px}
.bp-m .y-qpost-who span{font-size:11px}
.bp-m .y-qpost-tags{font-size:11px}
.bp-m .y-qpost-body{font-size:14px;line-height:20px;margin:12px 0}
.bp-m .y-qpost.is-compact .y-qpost-body{font-size:14px;line-height:20px;margin:10px 0}
.bp-m .y-qpost-actions{gap:8px;flex-wrap:nowrap}
.bp-m .y-react{height:30px;padding:0 10px;font-size:12px;white-space:nowrap}
.bp-m .y-qpost-head{gap:12px;flex-wrap:wrap}
.bp-m .y-qpost-head .y-avatar{width:36px!important;height:36px!important;font-size:14px!important}
.bp-m .y-qpost-tags{width:100%;margin-left:48px;justify-content:flex-start}
.bp-m .y-follow{height:26px!important;font-size:11px!important}
.bp-m .y-follow-md{height:32px!important;font-size:13px!important}
.bp-m .y-save{width:30px;height:30px}
.y-side-card{background:#ffffff;border-radius:16px;box-shadow:0px 4px 8px -1px rgba(0,0,0,0.1);padding:16px 20px}
.y-side-card h2{margin:0 0 8px;font-size:20px;line-height:26px;font-weight:700;color:#1e293b}
.y-trend{display:block;padding:8px 0;border-bottom:1px solid #e2e8f0;text-decoration:none}
.y-trend:last-child{border-bottom:0;padding-bottom:0}
.y-trend strong{display:block;font-size:15px;line-height:20px;font-weight:700;color:#6366f1}
.y-trend span{display:block;font-size:12px;line-height:16px;color:#6b7280}
.y-user-row{display:flex;align-items:center;gap:12px;padding:8px 0}
.y-user-row:last-child{padding-bottom:0}
.y-user-row-text{flex:1;min-width:0;line-height:18px}
.y-user-row-text strong{display:block;font-size:15px;font-weight:700;color:#1e293b}
.y-user-row-text span{display:block;font-size:12px;color:#6b7280}
.y-account{margin-top:auto;display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:12px;border:0;border-radius:9999px;background:transparent;font-family:inherit;text-align:left;cursor:pointer}
.y-account:hover{background:#f3f4f6}
.y-xsec-head{display:flex;align-items:center;gap:8px;color:#6366f1}
.y-xsec-head h2{margin:0;font-size:18px;line-height:24px;font-weight:700;color:#1e293b}
.y-xtrends{background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:16px 20px}
.y-xtrends ol{list-style:none;margin:4px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,auto);grid-auto-flow:column;column-gap:32px}
.y-xtrends li{border-bottom:1px solid #e2e8f0}
.y-xtrends li:nth-child(3n){border-bottom:0}
.y-xtrend{display:flex;align-items:center;gap:12px;height:52px;box-sizing:border-box;padding:8px 0;text-decoration:none}
.y-xtrend-rank{flex:none;width:20px;font-size:13px;line-height:20px;font-weight:700;color:#6b7280}
.y-xtrend-text{flex:1;min-width:0}
.y-xtrend-text>strong{display:block;font-size:15px;line-height:20px;font-weight:700;color:#6366f1}
.y-xtrend-text>span{display:block;font-size:12px;line-height:16px;color:#6b7280}
.y-xtrend>svg,.y-xtrend>.y-icon{flex:none;color:#6b7280}
.bp-m .y-xsec-head h2{font-size:15px;line-height:20px}
.bp-m .y-xtrends{padding:12px 16px}
.bp-m .y-xtrends ol{display:flex;flex-direction:column}
.bp-m .y-xtrends li:nth-child(3n){border-bottom:1px solid #e2e8f0}
.bp-m .y-xtrends li:last-child{border-bottom:0}
.y-prof-cover{height:150px;flex:none;background:#e0e7ff}
.y-prof{position:relative;flex:none;padding:12px 16px 16px;border-bottom:1px solid #d1d5db}
.y-prof-avatar{position:absolute;top:-60px;left:16px;width:120px;height:120px;box-sizing:border-box;border:4px solid #ffffff;border-radius:9999px;background:#ffffff;display:flex}
.y-prof-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;height:40px}
.y-prof-msg{width:40px;padding:0}
.y-prof-name{margin:20px 0 0;font-size:20px;line-height:26px;font-weight:800;color:#1e293b}
.y-prof-handle{margin:0;font-size:15px;line-height:20px;color:#6b7280}
.y-prof-bio{margin:12px 0 0;font-size:15px;line-height:20px;color:#1e293b}
.y-prof-meta{display:flex;align-items:center;gap:6px;margin:12px 0 0;font-size:15px;line-height:20px;color:#6b7280}
.y-prof-counts{display:flex;flex-wrap:wrap;gap:20px;margin-top:12px;font-size:15px;line-height:20px}
.y-prof-counts a{color:#6b7280;text-decoration:none}
.y-prof-counts a:hover{text-decoration:underline}
.y-prof-counts strong{font-weight:700;color:#1e293b}
.bp-m .y-prof-cover{height:90px}
.bp-m .y-prof-avatar{top:-40px;width:80px;height:80px}
.bp-m .y-prof-name{margin-top:12px}
.y-set{display:flex;flex-direction:column;gap:16px;padding:16px}
.y-set-section{display:flex;flex-direction:column;gap:8px}
.y-set-section + .y-set-section{margin-top:8px}
.y-set-section h2{margin:0;padding:0;font-size:15px;line-height:20px;font-weight:700;color:#1e293b}
.y-set-card{background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden}
.y-set-row{display:flex;align-items:center;gap:12px;min-height:62px;box-sizing:border-box;padding:12px 16px;text-decoration:none;color:#1e293b}
.y-set-row + .y-set-row{border-top:1px solid #e2e8f0}
.y-set-row:hover{color:#1e293b;background:#f8fafc}
.y-set-ico{flex:none;width:36px;height:36px;border-radius:9999px;background:#e0e7ff;display:flex;align-items:center;justify-content:center}
.y-set-text{flex:1;min-width:0}
.y-set-text strong{display:block;font-size:15px;line-height:20px;font-weight:600;color:#1e293b}
.y-set-text span{display:block;font-size:13px;line-height:18px;color:#6b7280}
.y-set-chev{flex:none;display:flex}
.y-dm-search{padding:12px 16px}
.y-dm-rows{margin:0;padding:0;list-style:none}
.y-dm-row{display:flex;gap:12px;padding:12px 16px;background:#ffffff;color:#1e293b;text-decoration:none}
.y-dm-row:hover{background:#f8fafc}
.y-dm-row[aria-current]{background:#f8fafc;box-shadow:inset -2px 0 0 #6366f1}
.y-dm-av{flex:none;width:40px;height:40px;display:flex}
.y-dm-text{flex:1;min-width:0}
.y-dm-l1{display:flex;align-items:baseline;gap:4px;white-space:nowrap;line-height:20px}
.y-dm-l1 strong{flex:none;font-size:15px;font-weight:700;color:#1e293b}
.y-dm-handle{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:13px;color:#6b7280}
.y-dm-when{flex:none;font-size:13px;color:#6b7280}
.y-dm-l2{display:flex;align-items:center;gap:8px}
.y-dm-prev{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;font-weight:400;color:#6b7280}
.y-dm-row.is-unread .y-dm-prev{font-weight:600;color:#1e293b}
.y-dm-dot{flex:none;width:8px;height:8px;border-radius:9999px;background:#6366f1}
.y-dm-head{flex:none;height:53px;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid #d1d5db;background:#ffffff}
.y-dm-head-text{flex:1;min-width:0}
.y-dm-head-text h2{margin:0;font-size:15px;line-height:20px;font-weight:700;color:#1e293b}
.y-dm-head-text p{margin:0;font-size:13px;line-height:16px;color:#6b7280}
.y-dm-thread{display:flex;flex-direction:column;justify-content:flex-start;gap:4px;padding:16px}
.y-dm-contact{display:flex;flex-direction:column;align-items:center;text-align:center;padding:8px 0 20px;margin-bottom:12px;border-bottom:1px solid #e2e8f0}
.y-dm-contact-av{width:64px;height:64px;display:flex}
.y-dm-contact strong{margin-top:8px;font-size:16px;line-height:20px;font-weight:700;color:#1e293b}
.y-dm-contact-handle{font-size:13px;line-height:16px;color:#6b7280}
.y-dm-contact p{margin:8px 0 0;max-width:360px;font-size:14px;line-height:20px;color:#1e293b}
.y-dm-contact-meta{margin-top:4px;font-size:13px;line-height:16px;color:#6b7280}
.y-dm-contact-meta b{font-weight:700;color:#1e293b}
.y-dm-day{display:flex;align-items:center;gap:12px;margin:0 0 8px;font-size:12px;line-height:16px;font-weight:600;color:#6b7280}
.y-dm-day::before,.y-dm-day::after{content:"";flex:1;height:1px;background:#e2e8f0}
.y-dm-bubble{max-width:80%;box-sizing:border-box;padding:10px 14px;border:1px solid transparent;font-size:15px;line-height:20px}
.y-dm-in{align-self:flex-start;background:#f8fafc;border-color:#e2e8f0;color:#1e293b;border-radius:18px 18px 18px 4px}
.y-dm-out{align-self:flex-end;background:#6366f1;border-color:#6366f1;color:#ffffff;font-weight:500;border-radius:18px 18px 4px 18px}
.y-dm-bubble a{color:#4f46e5;font-weight:600;text-decoration:none}
.y-dm-time{margin:0 4px 8px;font-size:12px;line-height:16px;color:#6b7280}
.y-dm-time.is-in{align-self:flex-start}
.y-dm-time.is-out{align-self:flex-end}
.y-dm-compose{flex:none;display:flex;align-items:center;gap:8px;margin:0;padding:12px 16px;border-top:1px solid #d1d5db;background:#ffffff}
.y-dm-input{flex:1;min-width:0;display:block;height:44px;box-sizing:border-box;padding:11px 16px;border:1px solid #d1d5db;border-radius:9999px;background:#f8fafc;font-family:inherit;font-size:15px;line-height:20px;color:#1e293b;resize:none;outline:none;overflow:hidden}
.y-dm-input::placeholder{color:#6b7280}
.y-dm-input:focus{border-color:#6366f1;background:#ffffff}
.y-dm-send{flex:none;width:44px;height:44px;padding:0;border:0;border-radius:9999px;background:#6366f1;color:#ffffff;display:flex;align-items:center;justify-content:center;cursor:pointer}
.y-dm-send:hover{background:#4f46e5}
.bp-m .y-dm-search{display:flex;align-items:center;gap:8px;padding:12px 16px}
.bp-m .y-dm-search > :first-child{flex:1;min-width:0}
.bp-m .y-dm-thread{gap:4px;padding:12px 16px}
.bp-m .y-dm-contact{padding:4px 0 16px;margin-bottom:12px}
.bp-m .y-dm-contact-av{width:56px;height:56px}
.bp-m .y-dm-contact p{max-width:296px}
.bp-m .y-dm-bubble{max-width:82%;padding:8px 12px;font-size:14px;line-height:20px}
.bp-m .y-dm-out{font-weight:600}
.bp-m .y-dm-time{margin:0 4px 6px}
.bp-m .y-dm-compose{padding:10px 16px 12px}
.bp-m .y-dm-input{height:40px;padding:9px 16px;font-size:14px}
.bp-m .y-dm-send{width:40px;height:40px}'''

SCRIPT = '''class Component extends DCLogic {
renderVals() {
return {
yes: true,
no: false,
a24: 24,
a28: 28,
a32: 32,
a40: 40,
a56: 56,
a64: 64,
a72: 72,
a112: 112,
postA: { tags: ['#online_life', '#irl_vs_online'], body: '«\\u00a0Pourquoi les gens préfèrent-ils les réponses rapides plutôt que les questions profondes\\u00a0?\\u00a0»', reactions: { like: 124, dislike: 12, y: 49 } },
postB: { tags: ['#online_life', '#irl_vs_online'], body: '«\\u00a0Qu’est-ce qui fait qu’une conversation en ligne peut être plus sincère qu’une rencontre en personne\\u00a0?\\u00a0»', reactions: { like: 2000, dislike: 450, y: 89 } },
replyA: { body: 'Peut-être que les gens ont envie de se protéger derrière un écran\\u00a0? La sécurité d’abord\\u00a0!', reactions: { like: 124, dislike: 12 } },
nReply: { body: 'Parce qu’en face, on voit le visage. En ligne, on remplit le silence avec nos propres doutes.', reactions: { like: 18, dislike: 2 } },
menuOther: [{ icon: 'link', label: 'Copier le lien' }, { icon: 'user-plus', label: 'Suivre @AliceY' }, { icon: 'flag', label: 'Signaler la question', tone: 'danger' }],
menuMine: [{ icon: 'link', label: 'Copier le lien' }, { icon: 'trash-2', label: 'Supprimer la question', tone: 'danger' }],
sortOptions: ['Date d’enregistrement', 'Date de la question'],
sortValue: 'Date d’enregistrement',
pwErrors: ['Les mots de passe ne correspondent pas.', '8\\u00a0caractères minimum.']
};
}
}'''


def colh(t, s):
    return (f'<div style="padding: 0 0 12px; border-bottom: 1px solid #d1d5db;"><div style="font-size: 16px; line-height: 22px; font-weight: 800; color: #1e293b;">{t}</div>'
            f'<div style="margin-top: 2px; font-family: \'JetBrains Mono\', monospace; font-size: 11px; line-height: 16px; color: #6b7280;">{s}</div></div>')


HEAD_COLS = ('<div style="display: grid; grid-template-columns: 224px 600px 600px 360px; column-gap: 32px; margin-top: 32px;">'
             + colh('Élément', 'nom · composant · usage') + colh('Desktop', '1440 × 1073 · nav 275 / main 600 / barre 350')
             + colh('Tablet', '768 × 1024 · rail 88 / main 600') + colh('Mobile', '360 × 667 · barre du haut 53 + menu') + '</div>')

html = f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>App — Components</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/yds/components/bundle.css">
<script src="ds/yds/components/bundle.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">
<style>
{CSS}
</style>
</helmet>
<div style="width: 1960px; height: {H}px; box-sizing: border-box; background: #ffffff; color: #1e293b; font-family: Inter, system-ui, sans-serif; padding: 40px; overflow: hidden;">
<header style="display: flex; align-items: flex-end; justify-content: space-between;">
<div><div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 16px; color: #6366f1;">03.Z</div><h1 style="margin: 4px 0 0; font-size: 36px; line-height: 44px; font-weight: 800;">Composants de l’app</h1><p style="margin: 6px 0 0; font-size: 15px; line-height: 22px; color: #6b7280;">Chaque élément (ligne) tel qu’il est utilisé sur chaque support (colonne), avec le composant du design system. Case en pointillés = élément absent sur ce support.</p></div>
{C("YLogo", size=40)}
</header>
{HEAD_COLS}
<div id="lib">
{{R_PLACEHOLDER}}</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1960,"height":{H}}}}}'>
{SCRIPT}
</script>
</body>
</html>
'''
def typo(markup):
    """French typography in text nodes only: nbsp before ? ! : ; and inside « », typographic apostrophe."""
    def fix(m):
        t = m.group(0)
        t = re.sub(r"(\w)'(\w)", "\\1’\\2", t)
        t = re.sub(r"« ", "«&nbsp;", t)
        t = re.sub(r" ([?!:;»])", "&nbsp;\\1", t)
        return t
    return re.sub(r">[^<>]+<", fix, markup)


R = typo(R)
html = html.replace('{R_PLACEHOLDER}', R)
open(OUT, 'w', encoding='utf-8').write(html)
print('written', OUT, H, f'{len(re.findall("lib-row", R))} rows')
