"""Lay out the Y canvas: one row per view, columns by screen size.
usage: python3 canvas_layout.py <in canvas.json> <out canvas.json> [--add File.dc.html ...]
Boards listed in SECTIONS are positioned; --add creates entries for new board files (size from the column).
Unknown boards/keys are kept untouched."""
import json, sys

D, T, M, M2, M3 = 0, 1520, 2368, 2808, 3248
SIZE = {D: (1440, 1073), T: (768, 1024), M: (360, 667), M2: (360, 667), M3: (360, 667)}
NOTE_GAP, ROW_GAP = 300, 120

# (note id, note text, rows); row = [(file, column, title)]
SECTIONS = [
    ('n_logos', 'Y — Logos', [[('Logos.dc.html', D, '00 · Logos')]]),
    ('n_landing', '01 · Landing page', [[('Main.dc.html', D, '01 · Landing — Desktop'), ('Landing-Tablet.dc.html', T, '01 · Landing — Tablet'), ('Landing-Mobile.dc.html', M, '01 · Landing — Mobile')]]),
    ('n_auth', '02 · Authentification', [
        [('Auth-Login-Desktop.dc.html', D, '02 · Connexion — Desktop'), ('Auth-Login-Tablet.dc.html', T, '02 · Connexion — Tablet'), ('Auth-Login-Mobile.dc.html', M, '02 · Connexion — Mobile'), ('Auth-Welcome-Mobile.dc.html', M2, '02 · Bienvenue — Mobile')],
        [('Auth-Signup-Desktop.dc.html', D, '02 · Inscription — Desktop')],
        [('Auth-Signup-Errors-Desktop.dc.html', D, '02 · Inscription (erreurs) — Desktop'), ('Auth-Signup-Errors-Tablet.dc.html', T, '02 · Inscription (erreurs) — Tablet'), ('Auth-Signup-Errors-Mobile.dc.html', M, '02 · Inscription (erreurs) — Mobile')],
        [('Auth-Code-Desktop.dc.html', D, '02 · Code e-mail — Desktop')],
        [('Auth-Code-Error-Desktop.dc.html', D, '02 · Code e-mail (erreur) — Desktop'), ('Auth-Code-Error-Tablet.dc.html', T, '02 · Code e-mail (erreur) — Tablet'), ('Auth-Code-Error-Mobile.dc.html', M, '02 · Code e-mail (erreur) — Mobile')],
    ]),
    ('n_home', '03 · Accueil', [[('App-Desktop.dc.html', D, '03 · Accueil — Desktop'), ('App-Tablet.dc.html', T, '03 · Accueil — Tablet'), ('App-Mobile.dc.html', M, '03 · Accueil — Mobile'), ('App-Mobile-Menu.dc.html', M2, '03 · Menu ouvert — Mobile')]]),
    ('n_profile', '04 · Profil', [[('Profile-Desktop.dc.html', D, '04 · Profil — Desktop'), ('Profile-Tablet.dc.html', T, '04 · Profil — Tablet'), ('Profile-Mobile.dc.html', M, '04 · Profil — Mobile')]]),
    ('n_explore', '05 · Explorer', [[('Explore-Desktop.dc.html', D, '05 · Explorer — Desktop'), ('Explore-Tablet.dc.html', T, '05 · Explorer — Tablet'), ('Explore-Mobile.dc.html', M, '05 · Explorer — Mobile')]]),
    ('n_notifs', '06 · Notifications', [[('Notifications-Desktop.dc.html', D, '06 · Notifications — Desktop'), ('Notifications-Tablet.dc.html', T, '06 · Notifications — Tablet'), ('Notifications-Mobile.dc.html', M, '06 · Notifications — Mobile')]]),
    ('n_messages', '07 · Messages', [[('Messages-Desktop.dc.html', D, '07 · Messages — Desktop'), ('Messages-Tablet.dc.html', T, '07 · Messages — Tablet'), ('Messages-Mobile.dc.html', M, '07 · Messages — Mobile'), ('Messages-Mobile-Conversation.dc.html', M2, '07 · Conversation — Mobile')]]),
    ('n_bookmarks', '08 · Signets', [[('Bookmarks-Desktop.dc.html', D, '08 · Signets — Desktop'), ('Bookmarks-Tablet.dc.html', T, '08 · Signets — Tablet'), ('Bookmarks-Mobile.dc.html', M, '08 · Signets — Mobile')]]),
    ('n_settings', '09 · Plus', [[('Settings-Desktop.dc.html', D, '09 · Plus — Desktop'), ('Settings-Tablet.dc.html', T, '09 · Plus — Tablet'), ('Settings-Mobile.dc.html', M, '09 · Plus — Mobile')]]),
]
COMPONENTS = ('App-Components.dc.html', -2120, "Z · Composants de l'app")
OLD_NOTES = ['n_question', 'n_app', 'n_app_tm', 'n_auth_d', 'n_auth_m', 'n_auth_t']
MAXW = M3 + 360

src, out = sys.argv[1], sys.argv[2]
add = sys.argv[sys.argv.index('--add') + 1:] if '--add' in sys.argv else []
d = json.load(open(src))
B, notes = d['boards'], d.setdefault('notes', {})
for k in OLD_NOTES:
    notes.pop(k, None)

def h_of(f, col):
    return B[f]['h'] if f in B else SIZE[col][1]

y = 0
order = []
for nid, text, rows in SECTIONS:
    notes[nid] = {'kind': 'title1', 'maxW': MAXW, 'text': text, 'w': 240, 'x': 0, 'y': y}
    ry = y + NOTE_GAP
    for row in rows:
        for f, col, title in row:
            if f not in B and f in add:
                w, hh = SIZE[col]
                B[f] = {'w': w, 'h': hh}
            if f in B:
                B[f].update({'x': col, 'y': ry, 'title': title})
                order.append(f)
        ry += max(h_of(f, col) for f, col, _ in row) + ROW_GAP
    y = ry
for col, label in [(D, 'Desktop'), (T, 'Tablet'), (M, 'Mobile')]:
    notes['n_col_' + label.lower()] = {'kind': 'title1', 'maxW': 1440 if col == D else (800 if col == T else MAXW - M), 'text': label, 'w': 240, 'x': col, 'y': -420, 'color': 'purple'}
f, x, title = COMPONENTS
if f in B:
    B[f].update({'x': x, 'y': 300, 'title': title})
    notes['n_components'] = {'kind': 'title1', 'maxW': 1960, 'text': 'Composants', 'w': 240, 'x': x, 'y': 0}
    order.insert(0, f)
d['order'] = order + [k for k in d.get('order', []) if k not in order and k in B]
json.dump(d, open(out, 'w'), indent=2, ensure_ascii=False)
print('boards', len(B), 'end y', y)
