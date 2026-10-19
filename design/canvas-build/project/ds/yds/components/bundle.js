/* @ds-bundle: {"format":4,"namespace":"YDS","components":[{"name":"Icon"},{"name":"YLogo"},{"name":"Button"},{"name":"IconButton"},{"name":"Avatar"},{"name":"NavItem"},{"name":"Tab"},{"name":"TextField"},{"name":"Checkbox"},{"name":"FollowButton"},{"name":"ReactionPill"},{"name":"SaveButton"},{"name":"QuestionPost"},{"name":"Card"},{"name":"Menu"},{"name":"ConversationBox"},{"name":"SearchField"},{"name":"PageHeader"},{"name":"MobileTopBar"},{"name":"Select"},{"name":"Dialog"},{"name":"Toast"},{"name":"EmptyState"},{"name":"RailItem"},{"name":"RailPoster"},{"name":"Footer"},{"name":"YProgress"},{"name":"CharCounter"},{"name":"Skeleton"},{"name":"ErrorState"},{"name":"LoadMore"}]} */
(function () {
  var React = window.React, h = React.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  /* Lucide icons (24 grid, 2px stroke, round caps) — same set as the Figma icons row. */
  var ICONS = {
    'home': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'home-filled': '<path fill="currentColor" d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2h-4v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8H5a2 2 0 0 1-2-2z"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'bell': '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    'bookmark': '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    'bookmark-filled': '<path fill="currentColor" d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'circle-ellipsis': '<circle cx="12" cy="12" r="10"/><path d="M17 12h.01"/><path d="M12 12h.01"/><path d="M7 12h.01"/>',
    'ellipsis': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    'image': '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    'gif': '<rect width="20" height="16" x="2" y="4" rx="3"/><path d="M10 9.5H8a1.5 1.5 0 0 0-1.5 1.5v2A1.5 1.5 0 0 0 8 14.5h2v-2.5H9"/><path d="M13 9.5v5"/><path d="M16 14.5v-5h2.5"/><path d="M16 12h2"/>',
    'poll': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16h8"/><path d="M7 11h12"/><path d="M7 6h3"/>',
    'smile': '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
    'calendar-clock': '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
    'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    'thumbs-up': '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
    'thumbs-down': '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
    'triangle-alert': '<path fill="currentColor" stroke="none" d="M10.27 3.98a2 2 0 0 1 3.46 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.73-3z"/><path stroke="#fff" d="M12 9v4"/><path stroke="#fff" d="M12 17h.01"/>',
    'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
    'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'calendar': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'repeat': '<path d="m2 9 3-3 3 3"/><path d="M13 18H7a2 2 0 0 1-2-2V6"/><path d="m22 15-3 3-3-3"/><path d="M11 6h6a2 2 0 0 1 2 2v10"/>',
    'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    'chart': '<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',
    'share': '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
    'badge-check': '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'menu': '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
    'settings': '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'send': '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    'mail-plus': '<path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M19 16v6"/><path d="M16 19h6"/>',
    'hash': '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'at-sign': '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    'user-minus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" x2="16" y1="11" y2="11"/>',
    'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'
  };

  /* The Y mark, copied from the Figma "00 - Logos" frame (viewBox of the source). */
  var Y_PATHS = [
    'M55.0012 55.5512C55.1264 55.8918 59.7573 63.9523 65.3477 73.4319C78.6563 96.0807 83.2037 103.857 101.101 134.907C103.771 139.562 110.28 150.801 115.536 159.883C120.793 168.909 128.553 182.362 132.808 189.684C137.022 197.007 142.612 206.6 145.157 210.971C147.702 215.342 151.54 221.983 153.71 225.729C155.879 229.419 158.675 234.187 159.843 236.231L162.054 239.92V287.489V335L193.052 334.886L224.008 334.716L224.091 288.113L224.174 241.453L221.755 236.458C215.872 224.254 206.318 204.273 200.645 192.239C191.216 172.315 191.299 172.428 171.941 132.864C153.168 94.321 143.28 73.9995 137.606 62.1358L134.31 55.2106L94.5515 55.0403C64.3464 54.9268 54.8761 55.0403 55.0012 55.5512Z',
    'M257.938 56.2892C257.226 58.1487 222.567 130.435 210.261 155.769C204.652 167.275 200.005 177.095 199.921 177.676C199.754 178.548 200.675 180.698 207.958 196.212C209.382 199.234 213.4 207.718 216.832 215.097C228.176 239.386 229.223 241.478 229.599 241.188C229.767 241.013 233.576 234.447 238.055 226.545C242.534 218.642 249.566 206.323 253.626 199.118C257.729 191.912 269.617 170.877 280.123 152.341C290.588 133.805 301.555 114.455 304.443 109.341C307.373 104.228 315.41 90.0498 322.359 77.8472C329.307 65.6446 335 55.5338 335 55.3595C335 55.1852 317.754 55.0109 296.699 55.0109H258.44L257.938 56.2892Z'
  ];

  function Icon(p) {
    var size = Number(p.size) || 24;
    return h('svg', {
      className: cx('y-icon', p.className), width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: p.strokeWidth || 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      style: p.color ? { color: p.color } : undefined, 'aria-hidden': p.label ? undefined : true, 'aria-label': p.label,
      dangerouslySetInnerHTML: { __html: ICONS[p.name] || '' }
    });
  }
  Icon.names = Object.keys(ICONS);

  function YLogo(p) {
    var size = Number(p.size) || 40, tone = p.tone || 'primary';
    var mark = h('svg', { width: size, height: size, viewBox: '55 55 280 280', 'aria-label': p.tile ? undefined : 'Y', role: 'img', className: 'y-logo-mark' },
      Y_PATHS.map(function (d, i) { return h('path', { key: i, d: d, fill: 'currentColor' }); }));
    if (p.tile) {
      return h('span', { className: cx('y-logo-tile', 'y-logo-tile-' + tone, p.className), style: { width: size, height: size }, role: 'img', 'aria-label': 'Y' },
        h('svg', { width: size * 280 / 300, height: size * 280 / 300, viewBox: '55 55 280 280' },
          Y_PATHS.map(function (d, i) { return h('path', { key: i, d: d, fill: 'currentColor' }); })));
    }
    return h('span', { className: cx('y-logo', 'y-logo-' + tone, p.className) }, mark);
  }

  function Button(p) {
    var variant = p.variant || 'primary', size = p.size || 'md', shape = p.shape || 'rounded';
    var rest = {}; for (var k in p) if (['variant', 'size', 'shape', 'icon', 'iconRight', 'block', 'className', 'children'].indexOf(k) < 0) rest[k] = p[k];
    return h('button', Object.assign(rest, {
      className: cx('y-btn', 'y-btn-' + variant, 'y-btn-' + size, 'y-btn-' + shape, p.block && 'y-btn-block', p.className),
      type: p.type || 'button'
    }),
      p.icon ? h(Icon, { name: p.icon, size: size === 'lg' ? 22 : 18 }) : null,
      p.children,
      p.iconRight === 'y' ? h(YLogo, { size: size === 'lg' ? 22 : 18 }) : (p.iconRight ? h(Icon, { name: p.iconRight, size: 18 }) : null));
  }

  function IconButton(p) {
    var tone = p.tone || 'primary';
    return h('button', {
      type: 'button', className: cx('y-iconbtn', 'y-iconbtn-' + tone, p.hover && 'is-hover', p.className),
      'aria-label': p.label || p.icon, onClick: p.onClick
    }, h(Icon, { name: p.icon, size: Number(p.iconSize) || 20 }));
  }

  function Avatar(p) {
    var size = Number(p.size) || 40;
    return h('span', { className: cx('y-avatar', p.className), style: { width: size, height: size, fontSize: Math.round(size * 0.4) } },
      p.src ? h('img', { src: p.src, alt: p.name || '' }) : (p.initial || (p.name || '?').charAt(0).toUpperCase()));
  }

  var useId = React.useId || function () { return 'y' + Math.random().toString(36).slice(2, 8); };
  function fmt(n) { return typeof n === 'number' ? n.toLocaleString('fr-FR').replace(/\u202f/g, '\u00a0') : n; }
  function sr(text) { return h('span', { className: 'y-sr' }, text); }

  function NavItem(p) {
    var icon = p.active && p.icon === 'home' ? 'home-filled' : p.icon;
    return h('a', { href: p.href || '#', className: cx('y-navitem', p.active && 'is-active', p.hover && 'is-hover', p.className), 'aria-current': p.active ? 'page' : undefined },
      h('span', { className: 'y-navitem-icon' }, h(Icon, { name: icon, size: 26, strokeWidth: p.active && p.icon !== 'home' ? 2.5 : 2 }),
        p.badge ? h('span', { className: 'y-navitem-badge', 'aria-hidden': true }, p.badge) : null),
      h('span', { className: 'y-navitem-label' }, p.label),
      p.badge ? sr(', ' + p.badge + ' non lu' + (Number(p.badge) > 1 ? 's' : '')) : null);
  }

  function Tab(p) {
    return h('button', { type: 'button', role: 'tab', 'aria-selected': !!p.active, className: cx('y-tab', p.active && 'is-active', p.hover && 'is-hover', p.className), onClick: p.onClick },
      h('span', { className: 'y-tab-label' }, p.label));
  }

  /* Text field. type=password + revealable adds an eye toggle; errors set aria-invalid/aria-describedby. */
  function TextField(p) {
    var gid = useId(), id = p.id || gid, errId = id + '-err';
    var errs = p.errors || (p.error ? [p.error] : []);
    var st = React.useState(false), shown = st[0];
    var isPwd = p.type === 'password';
    var type = isPwd && shown ? 'text' : (p.type || 'text');
    var common = { id: id, placeholder: p.placeholder, defaultValue: p.value, 'aria-invalid': errs.length ? true : undefined, 'aria-describedby': errs.length ? errId : undefined, autoComplete: p.autoComplete };
    return h('div', { className: cx('y-field', errs.length && 'has-error', p.align === 'center' && 'y-field-center', p.className) },
      p.label ? h('label', { className: 'y-field-label', htmlFor: id }, p.label) : null,
      p.hint ? h('span', { className: 'y-field-hint' }, p.hint) : null,
      h('span', { className: cx('y-field-control', isPwd && p.revealable && 'has-reveal') },
        p.multiline
          ? h('textarea', Object.assign(common, { rows: p.rows || 4 }))
          : h('input', Object.assign(common, { type: type, className: p.muted ? 'is-muted' : undefined })),
        isPwd && p.revealable
          ? h('button', { type: 'button', className: 'y-field-reveal', 'aria-label': shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe', 'aria-pressed': shown, onClick: function () { st[1](!shown); } }, h(Icon, { name: shown ? 'eye-off' : 'eye', size: 18 }))
          : (p.icon ? h(Icon, { name: p.icon, size: 18, className: 'y-field-icon' }) : null)),
      errs.length > 1
        ? h('ul', { className: 'y-field-errors', id: errId }, errs.map(function (e, i) { return h('li', { key: i }, e); }))
        : (errs.length ? h('span', { className: 'y-field-error', id: errId }, errs[0]) : null));
  }

  function Checkbox(p) {
    return h('label', { className: cx('y-check', p.className) },
      h('input', { type: 'checkbox', defaultChecked: p.checked }), h('span', null, p.label));
  }

  /* Follow toggle. label overrides the text (e.g. "Suivre en retour"); followedLabel defaults to "Suivi !". */
  function FollowButton(p) {
    var text = p.followed ? (p.followedLabel || 'Suivi !') : (p.label || 'Suivre');
    return h('button', { type: 'button', 'aria-pressed': !!p.followed, 'aria-label': p.iconOnly ? text : undefined, className: cx('y-follow', p.followed && 'is-followed', p.iconOnly && 'is-icon-only', p.size === 'md' && 'y-follow-md', p.className) },
      h(Icon, { name: 'user-plus', size: p.iconOnly ? 16 : (p.size === 'md' ? 16 : 12) }), p.iconOnly ? null : text);
  }

  /* Numbers are formatted fr-FR ("2 000"); strings pass through. */
  function ReactionPill(p) {
    var kind = p.kind || 'like';
    var glyph = kind === 'y' ? h(YLogo, { size: 14 }) : h(Icon, { name: kind === 'like' ? 'thumbs-up' : 'thumbs-down', size: 15 });
    var name = kind === 'y' ? 'Y' : (kind === 'like' ? 'J’aime' : 'Pas d’accord');
    return h('button', { type: 'button', 'aria-pressed': !!p.active, className: cx('y-react', 'y-react-' + kind, p.active && 'is-active', p.block && 'y-react-block', p.className) },
      glyph, h('span', null, fmt(p.count)), typeof p.count === 'number' ? sr(' ' + name) : null);
  }

  /* Save-to-Signets toggle. Click flips the state locally so prototypes feel alive. */
  function SaveButton(p) {
    var st = React.useState(!!p.saved), saved = st[0];
    return h('button', {
      type: 'button', className: cx('y-save', saved && 'is-saved', p.block && 'y-save-block', p.className),
      'aria-pressed': saved, 'aria-label': saved ? 'Retirer des signets' : 'Ajouter aux signets', title: saved ? 'Retirer des signets' : 'Ajouter aux signets',
      onClick: function () { st[1](!saved); if (p.onToggle) p.onToggle(!saved); }
    }, h(Icon, { name: saved ? 'bookmark-filled' : 'bookmark', size: 16 }), p.block ? (saved ? 'Enregistré' : 'Enregistrer') : null);
  }

  /* Popover menu. items: [{icon, label, tone:'danger'}]. */
  function Menu(p) {
    return h('div', { className: cx('y-menu', p.className), role: 'menu', 'aria-label': p.label || 'Options' },
      (p.items || []).map(function (it, i) {
        return h('button', { key: i, type: 'button', role: 'menuitem', className: cx('y-menu-item', it.tone === 'danger' && 'is-danger') },
          it.icon ? h(Icon, { name: it.icon, size: 18 }) : null, h('span', null, it.label));
      }));
  }

  /* Question card. "⋯" options on every question (hideMenu to remove); menuOpen shows the popover.
     mine = the logged-in user's own question (Supprimer instead of Signaler / Suivre). */
  function QuestionPost(p) {
    var r = p.reactions || {};
    var st = React.useState(!!p.menuOpen), open = st[0];
    var items = [{ icon: 'link', label: 'Copier le lien' }];
    if (!p.mine) items.push(p.followed ? { icon: 'user-minus', label: 'Ne plus suivre @' + p.author } : { icon: 'user-plus', label: 'Suivre @' + p.author });
    items.push(p.mine ? { icon: 'trash-2', label: 'Supprimer la question', tone: 'danger' } : { icon: 'flag', label: 'Signaler la question', tone: 'danger' });
    return h('article', { className: cx('y-qpost', p.compact && 'is-compact', p.stacked && 'is-stacked', !p.hideMenu && 'has-menu', p.className) },
      h('header', { className: 'y-qpost-head' },
        h(Avatar, { name: p.author, size: p.stacked ? 44 : 36 }),
        h('div', { className: 'y-qpost-who' }, h('strong', null, p.author), h('span', null, p.date)),
        p.hideFollow || p.mine ? null : h(FollowButton, { followed: p.followed, iconOnly: p.stacked }),
        p.tags ? h('div', { className: 'y-qpost-tags' }, p.tags.map(function (t) { return h('a', { key: t, href: '#' }, t); })) : null,
        p.hideMenu ? null : h('button', { type: 'button', className: cx('y-qpost-more', open && 'is-open'), 'aria-label': 'Plus d’options', 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: function () { st[1](!open); } }, h(Icon, { name: 'ellipsis', size: 18 })),
        open && !p.hideMenu ? h(Menu, { items: items, className: 'y-qpost-menu', label: 'Options de la question' }) : null),
      h('p', { className: 'y-qpost-body' }, p.body),
      h('div', { className: 'y-qpost-actions' },
        h(ReactionPill, { kind: 'like', count: r.like, block: p.stacked }),
        h(ReactionPill, { kind: 'dislike', count: r.dislike, block: p.stacked }),
        r.y != null ? h(ReactionPill, { kind: 'y', count: r.y, active: p.yActive, block: p.stacked }) : null,
        p.bookmarkable ? h(SaveButton, { saved: p.saved, block: p.stacked }) : null),
      p.children);
  }

  /* "Rejoindre la conversation" box shown under a question at 50 Y. children = compact replies. */
  function ConversationBox(p) {
    var id = useId();
    return h('section', { className: cx('y-convo', p.size === 'sm' && 'y-convo-sm', p.className), 'aria-label': 'Conversation' },
      h('div', { className: 'y-convo-head' },
        h('h3', { className: 'y-convo-title' }, 'Rejoindre la conversation'),
        h('button', { type: 'button', className: 'y-convo-report', 'aria-label': 'Signaler ce post' }, h(Icon, { name: 'triangle-alert', size: 14 }), p.size === 'sm' ? 'Signaler' : 'Signaler ce post')),
      h('label', { className: 'y-sr', htmlFor: id }, 'Répondre à ' + p.replyTo),
      h('textarea', { id: id, className: 'y-convo-input', placeholder: 'Répondre à ' + p.replyTo + '…', rows: 2 }),
      p.children,
      h('button', { type: 'button', className: 'y-convo-more' }, h(Icon, { name: 'plus', size: 14 }), p.moreLabel || 'Voir plus de réponses'));
  }

  /* Pill search field (one style everywhere). showLabel renders the visible label above. */
  function SearchField(p) {
    var gid = useId(), id = p.id || gid;
    return h('div', { className: cx('y-searchfield', p.className) },
      p.showLabel ? h('label', { className: 'y-searchfield-label', htmlFor: id }, p.label) : null,
      h('div', { className: cx('y-search', 'y-search-' + (p.size || 'md')) },
        h(Icon, { name: 'search', size: 18 }),
        h('input', { id: id, type: 'search', placeholder: p.placeholder || p.label, defaultValue: p.value, 'aria-label': p.showLabel ? undefined : p.label }),
        p.value ? h('button', { type: 'button', className: 'y-search-clear', 'aria-label': 'Effacer la recherche' }, h(Icon, { name: 'x', size: 16 })) : null));
  }

  /* Page header for views (53px). back adds an arrow link; children = actions on the right. */
  function PageHeader(p) {
    return h('header', { className: cx('y-pagehead', p.bordered !== false && 'is-bordered', p.className) },
      p.back ? h('a', { href: '#', className: 'y-pagehead-back', 'aria-label': p.backLabel || 'Retour' }, h(Icon, { name: 'arrow-left', size: 20 })) : null,
      h('div', { className: 'y-pagehead-text' }, h('h1', null, p.title), p.subtitle ? h('p', null, p.subtitle) : null),
      p.children ? h('div', { className: 'y-pagehead-actions' }, p.children) : null);
  }

  /* Mobile top bar (53px): avatar (or back arrow) · title (or logo) · ☰ menu with optional unread dot. */
  function MobileTopBar(p) {
    var left = p.back
      ? h('a', { href: '#', className: 'y-mtop-btn', 'aria-label': p.backLabel || 'Retour' }, h(Icon, { name: 'arrow-left', size: 20 }))
      : h('a', { href: '#', className: 'y-mtop-avatar', 'aria-label': 'Profil' }, h(Avatar, { name: p.user || 'Corentin Laborie', size: 32 }));
    var mid = p.title
      ? h(p.titleHref ? 'a' : 'div', { className: cx('y-mtop-title', p.back && 'is-left', p.titleHref && 'is-link'), href: p.titleHref, 'aria-label': p.titleLabel }, h('h1', null, p.title), p.subtitle ? h('p', null, p.subtitle) : null)
      : h('div', { className: 'y-mtop-title' }, h(YLogo, { size: 28 }));
    return h('header', { className: cx('y-mtop', p.back && p.title && 'has-left-title', p.className) }, left, mid,
      h('div', { className: 'y-mtop-actions' }, p.children,
        h('button', { type: 'button', className: 'y-mtop-btn', 'aria-haspopup': 'dialog', 'aria-label': 'Ouvrir le menu' + (p.unread ? ', nouveautés non lues' : '') },
          h(Icon, { name: 'menu', size: 24 }), p.unread ? h('span', { className: 'y-mtop-dot', 'aria-hidden': true }) : null)));
  }

  /* Native select styled as a pill (e.g. "Trier par"). options: [string] or [{value,label}]. */
  function Select(p) {
    var gid = useId(), id = p.id || gid;
    return h('div', { className: cx('y-select', p.inline && 'is-inline', p.className) },
      p.label ? h('label', { htmlFor: id }, p.label) : null,
      h('span', { className: 'y-select-control' },
        h('select', { id: id, defaultValue: p.value },
          (p.options || []).map(function (o) { var v = typeof o === 'string' ? o : o.value; return h('option', { key: v, value: v }, typeof o === 'string' ? o : o.label); })),
        h(Icon, { name: 'chevron-down', size: 16 })));
  }

  /* Confirmation / form dialog (static markup; the board draws the overlay). tone 'danger' = red confirm. */
  function Dialog(p) {
    var id = useId();
    return h('div', { className: cx('y-dialog', p.className), role: 'dialog', 'aria-modal': true, 'aria-labelledby': id },
      h('h2', { id: id }, p.title),
      p.text ? h('p', { className: 'y-dialog-text' }, p.text) : null,
      p.children,
      (p.confirmLabel || p.cancelLabel) ? h('div', { className: 'y-dialog-actions' },
        p.confirmLabel ? h(Button, { variant: p.tone === 'danger' ? 'danger' : 'primary', size: 'lg', shape: 'pill', block: true }, p.confirmLabel) : null,
        p.cancelLabel ? h(Button, { variant: 'outline', size: 'lg', shape: 'pill', block: true }, p.cancelLabel) : null) : null);
  }

  /* Toast (role=status) with an optional action, e.g. "Retiré de vos signets · Annuler". */
  function Toast(p) {
    return h('div', { className: cx('y-toast', p.className), role: 'status' },
      h('span', null, p.message), p.action ? h('button', { type: 'button' }, p.action) : null);
  }

  /* Empty state: icon, title, text, optional action children. */
  function EmptyState(p) {
    return h('div', { className: cx('y-empty', p.className) },
      p.icon ? h('span', { className: 'y-empty-icon' }, h(Icon, { name: p.icon, size: 28 })) : null,
      h('h2', null, p.title), p.text ? h('p', null, p.text) : null, p.children);
  }


  /* Tablet rail entry: 50px round icon link. Active = filled home / 2.5 stroke + aria-current. */
  function RailItem(p) {
    var icon = p.active && p.icon === 'home' ? 'home-filled' : p.icon;
    return h('a', { href: p.href || '#', className: cx('y-railitem', p.active && 'is-active', p.className), 'aria-label': p.label + (p.badge ? ', ' + p.badge + ' non lu' + (Number(p.badge) > 1 ? 's' : '') : ''), 'aria-current': p.active ? 'page' : undefined },
      h(Icon, { name: icon, size: 26, strokeWidth: p.active && p.icon !== 'home' ? 2.5 : 2 }),
      p.badge ? h('span', { className: 'y-railitem-badge', 'aria-hidden': true }, p.badge) : null);
  }
  /* Tablet rail "Poster": 50px round primary button with a plus. */
  function RailPoster(p) {
    return h('a', { href: '#', className: cx('y-railposter', p.className), 'aria-label': p.label || 'Poster' }, h(Icon, { name: 'plus', size: 24, strokeWidth: 2.5 }));
  }
  /* Site footer. variant 'sidebar' (desktop right column: legal links + notice) or 'page' (landing/auth: notice, links optional). */
  function Footer(p) {
    var links = (p.variant || 'sidebar') === 'sidebar' || p.links;
    return h('footer', { className: cx('y-footer', 'y-footer-' + (p.variant || 'sidebar'), p.className) },
      links ? h('nav', { className: 'y-footer-links', 'aria-label': 'Informations légales' },
        h('a', { href: '#' }, 'Conditions d’utilisation'), ' · ',
        h('a', { href: '#' }, 'Politique de confidentialité'), ' · ',
        h('a', { href: '#' }, 'Utilisation des cookies')) : null,
      h('p', null, 'Ce site est un prototype à but non lucratif créé dans le cadre d’un portfolio.', h('br'), '© 2026 Laborie Corentin.'));
  }

  function Card(p) {
    return h('section', { className: cx('y-card', p.raised && 'is-raised', p.tone && 'y-card-' + p.tone, p.className), style: p.style }, p.children);
  }

  /* Y count against the threshold, e.g. "49/50". bar adds a primary fill bar under the text. */
  function YProgress(p) {
    var threshold = p.threshold == null ? 50 : Number(p.threshold), count = Number(p.count) || 0;
    var pct = threshold > 0 ? Math.min(100, Math.max(0, count / threshold * 100)) : 0;
    return h('span', { className: cx('y-progress', p.bar && 'has-bar', p.className) },
      h('span', { className: 'y-progress-text' }, fmt(count) + '/' + fmt(threshold)),
      p.bar ? h('span', { className: 'y-progress-track', role: 'progressbar', 'aria-label': 'Y atteints', 'aria-valuemin': 0, 'aria-valuemax': threshold, 'aria-valuenow': count },
        h('span', { className: 'y-progress-fill', style: { width: pct + '%' } })) : null);
  }

  /* Character counter, e.g. "0/280". Turns destructive-text and announces the overflow when value > max. */
  function CharCounter(p) {
    var len = Number(p.value) || 0, max = Number(p.max) || 0, over = len > max;
    return h('span', { className: cx('y-charcounter', over && 'is-over', p.className) },
      fmt(len) + '/' + fmt(max),
      over ? sr(', ' + fmt(len - max) + ' caractère' + (len - max > 1 ? 's' : '') + ' de trop') : null);
  }

  /* Loading placeholder. variant: line (default), avatar (circle) or card (avatar + two lines). Pulse is off under prefers-reduced-motion. */
  function Skeleton(p) {
    var v = p.variant || 'line';
    var style = p.width != null ? { width: p.width } : undefined;
    var block = function (cls) { return h('span', { className: cls, 'aria-hidden': true, style: style }); };
    if (v === 'card') {
      return h('div', { className: cx('y-skeleton-card', p.className), role: 'status', 'aria-label': 'Chargement…' },
        h('div', { className: 'y-skeleton-head' }, block('y-skeleton-block y-skeleton-avatar'),
          h('div', { className: 'y-skeleton-lines' }, block('y-skeleton-block y-skeleton-line is-short'), block('y-skeleton-block y-skeleton-line'))),
        block('y-skeleton-block y-skeleton-line'));
    }
    return h('span', { className: cx('y-skeleton-block', v === 'avatar' ? 'y-skeleton-avatar' : 'y-skeleton-line', p.className), role: 'status', 'aria-label': 'Chargement…', style: style });
  }

  /* Load-failure block. role=alert announces it; the retry control is a real button. */
  function ErrorState(p) {
    return h('div', { className: cx('y-errorstate', p.className), role: 'alert' },
      h('span', { className: 'y-errorstate-icon' }, h(Icon, { name: 'triangle-alert', size: 24 })),
      h('h2', { className: 'y-errorstate-title' }, p.title),
      p.message ? h('p', { className: 'y-errorstate-message' }, p.message) : null,
      h('button', { type: 'button', className: 'y-errorstate-retry', onClick: p.onRetry }, p.retryLabel || 'Réessayer'));
  }

  /* "Voir plus" for cursor lists. loading disables the button, sets aria-busy and shows a spinner with "Chargement…". */
  function LoadMore(p) {
    var loading = !!p.loading;
    return h('button', { type: 'button', className: cx('y-loadmore', loading && 'is-loading', p.className), disabled: loading, 'aria-busy': loading ? true : undefined, onClick: p.onClick },
      loading ? h('span', { className: 'y-loadmore-spinner', 'aria-hidden': true }) : null,
      loading ? 'Chargement…' : (p.label || 'Voir plus'));
  }

  window.YDS = Object.assign(window.YDS || {}, {
    Icon: Icon, YLogo: YLogo, Button: Button, IconButton: IconButton, Avatar: Avatar, NavItem: NavItem, Tab: Tab,
    TextField: TextField, Checkbox: Checkbox, FollowButton: FollowButton, ReactionPill: ReactionPill, SaveButton: SaveButton, QuestionPost: QuestionPost, Card: Card,
    Menu: Menu, ConversationBox: ConversationBox, SearchField: SearchField, PageHeader: PageHeader, MobileTopBar: MobileTopBar, Select: Select, Dialog: Dialog, Toast: Toast, EmptyState: EmptyState,
    RailItem: RailItem, RailPoster: RailPoster, Footer: Footer,
    YProgress: YProgress, CharCounter: CharCounter, Skeleton: Skeleton, ErrorState: ErrorState, LoadMore: LoadMore
  });
})();
