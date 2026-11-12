/* Airmate · Módulo FICHAJE + VACACIONES
   Registro de jornada (entrada, pausa, salida) por empleado, informe mensual imprimible/CSV
   y calendario de ausencias con solicitud y aprobación.
   Los fichajes no se borran ni se editan: una corrección es un registro nuevo con motivo (trazabilidad).
   Uso:  AirmateFichaje.mount(document.getElementById('x'), { sb, slug, empleados:['Louie','Natalia'], usuario:'Natalia', esAdmin:true, negocio:'Divas Skin Care', cif:'' }) */
(function (w) {
  const AM = w.AirmateMod;
  const TIPOS = { entrada: 'Entrada', pausa_ini: 'Inicio pausa', pausa_fin: 'Fin pausa', salida: 'Salida' };
  const AUS = { vacaciones: 'Vacaciones', asuntos: 'Asuntos propios', baja: 'Baja médica', otro: 'Otro' };
  const hhmm = d => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dia = d => AM.diaLocal(d);
  const fmtMin = m => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;

  /* minutos trabajados en un día a partir de sus fichajes ordenados */
  function minutosDia(regs) {
    let tot = 0, desde = null, enPausa = false;
    regs.sort((a, b) => new Date(a.ts) - new Date(b.ts)).forEach(r => {
      const t = new Date(r.ts).getTime();
      if (r.tipo === 'entrada') { desde = t; enPausa = false; }
      else if (r.tipo === 'pausa_ini' && desde && !enPausa) { tot += t - desde; enPausa = true; desde = null; }
      else if (r.tipo === 'pausa_fin' && enPausa) { desde = t; enPausa = false; }
      else if (r.tipo === 'salida' && desde) { tot += t - desde; desde = null; }
    });
    return { min: tot / 60000, abierto: desde };
  }
  function estadoActual(regs) {
    const u = regs.sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];
    if (!u || u.tipo === 'salida') return 'fuera';
    return u.tipo === 'pausa_ini' ? 'pausa' : 'dentro';
  }

  async function mount(el, cfg) {
    const st = AM.store(cfg); const emps = cfg.empleados || [];
    let yo = cfg.usuario || emps[0] || ''; let mes = AM.hoy().slice(0, 7); let tick = null;
    el.classList.add('am');

    async function cargar() {
      const [fich, aus] = await Promise.all([st.list('fichajes', { order: 'ts', asc: true }), st.list('ausencias', { order: 'desde', asc: true })]);
      return { fich, aus };
    }
    async function fichar(tipo) {
      try {
        await st.insert('fichajes', { empleado: yo, tipo, ts: new Date().toISOString(), origen: 'panel', nota: null });
        AM.toast(`✓ ${TIPOS[tipo]} registrada · ${hhmm(new Date())}`); pintar();
      } catch (e) { AM.toast('No se pudo fichar: ' + e.message); }
    }
    // Fichaje olvidado: formulario en la misma tarjeta (sin ventanas del navegador)
    async function corregir() {
      const v = id => (el.querySelector(id)?.value || '').trim();
      const fecha = v('#am-c-fecha'), hora = v('#am-c-hora'), tipo = v('#am-c-tipo'), motivo = v('#am-c-motivo');
      if (!fecha || !hora) { AM.toast('Pon la fecha y la hora'); return; }
      if (!TIPOS[tipo]) { AM.toast('Elige el tipo'); return; }
      if (new Date(`${fecha}T${hora}:00`) > new Date()) { AM.toast('No se puede fichar en el futuro'); return; }
      if (!motivo) { AM.toast('Hace falta un motivo (queda registrado)'); return; }
      try { await st.insert('fichajes', { empleado: yo, tipo, ts: new Date(`${fecha}T${hora}:00`).toISOString(), origen: 'correccion', nota: motivo + ' · añadido por ' + (cfg.usuario || yo) + ' el ' + new Date().toLocaleString('es-ES') }); AM.toast('✓ Corrección registrada'); pintar(); }
      catch (e) { AM.toast('No se pudo guardar: ' + e.message); }
    }
    async function pedirAusencia() {
      const tipo = el.querySelector('#am-aus-tipo').value, desde = el.querySelector('#am-aus-desde').value, hasta = el.querySelector('#am-aus-hasta').value, nota = el.querySelector('#am-aus-nota').value.trim();
      if (!desde || !hasta || hasta < desde) { AM.toast('Revisa las fechas'); return; }
      const quien = el.querySelector('#am-aus-emp')?.value || yo;
      try { await st.insert('ausencias', { empleado: quien, tipo, desde, hasta, nota: nota || null, estado: cfg.esAdmin ? 'aprobada' : 'pendiente' }); AM.toast(cfg.esAdmin ? '✓ Ausencia guardada' : '✓ Solicitud enviada'); pintar(); }
      catch (e) { AM.toast('No se pudo guardar: ' + e.message); }
    }
    async function resolver(id, estado) { try { await st.update('ausencias', id, { estado }); AM.toast(estado === 'aprobada' ? '✓ Aprobada' : 'Rechazada'); pintar(); } catch (e) { AM.toast('Error: ' + e.message); } }

    function informe(fich, emp) {
      const delMes = fich.filter(f => f.empleado === emp && dia(f.ts).startsWith(mes));
      const porDia = {}; delMes.forEach(f => (porDia[dia(f.ts)] = porDia[dia(f.ts)] || []).push(f));
      const filas = Object.keys(porDia).sort().map(d => { const regs = porDia[d]; const { min } = minutosDia([...regs]);
        const ent = regs.filter(r => r.tipo === 'entrada').map(r => hhmm(r.ts)).join(', '), sal = regs.filter(r => r.tipo === 'salida').map(r => hhmm(r.ts)).join(', ');
        const corr = regs.some(r => r.origen === 'correccion'); return { d, ent, sal, min, corr }; });
      return { filas, total: filas.reduce((a, f) => a + f.min, 0) };
    }
    function imprimir(fich) {
      const emp = el.querySelector('#am-inf-emp').value; const { filas, total } = informe(fich, emp);
      AM.imprimir(`Registro de jornada ${emp} ${mes}`, `<h1>Registro diario de jornada</h1><div class="muted">${AM.esc(cfg.negocio || '')}${cfg.cif ? ' · CIF ' + AM.esc(cfg.cif) : ''} · Trabajador/a: <b>${AM.esc(emp)}</b> · Mes: <b>${mes}</b></div>
        <table><thead><tr><th>Día</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Obs.</th></tr></thead><tbody>${filas.map(f => `<tr><td>${f.d}</td><td>${f.ent || '—'}</td><td>${f.sal || '—'}</td><td>${fmtMin(f.min)}</td><td>${f.corr ? 'Incluye corrección' : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sin registros</td></tr>'}</tbody></table>
        <h2>Total del mes: ${fmtMin(total)}</h2><div class="firma"><div>Firma de la empresa</div><div>Firma del trabajador/a</div></div>
        <p class="muted" style="margin-top:20px">Registro conservado durante 4 años a disposición de la persona trabajadora, sus representantes y la Inspección de Trabajo.</p>`);
    }
    function csv(fich) {
      AM.csv(`fichajes-${mes}.csv`, ['Empleado', 'Fecha', 'Hora', 'Tipo', 'Origen', 'Nota'], fich.filter(f => dia(f.ts).startsWith(mes)).map(f => [f.empleado, dia(f.ts), hhmm(f.ts), TIPOS[f.tipo] || f.tipo, f.origen || '', f.nota || '']));
    }

    async function pintar() {
      let datos; try { datos = await cargar(); } catch (e) { el.innerHTML = `<div class="am-card">No se pudieron cargar los fichajes: ${AM.esc(e.message)}<br><small>¿Está creada la tabla? Ver schema.sql</small></div>`; return; }
      const { fich, aus } = datos;
      const mios = fich.filter(f => f.empleado === yo && dia(f.ts) === AM.hoy());
      const est = estadoActual([...mios]); const { min, abierto } = minutosDia([...mios]);
      const hoyAus = aus.filter(a => a.estado === 'aprobada' && a.desde <= AM.hoy() && a.hasta >= AM.hoy());
      const pend = aus.filter(a => a.estado === 'pendiente');
      const empInf = el.querySelector('#am-inf-emp')?.value || yo;
      const { filas, total } = informe(fich, empInf);
      el.innerHTML = `
      <div class="am-card">
        <div class="am-row" style="justify-content:space-between">
          <div><div class="am-h">Fichaje de hoy</div>
            ${emps.length > 1 ? `<select class="am-in" id="am-yo">${emps.map(e => `<option ${e === yo ? 'selected' : ''}>${AM.esc(e)}</option>`).join('')}</select>` : `<b id="am-yo-n" style="font-size:16px">${AM.esc(yo)}</b>`}</div>
          <div style="text-align:right"><div class="am-big" id="am-reloj">${fmtMin(min)}</div>
            <span class="am-tag ${est === 'dentro' ? 'am-ok' : est === 'pausa' ? 'am-pen' : 'am-ko'}">${est === 'dentro' ? '● Trabajando' : est === 'pausa' ? '⏸ En pausa' : 'Fuera'}</span></div>
        </div>
        <div class="am-row" style="margin-top:14px">
          ${est === 'fuera' ? `<button class="am-btn pri" data-f="entrada">▶ Fichar entrada</button>` : ''}
          ${est === 'dentro' ? `<button class="am-btn" data-f="pausa_ini">⏸ Pausa</button><button class="am-btn pri" data-f="salida">■ Fichar salida</button>` : ''}
          ${est === 'pausa' ? `<button class="am-btn pri" data-f="pausa_fin">▶ Volver de la pausa</button>` : ''}
          <button class="am-btn" id="am-corr">＋ Fichaje olvidado</button>
        </div>
        <div id="am-corr-f" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border2,#f0ece4)">
          <div class="am-row"><input class="am-in" type="date" id="am-c-fecha" value="${AM.hoy()}" max="${AM.hoy()}"><input class="am-in" type="time" id="am-c-hora" value="09:00">
            <select class="am-in" id="am-c-tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
            <input class="am-in" id="am-c-motivo" placeholder="Motivo (obligatorio)" style="flex:1;min-width:160px"><button class="am-btn pri" id="am-c-ok">Guardar</button></div>
          <div style="font-size:12px;color:var(--txt3,#8a857c);margin-top:6px">Los fichajes no se borran ni se editan: la corrección queda como un registro nuevo con su motivo.</div>
        </div>
        ${mios.length ? `<div style="margin-top:12px;font-size:13px;color:var(--txt3,#8a857c)">${mios.map(r => `${TIPOS[r.tipo]} ${hhmm(r.ts)}${r.origen === 'correccion' ? ' (corrección)' : ''}`).join(' · ')}</div>` : ''}
        ${hoyAus.length ? `<div style="margin-top:10px;font-size:13px">🌴 Hoy fuera: ${hoyAus.map(a => AM.esc(a.empleado) + ' (' + AUS[a.tipo] + ')').join(', ')}</div>` : ''}
      </div>
      <div class="am-card">
        <div class="am-row" style="justify-content:space-between"><div class="am-h" style="margin:0">Informe mensual</div>
          <div class="am-row"><select class="am-in" id="am-inf-emp">${emps.map(e => `<option ${e === empInf ? 'selected' : ''}>${AM.esc(e)}</option>`).join('')}</select><input class="am-in" type="month" id="am-mes" value="${mes}">
          <button class="am-btn" id="am-pdf">🖨 Imprimir / PDF</button><button class="am-btn" id="am-csv">⬇ CSV</button></div></div>
        <table class="am-t" style="margin-top:10px"><thead><tr><th>Día</th><th>Entrada</th><th>Salida</th><th>Horas</th><th></th></tr></thead><tbody>
          ${filas.map(f => `<tr><td>${f.d}</td><td>${f.ent || '—'}</td><td>${f.sal || '—'}</td><td><b>${fmtMin(f.min)}</b></td><td>${f.corr ? '<span class="am-tag am-pen">corrección</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" style="color:#999">Sin fichajes este mes</td></tr>'}
        </tbody></table><div style="text-align:right;margin-top:8px;font-weight:900">Total: ${fmtMin(total)}</div>
      </div>
      <div class="am-card">
        <div class="am-h">Vacaciones y ausencias</div>
        <div class="am-row">${cfg.esAdmin && emps.length > 1 ? `<select class="am-in" id="am-aus-emp">${emps.map(e => `<option ${e === yo ? 'selected' : ''}>${AM.esc(e)}</option>`).join('')}</select>` : ''}<select class="am-in" id="am-aus-tipo">${Object.entries(AUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <input class="am-in" type="date" id="am-aus-desde"><input class="am-in" type="date" id="am-aus-hasta"><input class="am-in" id="am-aus-nota" placeholder="Nota (opcional)" style="flex:1;min-width:140px">
          <button class="am-btn pri" id="am-aus-ok">${cfg.esAdmin ? 'Guardar' : 'Solicitar'}</button></div>
        ${pend.length && cfg.esAdmin ? `<div style="margin-top:14px"><div class="am-h">Pendientes de aprobar</div>${pend.map(a => `<div class="am-row" style="padding:8px 0;border-bottom:1px solid var(--border2,#f0ece4)"><b>${AM.esc(a.empleado)}</b> ${AUS[a.tipo]} · ${a.desde} → ${a.hasta}${a.nota ? ' · ' + AM.esc(a.nota) : ''}<span style="margin-left:auto"></span><button class="am-btn pri" data-ap="${a.id}">Aprobar</button><button class="am-btn dan" data-re="${a.id}">Rechazar</button></div>`).join('')}</div>` : ''}
        <table class="am-t" style="margin-top:12px"><thead><tr><th>Persona</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Estado</th></tr></thead><tbody>
          ${aus.filter(a => a.hasta >= AM.hoy()).map(a => `<tr><td>${AM.esc(a.empleado)}</td><td>${AUS[a.tipo]}</td><td>${a.desde}</td><td>${a.hasta}</td><td><span class="am-tag ${a.estado === 'aprobada' ? 'am-ok' : a.estado === 'pendiente' ? 'am-pen' : 'am-ko'}">${a.estado}</span></td></tr>`).join('') || '<tr><td colspan="5" style="color:#999">No hay ausencias próximas</td></tr>'}
        </tbody></table>
      </div>`;
      const selYo = el.querySelector('#am-yo'); if (selYo) selYo.onchange = e => { yo = e.target.value; pintar(); };
      el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => fichar(b.dataset.f));
      el.querySelector('#am-corr').onclick = () => { const f = el.querySelector('#am-corr-f'); f.style.display = f.style.display === 'none' ? '' : 'none'; };
      el.querySelector('#am-c-ok').onclick = corregir;
      el.querySelector('#am-inf-emp').onchange = () => pintar();
      el.querySelector('#am-mes').onchange = e => { mes = e.target.value; pintar(); };
      el.querySelector('#am-pdf').onclick = () => imprimir(fich);
      el.querySelector('#am-csv').onclick = () => csv(fich);
      el.querySelector('#am-aus-ok').onclick = pedirAusencia;
      el.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => resolver(b.dataset.ap, 'aprobada'));
      el.querySelectorAll('[data-re]').forEach(b => b.onclick = () => resolver(b.dataset.re, 'rechazada'));
      clearInterval(tick); if (abierto) { const base = min; const t0 = Date.now(); tick = setInterval(() => { const r = el.querySelector('#am-reloj'); if (!r) return clearInterval(tick); r.textContent = fmtMin(base + (Date.now() - t0) / 60000); }, 30000); }
    }
    await pintar();
    return { recargar: pintar };
  }

  /* Para la agenda: ¿está de ausencia esta persona ese día? */
  async function ausente(cfg, empleado, fecha) {
    const aus = await AM.store(cfg).list('ausencias', { order: 'desde', asc: true });
    return aus.some(a => a.empleado === empleado && a.estado === 'aprobada' && a.desde <= fecha && a.hasta >= fecha);
  }

  w.AirmateFichaje = { mount, ausente, minutosDia };
})(window);
