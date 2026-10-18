/* Divas Skin Care · plantillas de tarjeta regalo (web, página de descarga y panel).
   Sin emojis: cada ocasión tiene su paleta y un adorno dibujado en línea fina (SVG). */
(function () {
  const L = 'fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"';
  const ORN = {
    // ramas y flores en línea, estilo grabado
    cumple: `<svg viewBox="0 0 200 200" ${L}><path d="M100 188V96"/><path d="M100 150c-18-6-30-20-32-38 16 2 28 14 32 30"/><path d="M100 128c16-6 28-18 30-34-15 2-26 13-30 28"/><circle cx="100" cy="70" r="22"/><path d="M100 48c-6-14-2-26 10-34M100 48c8-10 20-12 30-6"/><path d="M78 70h44M100 48v44M84 54l32 32M116 54L84 86"/><circle cx="52" cy="40" r="3"/><circle cx="158" cy="56" r="2.4"/><circle cx="146" cy="24" r="1.8"/><circle cx="40" cy="92" r="1.8"/></svg>`,
    madre: `<svg viewBox="0 0 200 200" ${L}><path d="M100 190c0-40 2-80 0-110"/><path d="M100 120c-22-4-38-18-42-40 20 0 36 14 42 34"/><path d="M100 104c20-6 34-20 36-40-19 2-33 15-36 34"/><path d="M100 80c-14-10-16-28-6-40 4 14 10 26 6 40z"/><path d="M100 80c14-10 16-28 6-40-4 14-10 26-6 40z"/><path d="M100 80c-4-16 0-32 0-46 0 14 4 30 0 46z"/><path d="M62 150c-14-2-24-12-26-26 12 2 22 10 26 22M138 150c14-2 24-12 26-26-12 2-22 10-26 22"/></svg>`,
    padre: `<svg viewBox="0 0 200 200" ${L}><path d="M30 140h140"/><path d="M42 140l20-52 22 30 16-44 20 38 18-26 22 54"/><path d="M58 98l6 6 6-8M98 76l6 8 6-10M136 104l6 6"/><circle cx="150" cy="50" r="14"/><path d="M150 26v-8M150 82v-8M126 50h-8M182 50h-8M133 33l-5-5M167 33l5-5"/></svg>`,
    navidad: `<svg viewBox="0 0 200 200" ${L}><path d="M100 28l-30 44h14l-30 40h16l-34 46h128l-34-46h16l-30-40h14z"/><path d="M100 158v20M88 178h24"/><path d="M100 14l2.6 6.4 6.4 2.6-6.4 2.6L100 32l-2.6-6.4-6.4-2.6 6.4-2.6z"/><circle cx="86" cy="96" r="2.4"/><circle cx="116" cy="124" r="2.4"/><circle cx="80" cy="140" r="2.4"/><circle cx="124" cy="146" r="2.4"/><circle cx="106" cy="76" r="2"/></svg>`,
    reyes: `<svg viewBox="0 0 200 200" ${L}><path d="M46 132l-8-62 34 30 28-46 28 46 34-30-8 62z"/><path d="M50 146h100M54 132h92"/><circle cx="38" cy="66" r="5"/><circle cx="100" cy="50" r="5"/><circle cx="162" cy="66" r="5"/><path d="M100 22v10M95 27h10M150 22l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>`,
    detalle: `<svg viewBox="0 0 200 200" ${L}><path d="M100 186c-2-50 4-100 0-150"/><path d="M100 150c-24-2-40-16-44-36 22 0 38 14 44 34M100 116c22-4 36-18 38-38-20 2-34 16-38 36M100 84c-18-4-30-16-32-32 17 1 29 12 32 28M100 60c14-6 22-16 22-30-13 3-21 12-22 26"/><circle cx="148" cy="40" r="2"/><circle cx="54" cy="70" r="1.6"/></svg>`
  };
  const P = {
    cumple:  { nombre: 'Cumpleaños',      titulo: 'Feliz cumpleaños', sub: 'Un regalo para brillar todavía más',  bg: '#f4e6e3', bg2: '#ecd3cd', tinta: '#4d3236', acento: '#a8695f' },
    madre:   { nombre: 'Día de la Madre', titulo: 'Para ti, mamá',    sub: 'Porque tú también mereces cuidarte',   bg: '#f1ece4', bg2: '#e2d8ca', tinta: '#3f3a33', acento: '#9b7b5b' },
    padre:   { nombre: 'Día del Padre',   titulo: 'Para ti, papá',    sub: 'Un momento solo para él',              bg: '#e5e8e6', bg2: '#d3d9d6', tinta: '#2d3836', acento: '#5f7a74' },
    navidad: { nombre: 'Navidad',         titulo: 'Feliz Navidad',    sub: 'El regalo más bonito: cuidarse',       bg: '#2f3d31', bg2: '#243026', tinta: '#f3ecdc', acento: '#c9a96e' },
    reyes:   { nombre: 'Reyes',           titulo: 'De parte de los Reyes', sub: 'Un momento Divas',                bg: '#222a3d', bg2: '#1a2131', tinta: '#f3ecdc', acento: '#cdaa64' },
    detalle: { nombre: 'Un detalle',      titulo: 'Un regalo para ti', sub: 'Con mucho cariño',                    bg: '#e3e8db', bg2: '#d2dbc6', tinta: '#2f3a2c', acento: '#8a6f4e' }
  };
  Object.keys(P).forEach(k => { P[k].icono = ''; P[k].orn = ORN[k]; });
  window.DIVAS_REGALO = {
    plantillas: P,
    esc(t) { return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    euros(n) { n = Number(n) || 0; return (Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')) + ' €'; },
    // d = { plantilla, para, de, mensaje, que, codigo, caduca }
    html(d, logo) {
      const p = P[d.plantilla] || P.detalle, e = this.esc.bind(this);
      const cad = d.caduca ? new Date(d.caduca + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '4 meses desde la compra';
      return `<div class="dr-card" style="--bg:${p.bg};--bg2:${p.bg2};--t:${p.tinta};--a:${p.acento}">
        <div class="dr-grain"></div><div class="dr-orn">${p.orn}</div>
        <div class="dr-top"><img src="${logo || 'img/logo-divas-silueta.jpeg'}" alt="" crossorigin="anonymous"><div><b>Divas Skin Care</b><small>by Louie · La Laguna</small></div><span class="dr-tag">Tarjeta regalo</span></div>
        <div class="dr-body">
          <div class="dr-sub">${e(p.sub)}</div>
          <div class="dr-tit">${e(p.titulo)}</div>
          <div class="dr-rule"></div>
          ${d.para ? `<div class="dr-para">Para <b>${e(d.para)}</b></div>` : ''}
          <div class="dr-que">${e(d.que || '')}</div>
          ${d.mensaje ? `<div class="dr-msg">«${e(d.mensaje)}»</div>` : ''}
          ${d.de ? `<div class="dr-de">— ${e(d.de)}</div>` : ''}
        </div>
        <div class="dr-pie"><div><small>Código</small><b>${e(d.codigo || 'DIVAS · · · ·')}</b></div><div class="r"><small>Válida hasta</small><b>${e(cad)}</b></div></div>
      </div>`;
    },
    css: `.dr-card{position:relative;width:100%;aspect-ratio:1.6/1;border-radius:20px;padding:5.6% 6.4%;color:var(--t);font-family:'Cormorant Garamond',Georgia,serif;overflow:hidden;
      background:radial-gradient(120% 90% at 85% 10%,var(--bg) 0%,var(--bg2) 100%);box-shadow:0 1px 0 rgba(255,255,255,.4) inset,0 40px 80px -30px rgba(40,30,20,.45),0 12px 24px -12px rgba(40,30,20,.25);display:flex;flex-direction:column;container-type:inline-size}
    .dr-card::after{content:'';position:absolute;inset:3.4%;border:1px solid var(--a);border-radius:13px;opacity:.38;pointer-events:none}
    .dr-grain{position:absolute;inset:0;opacity:.18;mix-blend-mode:multiply;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .5 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}
    .dr-orn{position:absolute;right:5%;top:20%;width:30%;color:var(--a);opacity:.5;pointer-events:none}.dr-orn svg{width:100%;height:auto;display:block}
    .dr-top{position:relative;display:flex;align-items:center;gap:2.2cqw}.dr-top img{width:6.2cqw;height:6.2cqw;border-radius:50%;object-fit:cover;border:1px solid var(--a)}
    .dr-top b{display:block;font-size:2.7cqw;font-weight:600;letter-spacing:.04em}.dr-top small{display:block;font-family:Inter,system-ui,sans-serif;font-size:1.35cqw;letter-spacing:.2em;text-transform:uppercase;opacity:.65}
    .dr-tag{margin-left:auto;font-family:Inter,system-ui,sans-serif;font-size:1.3cqw;letter-spacing:.28em;text-transform:uppercase;color:var(--a);border:1px solid var(--a);border-radius:99px;padding:.7cqw 1.8cqw;opacity:.9}
    .dr-body{position:relative;margin-top:5%;max-width:64%}
    .dr-sub{font-family:Inter,system-ui,sans-serif;font-size:1.45cqw;letter-spacing:.24em;text-transform:uppercase;color:var(--a)}
    .dr-tit{font-size:7cqw;font-weight:500;font-style:italic;line-height:.98;margin-top:1.4%;letter-spacing:-.01em}
    .dr-rule{width:9cqw;height:1px;background:var(--a);margin:3% 0 2.4%;opacity:.8}
    .dr-para{font-size:2.5cqw}.dr-para b{font-weight:600}
    .dr-que{font-size:3.6cqw;font-weight:600;line-height:1.12;margin-top:.6%}
    .dr-msg{font-size:2.3cqw;font-style:italic;opacity:.85;margin-top:1.6%;line-height:1.3}
    .dr-de{font-size:2.2cqw;margin-top:1%;opacity:.9}
    .dr-pie{position:relative;margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-family:Inter,system-ui,sans-serif}.dr-pie .r{text-align:right}
    .dr-pie small{display:block;font-size:1.25cqw;letter-spacing:.24em;text-transform:uppercase;opacity:.6;margin-bottom:.4cqw}.dr-pie b{font-size:2.3cqw;letter-spacing:.12em;font-weight:600}`
  };
})();
