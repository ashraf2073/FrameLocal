/*!
 * FrameLocal - app
 * Feed, Create and Profile views. All data lives on the device (see db.js).
 * Made by Ashraf
 */
(() => {
  'use strict';

  const FL = window.FL;
  const { esc, uid, clamp, fmtCount, timeAgo, fullDate, bytes } = FL.u;
  const { icon, db, img, native } = FL;

  const PAGE = 6;            // posts rendered per batch in the feed
  const MAX_CAPTION = 500;
  const MAX_NAME = 24;
  const MAX_BIO = 160;
  const TABS = ['feed', 'create', 'profile'];

  const state = { profile: null, posts: [], shown: 0, tab: 'feed', theme: 'system' };
  const draft = { photo: null, busy: false, publishing: false };

  /* ------------------------------------------------------------------ tiny helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const frag = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content;
  };
  const byId = (id) => state.posts.find((p) => p.id === id);
  const isOwn = (p) => p.authorId === state.profile.id;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const cleanName = (s) => String(s || '').trim().replace(/^@+/, '').replace(/\s+/g, '_').slice(0, MAX_NAME);
  const authorOf = (p) =>
    isOwn(p)
      ? { name: state.profile.name, avatar: state.profile.avatar, own: true }
      : { name: p.authorName || 'someone', avatar: p.authorAvatar || null, own: false };

  /* ------------------------------------------------------------------ theme */
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const savedTheme = () => {
    try { return localStorage.getItem('fl:theme') || 'system'; } catch (_) { return 'system'; }
  };
  const isDark = () => document.documentElement.classList.contains('dark');

  function applyTheme(pref, { persist = true } = {}) {
    state.theme = pref;
    const dark = pref === 'dark' || (pref === 'system' && media.matches);
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.dataset.theme = pref;
    const meta = $('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', dark ? '#050505' : '#f6f6f5');
    if (persist) {
      try { localStorage.setItem('fl:theme', pref); } catch (_) { /* private mode */ }
    }
    native.setSystemBars(dark);
    renderThemeButton();
    $$('.seg [data-pref]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pref === pref)));
  }

  function renderThemeButton() {
    const btn = $('#theme-toggle');
    const dark = isDark();
    btn.innerHTML = icon(dark ? 'sun' : 'moon', { size: 23 });
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  /* ------------------------------------------------------------------ toast */
  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  const storageError = (err, fallback) =>
    err && err.code === 'storage-full' ? 'Not enough storage space. Delete a post and try again.' : fallback;

  /* ------------------------------------------------------------------ sheets (bottom sheets + full-screen detail)
   * Each open sheet pushes one history entry, so the Android back button closes the top sheet first. */
  const sheets = [];

  function openSheet({ title = '', html = '', full = false, label, onMount } = {}, replacing = null) {
    if (replacing) {
      const i = sheets.indexOf(replacing);
      if (i > -1) sheets.splice(i, 1);
      replacing.el.remove();
    }
    const el = frag(`
      <div class="scrim${replacing ? ' instant' : ''}">
        <div class="sheet${full ? ' full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label || title)}" tabindex="-1">
          ${full ? '' : '<div class="grab"></div>'}
          <div class="sheet-head">
            <h2 class="sheet-title">${esc(title)}</h2>
            <button class="icon-btn" type="button" data-sheet-close aria-label="Close">${icon('x')}</button>
          </div>
          <div class="sheet-body">${html}</div>
        </div>
      </div>`).firstElementChild;

    $('#overlays').append(el);
    const sheet = { el, body: $('.sheet-body', el), opener: document.activeElement, close: () => closeSheet(sheet) };
    sheets.push(sheet);
    if (!replacing) history.pushState({ sheet: sheets.length }, '');

    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-sheet-close]')) sheet.close();
    });
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
    if (typeof onMount === 'function') onMount(sheet);
    return sheet;
  }

  function removeSheet(sheet) {
    sheet.el.classList.remove('open');
    sheet.el.style.pointerEvents = 'none';
    setTimeout(() => sheet.el.remove(), 380);
    if (sheet.opener && sheet.opener.isConnected && sheet.opener.focus) sheet.opener.focus({ preventScroll: true });
  }

  function settleSheets(depth) {
    while (sheets.length > depth) removeSheet(sheets.pop());
  }

  function closeSheet(sheet) {
    const depth = sheets.indexOf(sheet); // stack size we want after closing
    if (depth < 0) return;
    const at = (history.state && history.state.sheet) || 0;
    if (at > depth) {
      history.go(depth - at);
      setTimeout(() => settleSheets(depth), 500); // safety net if popstate never fires
    } else {
      settleSheets(depth);
    }
  }

  const closeAllSheets = () => sheets[0] && closeSheet(sheets[0]);

  window.addEventListener('popstate', () => settleSheets((history.state && history.state.sheet) || 0));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close();
  });

  /* ------------------------------------------------------------------ tabs */
  function setTab(tab, { instant = false } = {}) {
    if (!TABS.includes(tab)) tab = 'feed';
    const views = $('#views');
    if (instant) views.classList.add('no-anim');
    const idx = TABS.indexOf(tab);
    state.tab = tab;
    TABS.forEach((t, i) => {
      const v = $(`#view-${t}`);
      v.dataset.pos = i < idx ? 'before' : i > idx ? 'after' : 'active';
      v.toggleAttribute('inert', t !== tab);
      v.setAttribute('aria-hidden', String(t !== tab));
    });
    renderTabs();
    try { history.replaceState({ sheet: sheets.length }, '', `#${tab}`); } catch (_) { /* file:// */ }
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => views.classList.remove('no-anim')));
  }

  function renderTabs() {
    const avatar = state.profile && state.profile.avatar;
    $$('.tab').forEach((btn) => {
      const t = btn.dataset.tab;
      const active = t === state.tab;
      btn.setAttribute('aria-current', active ? 'page' : 'false');
      const slot = $('.tab-ico', btn);
      if (t === 'feed') slot.innerHTML = icon('home', { size: 26, fill: active });
      if (t === 'create') slot.innerHTML = `<span class="create-ico">${icon('plus', { size: 20 })}</span>`;
      if (t === 'profile') slot.innerHTML = avatar ? `<img class="tab-avatar" src="${esc(avatar)}" alt="" />` : icon('user', { size: 26, fill: active });
    });
  }

  /* ------------------------------------------------------------------ avatar + card templates */
  function avatarHTML(name, src, size = 40, ring = false) {
    const initial = ([...String(name || '?').trim()][0] || '?').toUpperCase();
    const inner = src ? `<img src="${esc(src)}" alt="" />` : `<span>${esc(initial)}</span>`;
    return `<span class="avatar${ring ? ' avatar-ring' : ''}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${inner}</span>`;
  }

  function cardHTML(p, detail = false) {
    const a = authorOf(p);
    const ratio = clamp((p.w || 1) / (p.h || 1), 0.75, 1.91);
    const wrapStyle = detail ? `aspect-ratio:${(p.w || 1) / (p.h || 1)}` : `aspect-ratio:${ratio}`;
    const long = p.caption.length > 150 || p.caption.split('\n').length > 3;
    const alt = p.caption ? p.caption.slice(0, 120) : `Photo by ${a.name}`;
    return `
      <article class="card${detail ? ' card-detail' : ''}" data-post="${esc(p.id)}">
        <header class="flex items-center gap-3 pb-2.5 pl-1 pt-0.5">
          ${avatarHTML(a.name, a.avatar, 42)}
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate text-[15.5px] font-bold leading-tight">${esc(a.name)}</p>
            ${a.own ? '' : '<p class="m-0 text-[12.5px] leading-tight text-muted">Shared with you</p>'}
          </div>
          <button class="icon-btn -mr-1 text-muted" type="button" data-action="menu" aria-label="Post options">${icon('more')}</button>
        </header>

        <div class="photo" data-role="photo" style="${wrapStyle}">
          <img data-photo="${esc(p.id)}" alt="${esc(alt)}" decoding="async" draggable="false" />
        </div>

        <div class="flex items-center">
          <button class="like" type="button" data-action="like" aria-pressed="${p.liked}" aria-label="Like">
            ${icon('heart', { size: 27 })}<span class="like-count">${fmtCount(p.likes)}</span>
          </button>
        </div>

        ${p.caption ? `<p class="caption${long ? ' is-clamped' : ''}">${esc(p.caption)}</p>${long ? '<button class="more" type="button" data-action="more">more</button>' : ''}` : ''}
        <time class="stamp" data-ts="${p.createdAt}" datetime="${new Date(p.createdAt).toISOString()}" title="${esc(fullDate(p.createdAt))}">${esc(timeAgo(p.createdAt))}</time>
      </article>`;
  }

  /** Loads full-size photos (kept out of the post list so big feeds stay light). */
  function hydrate(root) {
    $$('img[data-photo]:not([data-loaded])', root).forEach(async (im) => {
      im.dataset.loaded = '1';
      const wrap = im.closest('.photo');
      try {
        const src = await db.getPhoto(im.dataset.photo);
        if (!src) throw new Error('missing');
        im.src = src;
        await im.decode().catch(() => {});
        im.classList.add('is-ready');
        wrap.classList.add('is-loaded');
      } catch (_) {
        wrap.classList.add('is-loaded', 'is-missing');
      }
    });
  }

  /* ------------------------------------------------------------------ feed */
  let feedObserver;

  function renderFeed() {
    $('#feed-list').replaceChildren();
    state.shown = 0;
    $('#feed-empty').hidden = state.posts.length > 0;
    appendFeed();
  }

  function appendFeed() {
    const batch = state.posts.slice(state.shown, state.shown + PAGE);
    if (!batch.length) return;
    const list = $('#feed-list');
    const nodes = frag(batch.map((p) => cardHTML(p)).join(''));
    list.append(nodes);
    state.shown += batch.length;
    hydrate(list);
    // re-arm the observer so a still-visible sentinel loads the next batch
    if (feedObserver) {
      feedObserver.unobserve($('#feed-sentinel'));
      feedObserver.observe($('#feed-sentinel'));
    }
  }

  function initFeedObserver() {
    if (!('IntersectionObserver' in window)) return;
    feedObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && state.shown < state.posts.length) appendFeed();
      },
      { root: $('#view-feed'), rootMargin: '700px 0px' }
    );
    feedObserver.observe($('#feed-sentinel'));
  }

  function refreshPost(p) {
    $$(`[data-post="${CSS.escape(p.id)}"]`).forEach((old) => {
      const fresh = frag(cardHTML(p, old.classList.contains('card-detail'))).firstElementChild;
      old.replaceWith(fresh);
      hydrate(fresh);
    });
  }

  function syncLike(p) {
    $$(`[data-post="${CSS.escape(p.id)}"]`).forEach((card) => {
      const btn = $('.like', card);
      btn.setAttribute('aria-pressed', String(p.liked));
      $('.like-count', btn).textContent = fmtCount(p.likes);
    });
    renderStats();
  }

  async function toggleLike(id) {
    const p = byId(id);
    if (!p) return;
    p.liked = !p.liked;
    p.likes = Math.max(0, p.likes + (p.liked ? 1 : -1));
    syncLike(p);
    try {
      await db.putPost(p);
    } catch (err) {
      p.liked = !p.liked;
      p.likes = Math.max(0, p.likes + (p.liked ? 1 : -1));
      syncLike(p);
      toast(storageError(err, 'Couldn’t save that like. Try again.'));
    }
  }

  let lastTap = { el: null, t: 0 };
  function onPhotoTap(e) {
    const photo = e.target.closest('.photo[data-role="photo"]');
    if (!photo) return;
    const now = performance.now();
    if (lastTap.el === photo && now - lastTap.t < 320) {
      lastTap = { el: null, t: 0 };
      const id = photo.closest('[data-post]').dataset.post;
      const p = byId(id);
      const heart = frag(`<div class="burst">${icon('heart', { size: 104, fill: true })}</div>`).firstElementChild;
      photo.append(heart);
      setTimeout(() => heart.remove(), 850);
      if (p && !p.liked) toggleLike(id);
    } else {
      lastTap = { el: photo, t: now };
    }
  }

  /* ------------------------------------------------------------------ post actions: menu, edit, delete */
  function openMenu(id) {
    const p = byId(id);
    if (!p) return;
    openSheet({
      title: 'Post options',
      html: `<div class="-mx-2 pb-1">
        ${isOwn(p) ? `<button class="menu-item" type="button" data-do="edit">${icon('pencil')}Edit caption</button>` : ''}
        <button class="menu-item danger" type="button" data-do="delete">${icon('trash')}Delete post</button>
      </div>`,
      onMount: (sheet) => {
        sheet.body.addEventListener('click', (e) => {
          const act = e.target.closest('[data-do]');
          if (!act) return;
          if (act.dataset.do === 'edit') openEditCaption(id, sheet);
          if (act.dataset.do === 'delete') openConfirmDelete(id, sheet);
        });
      },
    });
  }

  function openEditCaption(id, replacing) {
    const p = byId(id);
    if (!p) return;
    openSheet(
      {
        title: 'Edit caption',
        html: `<textarea class="field field-serif" id="edit-caption" rows="4" maxlength="${MAX_CAPTION}" aria-label="Caption">${esc(p.caption)}</textarea>
          <div class="counter mb-4" id="edit-count"></div>
          <button class="btn btn-gold btn-block" type="button" id="edit-save">Save changes</button>`,
        onMount: (sheet) => {
          const ta = $('#edit-caption', sheet.body);
          const count = $('#edit-count', sheet.body);
          const update = () => (count.textContent = `${ta.value.length} / ${MAX_CAPTION}`);
          ta.addEventListener('input', update);
          update();
          $('#edit-save', sheet.body).addEventListener('click', async () => {
            const before = p.caption;
            p.caption = ta.value.trim().slice(0, MAX_CAPTION);
            try {
              await db.putPost(p);
              refreshPost(p);
              sheet.close();
              toast('Saved');
            } catch (err) {
              p.caption = before;
              toast(storageError(err, 'Couldn’t save the caption. Try again.'));
            }
          });
        },
      },
      replacing
    );
  }

  function openConfirmDelete(id, replacing) {
    openSheet(
      {
        title: 'Delete this post?',
        html: `<p class="mb-5 mt-0 text-muted">It will be removed from this device. This can’t be undone.</p>
          <div class="grid gap-2">
            <button class="btn btn-danger" type="button" data-do="confirm">Delete</button>
            <button class="btn btn-quiet" type="button" data-sheet-close>Cancel</button>
          </div>`,
        onMount: (sheet) => {
          $('[data-do="confirm"]', sheet.body).addEventListener('click', async (e) => {
            e.currentTarget.disabled = true;
            try {
              await removePost(id);
              closeAllSheets();
              toast('Deleted');
            } catch (err) {
              e.currentTarget.disabled = false;
              toast(storageError(err, 'Couldn’t delete the post. Try again.'));
            }
          });
        },
      },
      replacing
    );
  }

  async function removePost(id) {
    await db.deletePost(id);
    state.posts = state.posts.filter((p) => p.id !== id);
    $$(`#feed-list [data-post="${CSS.escape(id)}"]`).forEach((card) => {
      card.classList.add('is-leaving');
      setTimeout(() => card.remove(), 300);
    });
    state.shown = Math.max(0, state.shown - 1);
    $('#feed-empty').hidden = state.posts.length > 0;
    renderProfile();
    if (state.shown < state.posts.length && feedObserver) {
      feedObserver.unobserve($('#feed-sentinel'));
      feedObserver.observe($('#feed-sentinel'));
    }
  }

  function openDetail(id) {
    const p = byId(id);
    if (!p) return;
    openSheet({
      title: 'Post',
      full: true,
      html: cardHTML(p, true),
      onMount: (sheet) => hydrate(sheet.body),
    });
  }

  /* ------------------------------------------------------------------ create */
  function updateCreateUI() {
    const filled = !!draft.photo;
    const vf = $('#vf');
    vf.classList.toggle('is-filled', filled);
    $('#vf-empty').hidden = filled || draft.busy;
    $('#vf-busy').hidden = !draft.busy;
    $('#vf-photo').hidden = !filled;

    const preview = $('#vf-img');
    if (filled) {
      if (preview.dataset.token !== draft.photo.token) {
        preview.src = draft.photo.image;
        preview.dataset.token = draft.photo.token;
      }
      vf.style.aspectRatio = String(clamp(draft.photo.w / draft.photo.h, 0.75, 1.91));
    } else {
      preview.removeAttribute('src');
      delete preview.dataset.token;
      vf.style.aspectRatio = '4 / 5';
    }

    const btn = $('#btn-publish');
    btn.disabled = !filled || draft.busy || draft.publishing;
    btn.innerHTML = draft.publishing ? '<span class="spinner"></span>Publishing' : 'Publish to Feed';
    $('#caption-count').textContent = `${$('#caption').value.length} / ${MAX_CAPTION}`;
  }

  async function handleFile(file) {
    if (!file) return;
    draft.busy = true;
    updateCreateUI();
    try {
      const processed = await img.processPhoto(file);
      draft.photo = { ...processed, token: uid() };
    } catch (err) {
      toast(err && err.message === 'not-an-image' ? 'That file isn’t a photo. Choose a JPG, PNG or WebP image.' : 'Couldn’t read that photo. Try another one.');
    } finally {
      draft.busy = false;
      updateCreateUI();
    }
  }

  function resetDraft() {
    draft.photo = null;
    draft.busy = false;
    draft.publishing = false;
    $('#caption').value = '';
    updateCreateUI();
  }

  async function publish() {
    if (!draft.photo || draft.busy || draft.publishing) return;
    draft.publishing = true;
    updateCreateUI();
    const post = {
      id: uid(),
      authorId: state.profile.id,
      caption: $('#caption').value.trim().slice(0, MAX_CAPTION),
      createdAt: Date.now(),
      likes: 0,
      liked: false,
      thumb: draft.photo.thumb,
      w: draft.photo.w,
      h: draft.photo.h,
    };
    try {
      await db.putPost(post, draft.photo.image);
    } catch (err) {
      draft.publishing = false;
      updateCreateUI();
      toast(storageError(err, 'Couldn’t publish. Try again.'));
      return;
    }
    state.posts.unshift(post);
    resetDraft();
    renderFeed();
    renderProfile();
    setTab('feed');
    $('#view-feed').scrollTo({ top: 0 });
    toast('Published');
  }

  /* ------------------------------------------------------------------ profile */
  function renderStats() {
    const mine = state.posts.filter(isOwn);
    $('#stat-posts').textContent = fmtCount(mine.length);
    $('#stat-likes').textContent = fmtCount(mine.reduce((n, p) => n + p.likes, 0));
  }

  function renderProfile() {
    const p = state.profile;
    $('#profile-avatar').innerHTML = avatarHTML(p.name, p.avatar, 92, true);
    $('#profile-name').textContent = p.name;
    const bio = $('#profile-bio');
    bio.textContent = p.bio;
    bio.hidden = !p.bio;
    renderStats();
    const mine = state.posts.filter(isOwn);
    $('#profile-grid').innerHTML = mine
      .map(
        (post) =>
          `<button class="tiles-item" type="button" data-action="open" data-id="${esc(post.id)}" aria-label="Open post${post.caption ? `: ${esc(post.caption.slice(0, 60))}` : ''}"><img src="${esc(post.thumb)}" alt="" loading="lazy" decoding="async" /></button>`
      )
      .join('');
    $('#profile-empty').hidden = mine.length > 0;
    renderTabs();
  }

  let avatarTarget = null; // callback that receives the processed avatar for whichever editor asked

  function openProfileEditor({ welcome = false } = {}) {
    const p = state.profile;
    let avatar = p.avatar;
    openSheet({
      title: welcome ? 'Welcome to FrameLocal' : 'Edit profile',
      html: `
        ${welcome ? '<p class="mb-5 mt-0 text-muted">Your photos stay on this device. No account and no server. Pick a username to get started.</p>' : ''}
        <div class="mb-5 flex items-center gap-4">
          <div id="ed-avatar">${avatarHTML(p.name, avatar, 76)}</div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-quiet btn-small" type="button" id="ed-pick">${avatar ? 'Change photo' : 'Add photo'}</button>
            <button class="btn btn-ghost btn-small" type="button" id="ed-clear" ${avatar ? '' : 'hidden'}>Remove</button>
          </div>
        </div>
        <label class="field-label" for="ed-name">Username</label>
        <input id="ed-name" class="field mb-4" maxlength="${MAX_NAME}" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(p.name)}" />
        <label class="field-label" for="ed-bio">Bio</label>
        <textarea id="ed-bio" class="field field-serif mb-5" rows="3" maxlength="${MAX_BIO}">${esc(p.bio)}</textarea>
        <button class="btn btn-gold btn-block" type="button" id="ed-save">${welcome ? 'Get started' : 'Save changes'}</button>`,
      onMount: (sheet) => {
        const body = sheet.body;
        const nameEl = $('#ed-name', body);
        const paint = () => {
          $('#ed-avatar', body).innerHTML = avatarHTML(nameEl.value || p.name, avatar, 76);
          $('#ed-clear', body).hidden = !avatar;
          $('#ed-pick', body).textContent = avatar ? 'Change photo' : 'Add photo';
        };
        nameEl.addEventListener('input', () => { if (!avatar) paint(); });
        $('#ed-pick', body).addEventListener('click', () => {
          avatarTarget = (dataUrl) => { avatar = dataUrl; paint(); };
          $('#file-avatar').click();
        });
        $('#ed-clear', body).addEventListener('click', () => { avatar = null; paint(); });
        $('#ed-save', body).addEventListener('click', async () => {
          const name = cleanName(nameEl.value);
          if (!name) {
            toast('Choose a username to continue.');
            nameEl.focus();
            return;
          }
          const next = { ...p, name, bio: $('#ed-bio', body).value.trim().slice(0, MAX_BIO), avatar };
          try {
            await db.setMeta('profile', next);
          } catch (err) {
            toast(storageError(err, 'Couldn’t save your profile. Try again.'));
            return;
          }
          state.profile = next;
          renderProfile();
          state.posts.filter(isOwn).forEach(refreshPost);
          sheet.close();
          toast(welcome ? `Welcome, ${name}` : 'Saved');
        });
      },
    });
  }

  /* ------------------------------------------------------------------ settings, backup and import */
  function openSettings() {
    openSheet({
      title: 'Settings',
      html: `
        <div class="section">
          <p class="section-title">Appearance</p>
          <p class="hint">Match your device or pick a side.</p>
          <div class="seg" role="group" aria-label="Theme">
            <button type="button" data-pref="system" aria-pressed="${state.theme === 'system'}">System</button>
            <button type="button" data-pref="light" aria-pressed="${state.theme === 'light'}">Light</button>
            <button type="button" data-pref="dark" aria-pressed="${state.theme === 'dark'}">Dark</button>
          </div>
        </div>

        <div class="section">
          <p class="section-title">Backup and sharing</p>
          <p class="hint">Export your feed as one file. Send it to a friend and they can import your frames. No server involved.</p>
          <div class="grid gap-2">
            <button class="btn btn-quiet" type="button" id="st-export">${icon('download', { size: 21 })}Export backup</button>
            <button class="btn btn-quiet" type="button" id="st-import">${icon('upload', { size: 21 })}Import from file</button>
          </div>
        </div>

        <div class="section">
          <p class="section-title">On this device</p>
          <p class="hint" id="st-usage">Checking storage…</p>
          <button class="btn btn-ghost btn-block text-danger" type="button" id="st-erase">${icon('trash', { size: 21 })}Erase all data</button>
        </div>

        <p class="credit">FrameLocal 1.0. Made by Ashraf.</p>`,
      onMount: (sheet) => {
        const b = sheet.body;
        $$('.seg [data-pref]', b).forEach((btn) => btn.addEventListener('click', () => applyTheme(btn.dataset.pref)));
        $('#st-export', b).addEventListener('click', exportBackup);
        $('#st-import', b).addEventListener('click', () => $('#file-import').click());
        $('#st-erase', b).addEventListener('click', () => openConfirmErase(sheet));
        db.usage().then((u) => {
          const mine = plural(state.posts.length, 'post', 'posts');
          $('#st-usage', b).textContent = u ? `${mine} saved, using ${bytes(u.used)} on this device.` : `${mine} saved on this device.`;
        });
      },
    });
  }

  async function exportBackup() {
    if (!state.posts.length) {
      toast('Nothing to export yet. Publish a post first.');
      return;
    }
    try {
      const photos = await db.getPhotos(state.posts.map((p) => p.id));
      const me = state.profile;
      const data = {
        app: 'FrameLocal',
        version: 1,
        exportedAt: new Date().toISOString(),
        profile: { id: me.id, name: me.name, bio: me.bio, avatar: me.avatar },
        posts: state.posts
          .map((p, i) => ({
            id: p.id,
            authorId: p.authorId,
            authorName: isOwn(p) ? me.name : p.authorName,
            authorAvatar: isOwn(p) ? me.avatar : p.authorAvatar || null,
            caption: p.caption,
            createdAt: p.createdAt,
            likes: p.likes,
            liked: p.liked,
            w: p.w,
            h: p.h,
            thumb: p.thumb,
            image: photos[i],
          }))
          .filter((p) => p.image),
      };
      const name = `framelocal-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const how = await native.saveTextFile(name, JSON.stringify(data));
      toast(how === 'shared' ? 'Backup ready to save' : 'Backup downloaded');
    } catch (err) {
      if (/cancel/i.test(String((err && (err.message || err)) || ''))) return;
      console.error(err);
      toast('Couldn’t export the backup. Try again.');
    }
  }

  const isImg = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(s) && s.length < 40e6;
  const str = (s, max) => String(s == null ? '' : s).slice(0, max);

  function parseBackup(data) {
    if (!data || data.app !== 'FrameLocal' || !Array.isArray(data.posts)) return null;
    const idOk = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);
    const rp = data.profile || {};
    const profile = {
      id: idOk(rp.id) ? rp.id : uid(),
      name: cleanName(rp.name) || 'someone',
      bio: str(rp.bio, MAX_BIO),
      avatar: isImg(rp.avatar) ? rp.avatar : null,
    };
    const items = [];
    for (const raw of data.posts) {
      if (!raw || !isImg(raw.image)) continue;
      const w = Number(raw.w) > 0 ? Math.round(Number(raw.w)) : 1080;
      const h = Number(raw.h) > 0 ? Math.round(Number(raw.h)) : 1080;
      items.push({
        photo: raw.image,
        wasLiked: !!raw.liked,
        post: {
          id: idOk(raw.id) ? raw.id : uid(),
          authorId: idOk(raw.authorId) ? raw.authorId : profile.id,
          authorName: cleanName(raw.authorName) || profile.name,
          authorAvatar: isImg(raw.authorAvatar) ? raw.authorAvatar : null,
          caption: str(raw.caption, MAX_CAPTION),
          createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
          likes: clamp(Math.round(Number(raw.likes)) || 0, 0, 1e9),
          liked: false,
          thumb: isImg(raw.thumb) ? raw.thumb : raw.image,
          w,
          h,
        },
      });
    }
    return items.length ? { profile, items } : null;
  }

  async function importFile(file) {
    let parsed = null;
    try {
      parsed = parseBackup(JSON.parse(await file.text()));
    } catch (_) { /* handled below */ }
    if (!parsed) {
      toast('That file isn’t a FrameLocal backup.');
      return;
    }
    const have = new Set(state.posts.map((p) => p.id));
    const fresh = parsed.items.filter((i) => !have.has(i.post.id));
    if (!fresh.length) {
      toast('Everything in that file is already in your feed.');
      return;
    }
    const mine = parsed.profile.id === state.profile.id;
    const from = mine ? 'your own backup' : `@${esc(parsed.profile.name)}`;

    openSheet({
      title: `Import ${plural(fresh.length, 'post', 'posts')}?`,
      html: `
        <p class="mb-5 mt-0 text-muted">${
          mine
            ? 'These come from your own backup. They will be merged into your feed.'
            : `From ${from}. They will appear in your feed as theirs.`
        }</p>
        <div class="grid gap-2">
          <button class="btn btn-gold" type="button" data-do="add">Add to my feed</button>
          ${mine ? '' : '<button class="btn btn-quiet" type="button" data-do="restore">Restore as my account</button>'}
          <button class="btn btn-ghost" type="button" data-sheet-close>Cancel</button>
        </div>
        ${mine ? '' : '<p class="hint mb-0 mt-4">Restore as my account is for moving to a new phone: it uses the profile in this file and treats its posts as yours.</p>'}`,
      onMount: (sheet) => {
        sheet.body.addEventListener('click', async (e) => {
          const act = e.target.closest('[data-do]');
          if (!act) return;
          act.disabled = true;
          try {
            await applyImport(parsed, fresh, act.dataset.do === 'restore');
            closeAllSheets();
            toast(`Imported ${plural(fresh.length, 'post', 'posts')}`);
          } catch (err) {
            act.disabled = false;
            toast(storageError(err, 'Couldn’t import that file. Try again.'));
          }
        });
      },
    });
  }

  async function applyImport(parsed, fresh, restore) {
    if (restore) {
      const oldId = state.profile.id;
      const profile = { ...state.profile, ...parsed.profile };
      await db.setMeta('profile', profile);
      state.profile = profile;
      const mine = state.posts.filter((p) => p.authorId === oldId);
      mine.forEach((p) => { p.authorId = profile.id; });
      await Promise.all(mine.map((p) => db.putPost(p)));
    }
    const items = fresh.map(({ post, photo, wasLiked }) => ({ post: { ...post, liked: restore ? wasLiked : false }, photo }));
    await db.putMany(items);
    state.posts = [...state.posts, ...items.map((i) => i.post)].sort((a, b) => b.createdAt - a.createdAt);
    renderFeed();
    renderProfile();
  }

  function openConfirmErase(replacing) {
    openSheet(
      {
        title: 'Erase all data?',
        html: `<p class="mb-5 mt-0 text-muted">Every post and your profile will be deleted from this device. Export a backup first if you want to keep them.</p>
          <div class="grid gap-2">
            <button class="btn btn-danger" type="button" data-do="confirm">Erase everything</button>
            <button class="btn btn-quiet" type="button" data-sheet-close>Cancel</button>
          </div>`,
        onMount: (sheet) => {
          $('[data-do="confirm"]', sheet.body).addEventListener('click', async (e) => {
            e.currentTarget.disabled = true;
            try {
              await db.clear();
              location.reload();
            } catch (err) {
              e.currentTarget.disabled = false;
              toast('Couldn’t erase your data. Try again.');
            }
          });
        },
      },
      replacing
    );
  }

  /* ------------------------------------------------------------------ wiring */
  function bind() {
    // static icons
    $('#brand-mark').innerHTML = icon('frame', { size: 28 });
    $('#feed-empty-mark').innerHTML = icon('frame', { size: 52 });
    $('#btn-camera').innerHTML = `${icon('camera', { size: 22 })}Take photo`;
    $('#btn-gallery').innerHTML = `${icon('image', { size: 22 })}Choose photo`;
    $('#btn-replace').innerHTML = `${icon('image', { size: 19 })}Replace`;
    $('#btn-remove').innerHTML = `${icon('x', { size: 19 })}Remove`;
    $('#btn-settings').innerHTML = icon('sliders', { size: 23 });

    // tabs + shortcuts
    $$('.tab').forEach((btn) =>
      btn.addEventListener('click', () => {
        const t = btn.dataset.tab;
        if (t === state.tab) $(`#view-${t}`).scrollTo({ top: 0, behavior: 'smooth' });
        else setTab(t);
      })
    );
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.go)));
    $('#theme-toggle').addEventListener('click', () => applyTheme(isDark() ? 'light' : 'dark'));
    media.addEventListener && media.addEventListener('change', () => state.theme === 'system' && applyTheme('system', { persist: false }));

    // create
    const pick = (id) => () => $(id).click();
    $('#btn-camera').addEventListener('click', pick('#file-camera'));
    $('#btn-gallery').addEventListener('click', pick('#file-gallery'));
    $('#btn-replace').addEventListener('click', pick('#file-gallery'));
    $('#btn-remove').addEventListener('click', () => { draft.photo = null; updateCreateUI(); });
    ['#file-camera', '#file-gallery'].forEach((sel) =>
      $(sel).addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        handleFile(file);
      })
    );
    const vf = $('#vf');
    vf.addEventListener('dragover', (e) => e.preventDefault());
    vf.addEventListener('drop', (e) => {
      e.preventDefault();
      handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    const caption = $('#caption');
    caption.addEventListener('input', updateCreateUI);
    caption.addEventListener('focus', () => setTimeout(() => caption.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300));
    $('#btn-publish').addEventListener('click', publish);

    // profile
    $('#btn-edit-profile').addEventListener('click', () => openProfileEditor());
    $('#profile-avatar').addEventListener('click', () => openProfileEditor());
    $('#btn-settings').addEventListener('click', openSettings);
    $('#file-avatar').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file || !avatarTarget) return;
      try {
        avatarTarget(await img.processAvatar(file));
      } catch (_) {
        toast('Couldn’t read that photo. Try another one.');
      }
    });
    $('#file-import').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) importFile(file);
    });

    // one delegated handler for every card, grid tile and detail view
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return onPhotoTap(e);
      const id = el.dataset.id || (el.closest('[data-post]') && el.closest('[data-post]').dataset.post);
      switch (el.dataset.action) {
        case 'like': toggleLike(id); break;
        case 'menu': openMenu(id); break;
        case 'open': openDetail(id); break;
        case 'more': {
          const text = el.previousElementSibling;
          if (text) text.classList.remove('is-clamped');
          el.remove();
          break;
        }
        default: break;
      }
    });

    // keep "2 hours ago" fresh
    setInterval(() => {
      $$('time.stamp[data-ts]').forEach((t) => { t.textContent = timeAgo(Number(t.dataset.ts)); });
    }, 60000);
  }

  function registerServiceWorker() {
    // The APK ships its files locally, so only plain-browser use needs a service worker.
    if (!('serviceWorker' in navigator) || native.isNative() || !/^https?:$/.test(location.protocol)) return;
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (local && !/[?&]sw=1\b/.test(location.search)) return; // keep dev reloads fresh; add ?sw=1 to test offline
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ------------------------------------------------------------------ boot */
  async function init() {
    applyTheme(savedTheme(), { persist: false });
    bind();
    initFeedObserver();

    await db.init();
    let profile = null;
    try { profile = await db.getMeta('profile'); } catch (_) { /* treated as first run */ }
    const firstRun = !profile;
    if (firstRun) {
      profile = { id: uid(), name: 'you', bio: 'Frames from my day, kept on this device.', avatar: null, createdAt: Date.now() };
      try { await db.setMeta('profile', profile); } catch (_) { /* surfaced on first publish */ }
    }
    state.profile = profile;

    try {
      state.posts = await db.listPosts();
    } catch (_) {
      state.posts = [];
      toast('Couldn’t load your posts.');
    }

    renderProfile();
    renderFeed();
    updateCreateUI();
    try { history.replaceState({ sheet: 0 }, '', location.hash || '#feed'); } catch (_) { /* file:// */ }
    setTab(location.hash.slice(1) || 'feed', { instant: true });

    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('fl-booting')));

    if (db.kind === 'memory') toast('Storage is unavailable here. Posts will be lost when you close the app.');
    else if (firstRun) setTimeout(() => openProfileEditor({ welcome: true }), 550);
    registerServiceWorker();
  }

  init().catch((err) => {
    console.error('[FrameLocal] failed to start', err);
    document.documentElement.classList.remove('fl-booting');
  });
})();
