/* Divas Skin Care · plantillas de tarjeta regalo (web y página de descarga) */
window.DIVAS_REGALO = {
  plantillas: {
    cumple:  { nombre: 'Cumpleaños',      icono: '🎂', titulo: '¡Feliz cumpleaños!',        sub: 'Un regalo para brillar todavía más', fondo: 'linear-gradient(135deg,#f6dfe3 0%,#fbf3ea 55%,#efd6b8 100%)', tinta: '#5a3a3f', acento: '#bc916a', deco: '🎈 ✨ 🎂' },
    madre:   { nombre: 'Día de la Madre', icono: '💐', titulo: 'Feliz Día de la Madre',     sub: 'Porque tú también mereces cuidarte',  fondo: 'linear-gradient(135deg,#fbeef0 0%,#f2f2e8 50%,#dce5d1 100%)', tinta: '#4a3b3f', acento: '#c48a96', deco: '🌸 💐 🌸' },
    padre:   { nombre: 'Día del Padre',   icono: '🤍', titulo: 'Feliz Día del Padre',       sub: 'Un momento solo para él',             fondo: 'linear-gradient(135deg,#e6ebee 0%,#f2f2e8 55%,#d9d2c5 100%)', tinta: '#2f3a40', acento: '#6f8796', deco: '🤍 ✦ 🤍' },
    navidad: { nombre: 'Navidad',         icono: '🎄', titulo: 'Feliz Navidad',             sub: 'El regalo más bonito: cuidarse',      fondo: 'linear-gradient(135deg,#2f4a3a 0%,#3d5a45 55%,#6e2f2f 100%)', tinta: '#fbf6ec', acento: '#e6c88a', deco: '✦ 🎄 ✦' },
    reyes:   { nombre: 'Reyes',           icono: '👑', titulo: 'Los Reyes Magos te traen…', sub: 'un momento Divas',                    fondo: 'linear-gradient(135deg,#1f2a44 0%,#33406a 55%,#7a5a2a 100%)', tinta: '#fbf6ec', acento: '#e9c46a', deco: '⭐ 👑 ⭐' },
    detalle: { nombre: 'Un detalle',      icono: '✨', titulo: 'Un detalle para ti',        sub: 'Con mucho cariño',                    fondo: 'linear-gradient(135deg,#dce5d1 0%,#f2f2e8 55%,#e9dcc8 100%)', tinta: '#3d4a3a', acento: '#bc916a', deco: '✨ 🌿 ✨' }
  },
  esc(t) { return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  euros(n) { n = Number(n) || 0; return (Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')) + ' €'; },
  // d = { plantilla, para, de, mensaje, que (texto del regalo), codigo, caduca }
  html(d, logo) {
    const p = this.plantillas[d.plantilla] || this.plantillas.detalle, e = this.esc.bind(this);
    return `<div class="dr-card" style="--f:${p.fondo};--t:${p.tinta};--a:${p.acento}">
      <div class="dr-deco">${p.deco}</div>
      <div class="dr-top"><img src="${logo || 'img/logo-divas-silueta.jpeg'}" alt="" crossorigin="anonymous"><div><b>Divas Skin Care</b><small>by Louie · Centro de belleza</small></div></div>
      <div class="dr-tit">${e(p.titulo)}</div>
      <div class="dr-sub">${e(p.sub)}</div>
      ${d.para ? `<div class="dr-para">Para <b>${e(d.para)}</b></div>` : ''}
      <div class="dr-que">${e(d.que || '')}</div>
      ${d.mensaje ? `<div class="dr-msg">«${e(d.mensaje)}»</div>` : ''}
      ${d.de ? `<div class="dr-de">De parte de <b>${e(d.de)}</b></div>` : ''}
      <div class="dr-pie"><div><small>Código</small><b>${e(d.codigo || 'DIVAS-XXXX-XXXX')}</b></div><div style="text-align:right"><small>Válida hasta</small><b>${d.caduca ? new Date(d.caduca + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '4 meses'}</b></div></div>
      <div class="dr-info">Reserva por WhatsApp o en divasskincare.com y presenta este código · Calle Arguijón 1, La Laguna</div>
    </div>`;
  },
  css: `.dr-card{position:relative;width:100%;aspect-ratio:1.6/1;border-radius:22px;padding:5.2% 6%;background:var(--f);color:var(--t);font-family:'Cormorant Garamond',Georgia,serif;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.18);display:flex;flex-direction:column;container-type:inline-size}
  .dr-card::after{content:'';position:absolute;inset:3.2%;border:1.5px solid var(--a);border-radius:16px;opacity:.55;pointer-events:none}
  .dr-deco{position:absolute;right:6%;top:6%;font-size:3.4cqw;letter-spacing:.4em;opacity:.9}
  .dr-top{display:flex;align-items:center;gap:2.2cqw}.dr-top img{width:7cqw;height:7cqw;border-radius:50%;object-fit:cover;border:1px solid var(--a)}
  .dr-top b{display:block;font-size:2.9cqw;letter-spacing:.06em}.dr-top small{display:block;font-family:Inter,system-ui,sans-serif;font-size:1.5cqw;letter-spacing:.18em;text-transform:uppercase;opacity:.75}
  .dr-tit{font-size:7.4cqw;font-weight:500;font-style:italic;line-height:1;margin-top:4.5%}
  .dr-sub{font-family:Inter,system-ui,sans-serif;font-size:1.9cqw;letter-spacing:.14em;text-transform:uppercase;color:var(--a);margin-top:1.4%}
  .dr-para{font-size:2.8cqw;margin-top:3.4%}
  .dr-que{font-size:4.1cqw;font-weight:600;line-height:1.1;margin-top:1%}
  .dr-msg{font-size:2.5cqw;font-style:italic;opacity:.9;margin-top:1.6%;max-width:85%}
  .dr-de{font-size:2.3cqw;margin-top:1%}
  .dr-pie{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-family:Inter,system-ui,sans-serif}
  .dr-pie small{display:block;font-size:1.4cqw;letter-spacing:.18em;text-transform:uppercase;opacity:.7}.dr-pie b{font-size:2.6cqw;letter-spacing:.08em}
  .dr-info{font-family:Inter,system-ui,sans-serif;font-size:1.35cqw;opacity:.7;margin-top:1.4%}`
};
