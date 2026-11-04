(() => {
  const DB_KEY = 'ritmo-workspace-v1';
  const DEMO_PREFIX = 'ritmo-';
  const emptyState = () => ({ workouts: [], logs: [], plan: null });
  const readState = key => {
    try { return { ...emptyState(), ...JSON.parse(localStorage.getItem(key) || '{}') }; }
    catch { return emptyState(); }
  };
  let activeKey = DB_KEY;
  let state = readState(activeKey);
  let supabase = null;
  let user = null;
  let savingRemote = false;
  let currentPage = 'Resumen';
  let pendingSkipId = null;
  let editingWorkoutId = null;
  const $ = id => document.getElementById(id);
  const toast = $('toast');
  const modal = $('modal');
  let toastTimer;

  function note(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }
  function openModal(title, text, confirm, confirmLabel = 'Entendido', cancelLabel = 'Ahora no') {
    $('modalTitle').textContent = title;
    $('modalText').textContent = text;
    $('confirmModal').textContent = confirmLabel;
    $('cancelModal').textContent = cancelLabel;
    $('confirmModal').onclick = () => { closeModal(); confirm?.(); };
    modal.classList.add('open');
  }
  function closeModal() { modal.classList.remove('open'); pendingSkipId = null; }
  function save() {
    localStorage.setItem(activeKey, JSON.stringify(state));
    updateDashboard();
    if (supabase && user) void syncRemote();
  }
  function formatDate(date, opts = { day: 'numeric', month: 'short' }) {
    if (!date) return '—';
    return new Intl.DateTimeFormat('es-ES', opts).format(new Date(`${date}T12:00:00`));
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function durationSeconds(value) {
    if (!value) return null;
    const parts = String(value).trim().split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  function durationLabel(seconds) {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  function paceLabel(seconds, km) {
    if (!seconds || !km) return '—';
    const pace = Math.round(seconds / km);
    return `${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')}`;
  }
  function weekStart(date = new Date()) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const days = (start.getDay() + 6) % 7; start.setDate(start.getDate() - days); return start;
  }
  function workoutsThisWeek() {
    const start = weekStart();
    return state.workouts.filter(w => {
      const date = new Date(`${w.date || todayISO()}T12:00:00`);
      return date >= start && date < new Date(start.getTime() + 7 * 86400000);
    });
  }
  function updateDashboard() {
    const list = workoutsThisWeek();
    const km = list.reduce((sum, w) => sum + (Number(w.distance) || 0), 0);
    const seconds = list.reduce((sum, w) => sum + (durationSeconds(w.duration) || 0), 0);
    const load = list.reduce((sum, w) => sum + (Number(w.distance) || 0) * (Number(w.effort) || 0), 0);
    $('weekDistance').innerHTML = `${km.toFixed(1).replace('.', ',')} <span style="font-size:12px;font-weight:500">km</span>`;
    $('weekDistanceFoot').textContent = list.length ? `${list.length} sesión${list.length === 1 ? '' : 'es'} desde el lunes` : 'Añade o importa una sesión';
    $('weekDuration').innerHTML = `${Math.round(seconds / 60)} <span style="font-size:12px;font-weight:500">min</span>`;
    $('weekSessions').textContent = `En ${list.length} sesión${list.length === 1 ? '' : 'es'} esta semana`;
    $('weekLoad').innerHTML = `${Math.round(load)} <span style="font-size:12px;font-weight:500">· ${load ? load < 300 ? 'suave' : load < 700 ? 'moderada' : 'alta' : 'sin datos'}</span>`;
    $('weekPace').innerHTML = `${paceLabel(seconds, km)} <span style="font-size:12px;font-weight:500">/km</span>`;
    renderRecent(); renderRecovery(); renderPlanBanner();
  }
  function renderRecent() {
    const recent = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    $('activities').innerHTML = recent.length ? recent.map(w => {
      const seconds = durationSeconds(w.duration);
      return `<div class="activity-row"><div class="activity-mark">${w.source?.includes('Polar') ? '⌁' : '🏃'}</div><div class="activity-info"><b>${esc(w.title || 'Entrenamiento')} <span class="tag">${esc(w.source || 'Manual')}</span></b><small>${formatDate(w.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(w.type || 'Carrera')}</small></div><div class="activity-data">${Number(w.distance || 0).toFixed(1)} km<small>${durationLabel(seconds)} · ${paceLabel(seconds, Number(w.distance))} /km</small></div></div>`;
    }).join('') : '<div class="hint">Todavía no hay sesiones. Añade una manualmente o importa un archivo exportado de Polar Flow.</div>';
  }
  function renderRecovery() {
    const log = state.logs.find(item => item.date === todayISO()) || [...state.logs].sort((a,b) => b.date.localeCompare(a.date))[0];
    if (!log) { $('sleepSummary').textContent = 'Sin datos de sueño'; $('sleepQuality').textContent = '—'; $('carbValue').innerHTML = '<button id="carbLog">＋ Registrar</button>'; $('feelLog').textContent = '＋ Registrar'; bindRecoveryLinks(); return; }
    const hours = Number(log.sleep || 0);
    $('sleepSummary').textContent = hours ? `${Math.floor(hours)} h ${String(Math.round((hours % 1) * 60)).padStart(2, '0')} min` : 'Sueño sin indicar';
    $('sleepQuality').textContent = hours >= 7.5 ? 'Buena' : hours >= 6 ? 'Media' : 'Baja';
    $('carbValue').textContent = log.carbs || 'Sin indicar';
    $('feelLog').textContent = log.energy || 'Sin indicar';
    bindRecoveryLinks();
  }
  function bindRecoveryLinks() {
    $('carbLog').onclick = () => renderPage('Progreso');
    $('feelLog').onclick = () => renderPage('Progreso');
    $('logData').onclick = event => { event.preventDefault(); renderPage('Progreso'); };
  }
  function renderPlanBanner() {
    const plan = state.plan;
    if (!plan) { $('planBannerTitle').textContent = 'Cada sesión cuenta.'; $('planBannerText').textContent = 'Crea un calendario para tu próxima carrera.'; $('seePlan').textContent = 'Crear mi plan →'; $('nextSessionTitle').textContent = 'Aún no hay sesiones'; $('nextSessionDetail').textContent = 'Elige tu carrera para empezar.'; $('sidePlanTitle').textContent='Sin carrera objetivo'; $('sidePlanSummary').innerHTML='Crea tu calendario de prueba<br>desde “Mi plan”.'; $('sidePlanProgress').style.width='0%'; return; }
    $('planBannerTitle').textContent = `${plan.distance || 'Tu carrera'} · ${formatDate(plan.race)}`;
    $('planBannerText').textContent = `${plan.sessions?.length || 0} sesiones preparadas · ${plan.days} días por semana`;
    $('seePlan').textContent = 'Ver mi calendario →';
    $('sidePlanTitle').textContent=`${plan.distance||'Carrera'} · ${formatDate(plan.race)}`;
    $('sidePlanSummary').innerHTML=`${plan.weeks||0} semanas · ${plan.sessions?.length||0} sesiones<br>Objetivo · ${esc(plan.goal||'Sin indicar')}`;
    const completed=(plan.sessions||[]).filter(s=>s.status==='completed').length;$('sidePlanProgress').style.width=`${plan.sessions?.length?Math.round(completed/plan.sessions.length*100):0}%`;
    const next = (plan.sessions || []).filter(s => s.status === 'planned').sort((a,b) => a.date.localeCompare(b.date))[0];
    $('nextSessionTitle').textContent = next?.title || 'Plan completado';
    $('nextSessionDetail').textContent = next ? `${formatDate(next.date)} · ${next.distance} km` : 'No quedan sesiones pendientes.';
  }
  function pageHeader(title, description) { return `<div class="page-title"><h1>${title}</h1><p>${description}</p></div>`; }
  function panel(title, body, sub = '') { return `<article class="panel"><div class="panel-head"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>${body}</article>`; }
  function renderWorkoutList() {
    if (!state.workouts.length) return '<div class="hint">Aún no tienes sesiones. Añade un entrenamiento o importa un archivo TCX, GPX o CSV desde Polar Flow.</div>';
    return `<div class="workout-list">${[...state.workouts].sort((a,b) => b.date.localeCompare(a.date)).map(w => `<div class="workout-card"><div><b>${esc(w.title)} · ${Number(w.distance || 0).toFixed(1)} km</b><small>${formatDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${esc(w.type)} · ${durationLabel(durationSeconds(w.duration))} · Esfuerzo ${esc(w.effort || '—')}/10 · ${esc(w.source || 'Manual')}</small>${w.notes ? `<small>${esc(w.notes)}</small>` : ''}</div><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><button class="select" type="button" data-analyze-workout="${esc(w.id)}">Analizar</button><button class="select" type="button" data-edit-workout="${esc(w.id)}">Editar</button><button class="select" type="button" data-delete-workout="${esc(w.id)}">Borrar</button></div></div>`).join('')}</div>`;
  }
  function renderPage(page) {
    currentPage = page;
    document.querySelector('.crumb').innerHTML = `Mi espacio <span style="color:#c2c8c1"> / </span> <b style="color:#556159">${esc(page)}</b>`;
    const home = page === 'Resumen';
    $('dashboardCards').classList.toggle('hidden', !home); $('dashboardLayout').classList.toggle('hidden', !home);
    document.querySelector('main > .hello').classList.toggle('hidden', !home);
    document.querySelector('main > div[style*="text-align:center"]')?.classList.toggle('hidden', !home);
    $('coachPanel').classList.toggle('hidden', !home); $('dynamicView').classList.toggle('hidden', home);
    if (home) { updateDashboard(); return; }
    const target = $('dynamicView');
    if (page === 'Entrenamientos') renderWorkoutsPage(target);
    if (page === 'Progreso') renderProgressPage(target);
    if (page === 'Mi plan') renderPlanPage(target);
    if (page === 'Ajustes') renderSettingsPage(target);
  }
  function renderWorkoutsPage(target) {
    target.innerHTML = `<div class="workspace">${pageHeader('Entrenamientos', 'Registra tus sesiones o importa un archivo exportado desde Polar Flow.')}${panel('Añadir entrenamiento', `<form id="workoutForm" class="form-grid"><div class="field"><label for="wTitle">Nombre</label><input id="wTitle" name="title" placeholder="Rodaje suave" required></div><div class="field"><label for="wType">Tipo</label><select id="wType" name="type"><option>Rodaje fácil</option><option>Series</option><option>Tempo</option><option>Tirada larga</option><option>Fuerza</option><option>Bici</option><option>Carrera</option><option>TCX importado</option><option>GPX importado</option><option>CSV importado</option><option>Otro</option></select></div><div class="field"><label for="wDate">Fecha</label><input id="wDate" name="date" type="date" value="${todayISO()}" required></div><div class="field"><label for="wDistance">Distancia (km)</label><input id="wDistance" name="distance" type="number" min="0" step="0.01" placeholder="8.0" required></div><div class="field"><label for="wDuration">Duración (mm:ss o hh:mm:ss)</label><input id="wDuration" name="duration" placeholder="46:30"></div><div class="field"><label for="wEffort">Esfuerzo percibido (1–10)</label><input id="wEffort" name="effort" type="number" min="1" max="10" value="5"></div><div class="field full"><label for="wNotes">Notas o sensaciones</label><textarea id="wNotes" name="notes" placeholder="Cómo te has encontrado, clima, sensaciones…"></textarea></div><div class="field full form-actions"><button class="button" type="submit">Guardar entrenamiento</button><button class="button light" type="button" id="polarHelp">Cómo probar Polar</button><label class="button light" for="importFile">Importar TCX, GPX o CSV</label><input id="importFile" class="hidden" type="file" accept=".tcx,.gpx,.csv,text/xml,text/csv"></div></form><div class="sub" style="margin-top:12px">Los archivos se leen en este navegador y sus resúmenes se guardan en este dispositivo.</div>`)}${panel('Tu histórico', renderWorkoutList(), `${state.workouts.length} sesiones guardadas`)}<section id="workoutAnalysis" class="panel hidden" aria-live="polite" style="margin-top:15px"></section><div class="hint">Polar Flow permite exportar sesiones en GPX, TCX o CSV desde su web. La conexión automática de la cuenta se añadirá al configurar AccessLink.</div></div>`;
    $('workoutForm').onsubmit = event => { event.preventDefault(); const workout = Object.fromEntries(new FormData(event.currentTarget).entries()); const old = editingWorkoutId ? state.workouts.find(w=>w.id===editingWorkoutId) : null; workout.id = old?.id || crypto.randomUUID(); workout.source = old?.source || 'Manual'; if(old)state.workouts=state.workouts.map(w=>w.id===old.id?workout:w);else state.workouts.push(workout); editingWorkoutId=null; save(); renderWorkoutsPage(target); note(old?'Entrenamiento actualizado.':'Entrenamiento guardado.'); };
    $('importFile').onchange = event => importFiles(event.target.files);
    $('polarHelp').onclick = () => openModal('Prueba tus datos de Polar', 'En Polar Flow web abre el diario, selecciona una sesión y usa Exportar. Elige TCX para incluir métricas, GPX para recorrido o CSV para una tabla de resumen. Después importa el archivo aquí.', () => note('Cuando tengas el archivo, usa “Importar TCX, GPX o CSV”.'));
    target.onclick = event => { const analyzeId=event.target.closest('[data-analyze-workout]')?.dataset.analyzeWorkout; const deleteId = event.target.closest('[data-delete-workout]')?.dataset.deleteWorkout; const editId=event.target.closest('[data-edit-workout]')?.dataset.editWorkout; if(analyzeId){showWorkoutAnalysis(analyzeId,target);return;} if(editId){const item=state.workouts.find(w=>w.id===editId);if(!item)return;editingWorkoutId=editId;for(const [key,value] of Object.entries(item)){const field=$(`w${key[0].toUpperCase()}${key.slice(1)}`);if(field)field.value=value;}$('workoutForm').querySelector('[type=submit]').textContent='Guardar cambios';$('wTitle').focus();return;} if (!deleteId) return; openModal('Borrar entrenamiento', 'Se quitará esta sesión del registro de prueba.', () => { state.workouts = state.workouts.filter(w => w.id !== deleteId); save(); renderWorkoutsPage(target); note('Entrenamiento borrado.'); }, 'Borrar'); };
  }
  function showWorkoutAnalysis(id,target) {
    const w=state.workouts.find(item=>item.id===id), box=$('workoutAnalysis'); if(!w||!box)return;
    const km=Number(w.distance)||0,seconds=durationSeconds(w.duration),pace=paceLabel(seconds,km),log=state.logs.find(item=>item.date===w.date),metrics=w.metrics||{},comparison=state.workouts.filter(item=>item.id!==w.id&&item.type===w.type&&item.date<w.date&&item.date>=new Date(new Date(`${w.date}T12:00:00`).getTime()-42*86400000).toISOString().slice(0,10)&&durationSeconds(item.duration)&&Number(item.distance)>0);
    const findings=[];
    if(km&&seconds)findings.push(`Ritmo medio calculado: ${pace} min/km en ${km.toFixed(2)} km (${durationLabel(seconds)}). El promedio no describe las variaciones dentro de la sesión.`);
    else findings.push('Faltan distancia o duración para calcular un ritmo medio fiable.');
    if(metrics.avgHeartRate)findings.push(`Frecuencia cardiaca: media ${metrics.avgHeartRate} ppm${metrics.minHeartRate?`, mínimo ${metrics.minHeartRate} ppm`:''}${metrics.maxHeartRate?`, máximo ${metrics.maxHeartRate} ppm`:''}. Sin tus zonas o umbrales personales, no asigno zonas de entrenamiento.`);
    if(metrics.elevationGain!=null)findings.push(`Desnivel positivo aproximado: ${Math.round(metrics.elevationGain)} m${metrics.elevationGain?'; puede variar por el ruido del altímetro':''}.`);
    if(metrics.calories)findings.push(`Calorías informadas por el dispositivo: ${metrics.calories} kcal (estimación del reloj).`);
    if(metrics.avgCadence)findings.push(`Cadencia media registrada: ${Math.round(metrics.avgCadence)} pasos/min; el archivo puede usar una convención distinta según el dispositivo.`);
    if(metrics.maxSpeedMps)findings.push(`Velocidad instantánea máxima registrada: ${(metrics.maxSpeedMps*3.6).toFixed(1)} km/h; puede fluctuar por GPS.`);
    if(metrics.trackpoints)findings.push(`El TCX aportó ${metrics.trackpoints} puntos de actividad${metrics.gpsPoints?`, ${metrics.gpsPoints} con posición GPS`:''}.`);
    if(w.effort)findings.push(`Esfuerzo percibido registrado: ${esc(w.effort)}/10.${Number(w.effort)>=8?' Fue una sesión exigente según tu propia valoración.':Number(w.effort)<=3?' La anotaste como una sesión suave.':''}`);
    if(w.notes&&!String(w.notes).startsWith('Importado desde TCX'))findings.push(`Tus notas: “${esc(w.notes)}”.`);
    if(log){
      if(log.sleep){const sleep=Number(log.sleep);findings.push(`Sueño de la noche asociada: ${esc(log.sleep)} h.${sleep<6?' Es un dato de descanso reducido para tener presente al interpretar las sensaciones.':sleep<7?' Es un dato de descanso moderado; compáralo con cómo te encontraste.':' Anotaste una duración de sueño de 7 h o más.'}`);}
      if(log.energy)findings.push(`Sensación al despertar: ${esc(log.energy)}.`);
      if(log.carbs)findings.push(`Alimentación registrada: ${esc(log.carbs)}.`);
      if(log.weather)findings.push(`Clima asociado a ese día: ${esc(log.weather)}.`);
      if(!log.sleep&&!log.energy&&!log.carbs&&!log.weather)findings.push('Hay un registro para esta fecha, pero aún no incluye sueño, sensaciones, alimentación o clima.');
    } else findings.push('No hay contexto guardado para esta fecha. En Progreso puedes registrar sueño, energía, carbohidratos y clima; usa la misma fecha del entrenamiento.');
    if(comparison.length){const avgPace=comparison.reduce((sum,item)=>sum+durationSeconds(item.duration)/Number(item.distance),0)/comparison.length;const delta=seconds&&km?Math.round(seconds/km-avgPace):0;findings.push(`Comparación descriptiva con ${comparison.length} sesión${comparison.length===1?'':'es'} previas del mismo tipo en las últimas seis semanas: promedio ${Math.floor(avgPace/60)}:${String(Math.round(avgPace%60)).padStart(2,'0')} min/km${delta?`; esta sesión fue ${Math.abs(delta)} s/km ${delta>0?'más lenta':'más rápida'} que ese promedio`:'.'}`);}
    const splits=metrics.splits||[],laps=metrics.laps||[];const splitTable=splits.length?`<h3 style="font:700 13px Manrope;margin:17px 0 5px">Ritmo por kilómetro</h3><div style="overflow:auto;margin:8px 0"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e9ece5">Tramo</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e9ece5">Tiempo</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e9ece5">Ritmo</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e9ece5">FC media</th></tr></thead><tbody>${splits.map(s=>`<tr><td style="padding:8px;border-bottom:1px solid #f0f1ed">${esc(s.label)}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f0f1ed">${durationLabel(s.seconds)}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f0f1ed">${paceLabel(s.seconds,s.distanceKm)} /km</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f0f1ed">${s.avgHeartRate?`${s.avgHeartRate} ppm`:'—'}</td></tr>`).join('')}</tbody></table></div>`:'';
    const lapTable=laps.length?`<h3 style="font:700 13px Manrope;margin:17px 0 5px">Vueltas registradas por el reloj</h3><div style="overflow:auto;margin:8px 0"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e9ece5">Vuelta</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e9ece5">Distancia</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e9ece5">Tiempo</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e9ece5">FC media / máx.</th><th style="text-align:right;padding:8px;border-bottom:1px solid #e9ece5">Calorías</th></tr></thead><tbody>${laps.map(l=>`<tr><td style="padding:8px;border-bottom:1px solid #f0f1ed">${esc(l.label)}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f0f1ed">${l.distanceKm.toFixed(2)} km</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f0f1ed">${durationLabel(l.seconds)}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f0f1ed">${l.avgHeartRate||'—'} / ${l.maxHeartRate||'—'} ppm</td><td style="text-align:right;padding:8px;border-bottom:1px solid #f0f1ed">${l.calories||'—'}</td></tr>`).join('')}</tbody></table></div>`:'';
    const hr=metrics.heartRateSeries||[],hrChart=hr.length>1?`<div class="sub" style="margin-top:15px">Frecuencia cardiaca durante la sesión · ${Math.min(...hr.map(p=>p.value))}–${Math.max(...hr.map(p=>p.value))} ppm</div><svg viewBox="0 0 600 110" role="img" aria-label="Gráfico de frecuencia cardiaca durante la sesión" style="width:100%;height:110px;margin-top:8px"><line x1="0" y1="95" x2="600" y2="95" stroke="#e9ece5"/><polyline fill="none" stroke="#df8d63" stroke-width="3" vector-effect="non-scaling-stroke" points="${hr.map(p=>`${(p.elapsed/(metrics.durationSeconds||seconds||1)*590+5).toFixed(1)},${(100-(p.value-Math.min(...hr.map(x=>x.value)))/(Math.max(...hr.map(x=>x.value))-Math.min(...hr.map(x=>x.value))||1)*82).toFixed(1)}`).join(' ')}"/></svg>`:'';
    const refreshTcx=w.source?.includes('TCX')&&!metrics.trackpoints?'<div class="hint" style="margin:12px 0">Esta sesión se importó con la versión anterior y solo conservó el resumen. Vuelve a importar el mismo archivo TCX desde el formulario para cargar sus métricas detalladas.</div>':'';
    box.innerHTML=`<div class="panel-head"><div><h2>Análisis ampliado de ${esc(w.title||'tu entrenamiento')}</h2><div class="sub">${formatDate(w.date,{weekday:'long',day:'numeric',month:'long'})} · Resumen del TCX y contexto del día</div></div><span class="status-chip">Lectura local · sin IA</span></div><ul style="padding-left:20px;line-height:1.75;color:#566158">${findings.map(line=>`<li>${line}</li>`).join('')}</ul>${hrChart}${lapTable}${splitTable}${refreshTcx}<div class="hint">Se muestran solo campos incluidos en el archivo. Los TCX no siempre contienen frecuencia cardiaca, GPS, altitud o cadencia. Esto es un resumen descriptivo, no una valoración clínica ni zonas personalizadas.</div>`;
    box.classList.remove('hidden'); box.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function parseDate(value) {
    if (!value) return todayISO();
    const parsed = new Date(value); if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0,10);
    const match = String(value).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    return match ? `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}` : todayISO();
  }
  function haversine(a, b) {
    const rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const s = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
  }
  function parseTCX(text, filename) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('El TCX no se puede leer.');
    const points = [...xml.getElementsByTagNameNS('*', 'Trackpoint')];
    const value=(node,name)=>node.getElementsByTagNameNS('*',name)[0]?.textContent||'';
    const pointData=points.map(p=>{const position=p.getElementsByTagNameNS('*','Position')[0],hr=Number(value(p,'Value')),cadence=Number(value(p,'RunCadence')||value(p,'Cadence')),lat=Number(value(position||p,'LatitudeDegrees')),lon=Number(value(position||p,'LongitudeDegrees'));return{time:new Date(value(p,'Time')),distance:Number(value(p,'DistanceMeters')),hr:hr||null,cadence:cadence||null,altitude:Number(value(p,'AltitudeMeters'))||null,lat:Number.isFinite(lat)&&lat?lat:null,lon:Number.isFinite(lon)&&lon?lon:null,speed:Number(value(p,'Speed'))||null};}).filter(p=>!Number.isNaN(p.time.getTime()));
    const distances=pointData.map(p=>p.distance).filter(n=>n>0),times=pointData.map(p=>p.time);
    const activity = xml.getElementsByTagNameNS('*','Activity')[0];
    const title = activity?.getAttribute('Sport') || filename.replace(/\.tcx$/i,'');
    const date = times[0]?.toISOString().slice(0,10) || todayISO();
    const laps=[...(activity?.getElementsByTagNameNS('*','Lap')||[])],lapSeconds=laps.reduce((sum,l)=>sum+(Number(value(l,'TotalTimeSeconds'))||0),0),lapMeters=laps.reduce((sum,l)=>sum+(Number(value(l,'DistanceMeters'))||0),0),seconds=lapSeconds?Math.round(lapSeconds):times.length>1?Math.round((times.at(-1)-times[0])/1000):null;
    const distanceMeters=lapMeters|| (distances.length?Math.max(...distances):0),distanceKm=distanceMeters/1000;
    const hrPoints=pointData.filter(p=>p.hr),lapHr=laps.map(l=>({value:Number(value(l,'AverageHeartRateBpm'))||0,time:Number(value(l,'TotalTimeSeconds'))||0})).filter(x=>x.value);
    const avgHeartRate=lapHr.length?Math.round(lapHr.reduce((sum,x)=>sum+x.value*x.time,0)/(lapHr.reduce((sum,x)=>sum+x.time,0)||1)):hrPoints.length?Math.round(hrPoints.reduce((sum,p)=>sum+p.hr,0)/hrPoints.length):null;
    const maxHeartRate=hrPoints.length?Math.max(...hrPoints.map(p=>p.hr)):Math.max(0,...laps.map(l=>Number(value(l,'MaximumHeartRateBpm'))||0))||null;
    const minHeartRate=hrPoints.length?Math.min(...hrPoints.map(p=>p.hr)):null;
    const cadencePoints=pointData.filter(p=>p.cadence),altitudes=pointData.filter(p=>p.altitude!=null).map(p=>p.altitude);let elevationGain=0;for(let i=1;i<altitudes.length;i++){const rise=altitudes[i]-altitudes[i-1];if(rise>1)elevationGain+=rise;}
    const calories=laps.reduce((sum,l)=>sum+(Number(value(l,'Calories'))||0),0)||Number(value(activity||xml,'Calories'))||null;
    const timed=pointData.filter(p=>p.distance>0).sort((a,b)=>a.distance-b.distance),splits=[];
    const atDistance=target=>{const index=timed.findIndex(p=>p.distance>=target);if(index<0)return null;if(index===0)return{elapsed:0,hr:timed[0].hr};const a=timed[index-1],b=timed[index],ratio=(target-a.distance)/(b.distance-a.distance||1),start=times[0].getTime();return{elapsed:(a.time.getTime()-start)/1000+ratio*(b.time-a.time)/1000,hr:a.hr&&b.hr?a.hr+ratio*(b.hr-a.hr):a.hr||b.hr};};
    let previous=atDistance(0);if(!previous&&timed.length)previous={elapsed:0,hr:timed[0].hr};let marker=1;
    while(marker*1000<=distanceMeters){const next=atDistance(marker*1000);if(next&&previous){const a=timed.findIndex(p=>p.distance>=(marker-1)*1000),b=timed.findIndex(p=>p.distance>=marker*1000),segment=timed.slice(Math.max(0,a),b+1).map(p=>p.hr).filter(Boolean);splits.push({label:`${marker} km`,distanceKm:1,seconds:Math.round(next.elapsed-previous.elapsed),avgHeartRate:segment.length?Math.round(segment.reduce((x,y)=>x+y,0)/segment.length):null});previous=next;}marker++;}
    if(distanceMeters-(marker-1)*1000>=250&&previous){const end=atDistance(distanceMeters);if(end){const portion=(distanceMeters-(marker-1)*1000)/1000,a=timed.findIndex(p=>p.distance>=(marker-1)*1000),segment=timed.slice(Math.max(0,a)).map(p=>p.hr).filter(Boolean);splits.push({label:`Últimos ${portion.toFixed(2)} km`,distanceKm:portion,seconds:Math.round(end.elapsed-previous.elapsed),avgHeartRate:segment.length?Math.round(segment.reduce((x,y)=>x+y,0)/segment.length):null});}}
    const sampleStep=Math.max(1,Math.ceil(pointData.length/250)),heartRateSeries=pointData.filter((p,i)=>p.hr&&i%sampleStep===0).map(p=>({elapsed:Math.max(0,Math.round((p.time-times[0])/1000)),value:p.hr}));
    const track=pointData.filter((p,i)=>i%sampleStep===0).slice(0,250).map(p=>({elapsed:Math.max(0,Math.round((p.time-times[0])/1000)),distanceMeters:p.distance||null,heartRate:p.hr,altitudeMeters:p.altitude,cadence:p.cadence,latitude:p.lat,longitude:p.lon,speedMps:p.speed}));
    const lapData=laps.map((l,i)=>({label:`Vuelta ${i+1}`,distanceKm:(Number(value(l,'DistanceMeters'))||0)/1000,seconds:Number(value(l,'TotalTimeSeconds'))||0,avgHeartRate:Number(value(l,'AverageHeartRateBpm'))||null,maxHeartRate:Number(value(l,'MaximumHeartRateBpm'))||null,calories:Number(value(l,'Calories'))||null})).filter(l=>l.distanceKm||l.seconds);
    const speeds=pointData.map(p=>p.speed).filter(v=>v>0),elapsedSeconds=times.length>1?Math.round((times.at(-1)-times[0])/1000):seconds;
    const metrics={avgHeartRate,maxHeartRate,minHeartRate,avgCadence:cadencePoints.length?cadencePoints.reduce((sum,p)=>sum+p.cadence,0)/cadencePoints.length:null,maxSpeedMps:speeds.length?Math.max(...speeds):null,calories,elevationGain:altitudes.length?elevationGain:null,trackpoints:points.length,gpsPoints:pointData.filter(p=>p.lat!=null&&p.lon!=null).length,durationSeconds:seconds,elapsedSeconds,splits,laps:lapData,heartRateSeries,track};
    return { id: crypto.randomUUID(), title: `Polar · ${title}`, type: 'TCX importado', date, distance: distanceKm.toFixed(2), duration: seconds ? durationLabel(seconds) : '', effort: '', notes: 'Importado desde TCX', source: 'Polar · TCX', metrics };
  }
  function parseGPX(text, filename) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('El GPX no se puede leer.');
    const points = [...xml.getElementsByTagName('trkpt')].map(p => ({ lat:Number(p.getAttribute('lat')), lon:Number(p.getAttribute('lon')), time:new Date(p.getElementsByTagName('time')[0]?.textContent || '') })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    let meters = 0; for (let i=1;i<points.length;i++) meters += haversine(points[i-1], points[i]);
    const validTimes = points.map(p=>p.time).filter(d=>!Number.isNaN(d.getTime()));
    const seconds = validTimes.length > 1 ? Math.round((validTimes.at(-1)-validTimes[0])/1000) : null;
    const name = xml.getElementsByTagName('name')[0]?.textContent || filename.replace(/\.gpx$/i,'');
    return { id:crypto.randomUUID(), title:`Polar · ${name}`, type:'GPX importado', date:validTimes[0]?.toISOString().slice(0,10)||todayISO(), distance:(meters/1000).toFixed(2), duration:seconds?durationLabel(seconds):'', effort:'', notes:'Distancia calculada desde los puntos de la ruta', source:'Polar · GPX' };
  }
  function splitCsvLine(line, delimiter) {
    const cells=[];let value='',quoted=false;
    for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'&&quoted){value+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===delimiter&&!quoted){cells.push(value.trim());value='';}else value+=c;}cells.push(value.trim());return cells;
  }
  function parseCSV(text, filename) {
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(lines.length<2)throw new Error('El CSV no contiene filas de sesiones.');
    const delimiter=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';
    const headers=splitCsvLine(lines[0],delimiter).map(h=>h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
    const find=terms=>headers.findIndex(h=>terms.some(t=>h.includes(t)));
    const dateIdx=find(['date','fecha','start time','started']);const distanceIdx=find(['distance','distancia']);const durationIdx=find(['duration','duracion','time']);const sportIdx=find(['sport','actividad','activity','type']);
    if(dateIdx<0||distanceIdx<0)throw new Error('No encuentro columnas de fecha y distancia en este CSV. Prueba a exportar la sesión como TCX.');
    return lines.slice(1).map(line=>{const cells=splitCsvLine(line,delimiter);if(!cells[dateIdx]||!cells[distanceIdx])return null;let raw=cells[distanceIdx].replace(',','.').replace(/[^\d.]/g,'');let km=Number(raw);if(headers[distanceIdx].includes('(m)')||headers[distanceIdx].includes('meter')||km>1000)km/=1000;return{id:crypto.randomUUID(),title:`Polar · ${sportIdx>=0?cells[sportIdx]:'Entrenamiento'}`,type:'CSV importado',date:parseDate(cells[dateIdx]),distance:km.toFixed(2),duration:durationIdx>=0?cells[durationIdx]:'',effort:'',notes:`Importado desde ${filename}`,source:'Polar · CSV'};}).filter(Boolean);
  }
  async function importFiles(fileList) {
    const files=[...fileList];if(!files.length)return;let added=0,enriched=0;
    for(const file of files){try{const text=await file.text();let imported;if(/\.tcx$/i.test(file.name))imported=[parseTCX(text,file.name)];else if(/\.gpx$/i.test(file.name))imported=[parseGPX(text,file.name)];else if(/\.csv$/i.test(file.name))imported=parseCSV(text,file.name);else continue;for(const w of imported){if(Number(w.distance)<=0)continue;const existing=state.workouts.find(x=>x.date===w.date&&Math.abs(Number(x.distance)-Number(w.distance))<.01&&x.source===w.source);if(!existing){state.workouts.push(w);added++;}else if(w.metrics?.trackpoints&&(!existing.metrics?.trackpoints||w.metrics.trackpoints>=existing.metrics.trackpoints)){existing.metrics=w.metrics;existing.duration=w.duration||existing.duration;existing.title=w.title||existing.title;enriched++;}}}catch(error){note(error.message);}}
    if(added||enriched){save();renderPage('Entrenamientos');note(`${added?`${added} sesión${added===1?'':'es'} importada${added===1?'':'s'}`:''}${added&&enriched?' · ':''}${enriched?`${enriched} sesión${enriched===1?'':'es'} enriquecida${enriched===1?'':'s'} con datos TCX`:''}.`);}else if(files.length)note('No se encontraron sesiones nuevas ni datos TCX adicionales.');
  }
  function renderProgressPage(target) {
    const totalKm=state.workouts.reduce((sum,w)=>sum+(Number(w.distance)||0),0);
    target.innerHTML=`<div class="workspace">${pageHeader('Progreso y recuperación','Añade sueño, energía, alimentación y condiciones del entrenamiento.')}${panel('Registrar contexto', `<form id="logForm" class="form-grid"><div class="field"><label for="lDate">Fecha</label><input id="lDate" name="date" type="date" value="${todayISO()}" required></div><div class="field"><label for="lTime">Hora aproximada del entrenamiento</label><input id="lTime" name="time" type="time" value="07:00"></div><div class="field"><label for="lSleep">Horas de sueño</label><input id="lSleep" name="sleep" type="number" min="0" max="24" step="0.25" placeholder="7.5"></div><div class="field"><label for="lEnergy">Energía al despertar</label><select id="lEnergy" name="energy"><option value="">Elige una opción</option><option>Muy baja</option><option>Baja</option><option>Normal</option><option>Buena</option><option>Muy buena</option></select></div><div class="field"><label for="lCarbs">Carbohidratos</label><select id="lCarbs" name="carbs"><option value="">Prefiero no indicarlo</option><option>Pocos</option><option>Lo habitual</option><option>Más de lo habitual</option><option>Buena carga de carbohidratos</option></select></div><div class="field"><label for="lCity">Ciudad para consultar clima histórico</label><input id="lCity" name="city" placeholder="Madrid"></div><div class="field full"><label for="lWeather">Clima / temperatura / notas del día</label><input id="lWeather" name="weather" placeholder="Usa el botón para buscar el clima o escribe una nota"></div><div class="field full form-actions"><button class="button light" type="button" id="fetchWeather">Consultar clima histórico · Open-Meteo</button><button class="button" type="submit">Guardar contexto</button></div><div class="field full"><small class="sub" id="weatherSource">El clima usa la ciudad y hora que indiques; la ubicación es aproximada.</small></div></form>`) }${panel('Resumen personal', `<div class="metric-row"><div class="metric-box"><small>Sesiones</small><b>${state.workouts.length}</b></div><div class="metric-box"><small>Distancia total</small><b>${totalKm.toFixed(1)} km</b></div><div class="metric-box"><small>Días con contexto</small><b>${state.logs.length}</b></div></div>`, 'Datos guardados en este dispositivo o en tu cuenta cuando la conectes.')}${panel('Registros recientes', state.logs.length ? `<div class="workout-list">${[...state.logs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10).map(l=>`<div class="workout-card"><div><b>${formatDate(l.date,{weekday:'long',day:'numeric',month:'long'})} · ${esc(l.energy||'Sensaciones sin indicar')}</b><small>Sueño ${esc(l.sleep||'—')} h · Carbohidratos: ${esc(l.carbs||'—')} · Clima: ${esc(l.weather||'—')}</small></div></div>`).join('')}</div>` : '<div class="hint">Añade un registro para relacionar tu descanso y alimentación con las sesiones.</div>')}</div>`;
    $('logForm').onsubmit=event=>{event.preventDefault();const log=Object.fromEntries(new FormData(event.currentTarget).entries());const index=state.logs.findIndex(x=>x.date===log.date);if(index>=0)state.logs[index]=log;else state.logs.push(log);save();renderProgressPage(target);note('Contexto guardado.');};
    $('fetchWeather').onclick=fetchHistoricalWeather;
  }
  async function fetchHistoricalWeather() {
    const city=$('lCity')?.value.trim(), date=$('lDate')?.value||todayISO(), time=$('lTime')?.value||'07:00';if(!city){note('Escribe una ciudad para buscar el clima.');return;}
    $('fetchWeather').disabled=true;$('weatherSource').textContent='Buscando localidad y condiciones históricas…';
    try {
      const geoUrl=new URL('https://geocoding-api.open-meteo.com/v1/search');geoUrl.search=new URLSearchParams({name:city,count:'1',language:'es',format:'json'});
      const geoResponse=await fetch(geoUrl);if(!geoResponse.ok)throw new Error('No se pudo buscar esa ciudad.');const geo=await geoResponse.json();const place=geo.results?.[0];if(!place)throw new Error('No encuentro esa ciudad. Prueba a escribir también el país.');
      const weatherUrl=new URL('https://api.open-meteo.com/v1/archive');weatherUrl.search=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),start_date:date,end_date:date,hourly:'temperature_2m,precipitation,wind_speed_10m',timezone:'auto'});
      const weatherResponse=await fetch(weatherUrl);if(!weatherResponse.ok)throw new Error('No hay datos históricos disponibles para esa fecha.');const data=await weatherResponse.json();const times=data.hourly?.time||[];const wanted=`${date}T${time.slice(0,2)}`;let index=times.findIndex(value=>value.startsWith(wanted));if(index<0)index=times.findIndex(value=>value.startsWith(`${date}T`));if(index<0)throw new Error('No hay observaciones para ese día.');
      const temperature=data.hourly.temperature_2m[index],rain=data.hourly.precipitation[index],wind=data.hourly.wind_speed_10m[index];const summary=`${place.name}: ${temperature} °C · lluvia ${rain} mm/h · viento ${wind} km/h · ${time}. Fuente: Open-Meteo.`;$('lWeather').value=summary;$('weatherSource').textContent=`Datos históricos aproximados para ${place.name}, ${place.country||''}; cuadrícula meteorológica de referencia. Fuente: Open-Meteo.`;
    } catch(error) { $('weatherSource').textContent=error.message;note(error.message); } finally { $('fetchWeather').disabled=false; }
  }
  function nextMonday(from=new Date()) {const day=weekStart(from);day.setDate(day.getDate()+7);return day;}
  function buildSchedule(config) {
    const race=new Date(`${config.race}T12:00:00`),start=nextMonday();const weeks=Math.max(1,Math.min(20,Math.ceil((race-start)/(7*86400000))));
    const days=Number(config.days)||4;const templates={3:[['Rodaje fácil',.30,1],['Calidad controlada',.30,3],['Tirada larga',.40,6]],4:[['Rodaje fácil',.24,0],['Calidad controlada',.25,2],['Rodaje fácil',.20,4],['Tirada larga',.31,6]],5:[['Rodaje fácil',.20,0],['Recuperación',.12,1],['Calidad controlada',.23,3],['Rodaje fácil',.18,5],['Tirada larga',.27,6]],6:[['Rodaje fácil',.18,0],['Recuperación',.10,1],['Calidad controlada',.22,2],['Rodaje fácil',.15,4],['Ritmo sostenido',.12,5],['Tirada larga',.23,6]]};
    const template=templates[days]||templates[4],base=Math.max(12,Number(config.weekly)||20),sessions=[];
    for(let week=0;week<weeks;week++){
      let factor=1+Math.min(week,6)*.04;if((week+1)%4===0)factor*=.82;if(week===weeks-1)factor*=.62;if(week===weeks-2&&weeks>3)factor*=.78;
      const total=base*factor,weekDate=new Date(start.getTime()+week*7*86400000);
      for(const [title,weight,offset] of template){const date=new Date(weekDate);date.setDate(date.getDate()+offset);if(date>=race)continue;const distance=Math.max(3,Math.round(total*weight*2)/2);sessions.push({id:crypto.randomUUID(),week:week+1,date:date.toISOString().slice(0,10),title,distance,type:title.includes('Calidad')||title.includes('Ritmo')?'quality':title.includes('larga')?'long':'easy',instructions:title==='Calidad controlada'?'Mantén el esfuerzo controlado; termina con margen.':title==='Tirada larga'?'Ritmo cómodo; no es una prueba.':'Ritmo conversacional.',status:'planned'});}
    }
    return {id:crypto.randomUUID(),...config,weeks,sessions};
  }
  function renderPlanPage(target) {
    const plan=state.plan;const sessions=plan?.sessions||[];const pending=sessions.filter(s=>s.status==='planned').sort((a,b)=>a.date.localeCompare(b.date));
    const sessionHtml=pending.length?`<div class="workout-list">${pending.slice(0,14).map(s=>`<div class="workout-card"><div><b>${formatDate(s.date,{weekday:'short',day:'numeric',month:'short'})} · ${esc(s.title)} · ${s.distance} km</b><small>Semana ${s.week} · ${esc(s.instructions)}</small></div><div style="display:flex;gap:6px"><button class="select" type="button" data-complete="${esc(s.id)}">Completado</button><button class="select" type="button" data-skip="${esc(s.id)}">No puedo</button></div></div>`).join('')}</div>`:'<div class="hint">No hay sesiones pendientes en el calendario. Crea o actualiza tu plan para añadir más.</div>';
    const planSummary=plan?`<div class="hint">${esc(plan.distance)} · carrera el ${formatDate(plan.race,{weekday:'long',day:'numeric',month:'long'})} · ${plan.days} días por semana · ${sessions.length} sesiones creadas. Plan original de prueba con semanas de descarga y reducción antes de la carrera.</div>`:'<div class="hint">Este generador crea un borrador original y ajustable. No reproduce sesiones de libros ni sustituye una valoración de entrenador.</div>';
    const past=sessions.filter(s=>s.status==='skipped'||s.status==='completed').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
    target.innerHTML=`<div class="workspace">${pageHeader('Tu plan de carrera','Indica fecha, distancia, experiencia y disponibilidad para crear una propuesta editable.')}${panel('Preparar mi calendario', `<form id="planForm" class="form-grid"><div class="field"><label for="race">Fecha de carrera</label><input type="date" name="race" id="race" required min="${todayISO()}"></div><div class="field"><label for="distance">Distancia</label><select name="distance" id="distance"><option>Maratón</option><option>Media maratón</option><option>10 km</option><option>5 km</option></select></div><div class="field"><label for="level">Punto de partida</label><select name="level" id="level"><option>Estoy empezando</option><option>Corro con regularidad</option><option>Ya he completado carreras</option></select></div><div class="field"><label for="days">Días disponibles por semana</label><select name="days" id="days"><option value="3">3 días</option><option value="4">4 días</option><option value="5">5 días</option><option value="6">6 días</option></select></div><div class="field"><label for="weekly">Kilómetros semanales actuales</label><input type="number" min="0" max="250" name="weekly" id="weekly" placeholder="30"></div><div class="field"><label for="goal">Objetivo personal</label><input name="goal" id="goal" placeholder="Disfrutar la carrera, bajar de 4 h…"></div><div class="field full form-actions"><button class="button" type="submit">Crear calendario</button></div></form>`)}${plan?panel('Resumen de la preparación',planSummary,`Plan · ${plan.weeks} semanas`):''}${panel('Próximas sesiones',sessionHtml,'Marca sesiones completadas u omitidas; el borrador no reprograma nada sin tu decisión.')}${past.length?panel('Actividad del plan',`<div class="workout-list">${past.map(s=>`<div class="workout-card"><div><b>${formatDate(s.date)} · ${esc(s.title)}</b><small>${esc(s.status==='completed'?'Completada':'Omitida')} · ${esc(s.recommendation||'')}</small></div><span class="status-chip">${esc(s.status)}</span></div>`).join('')}</div>`):''}</div>`;
    if(plan){$('race').value=plan.race||'';$('distance').value=plan.distance||'Maratón';$('days').value=plan.days||4;$('level').value=plan.level||'Corro con regularidad';$('weekly').value=plan.weekly||'';$('goal').value=plan.goal||'';}
    $('planForm').onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget).entries());const create=()=>{state.plan=buildSchedule(values);save();renderPlanPage(target);note('Calendario creado. Revisa las sesiones propuestas.');};if(state.plan?.sessions?.length)openModal('Crear un calendario nuevo','El plan anterior se sustituirá por una propuesta nueva. Los entrenamientos guardados no cambiarán.',create,'Crear plan','Volver');else create();};
    target.onclick=event=>{const completeId=event.target.closest('[data-complete]')?.dataset.complete;const skipId=event.target.closest('[data-skip]')?.dataset.skip;if(completeId){const s=sessions.find(x=>x.id===completeId);if(s){s.status='completed';s.recommendation='Marcada por ti como completada.';save();renderPlanPage(target);note('Sesión marcada como completada.');}}else if(skipId)recommendSkip(skipId,target);};
  }
  function recommendSkip(id,target) {
    const session=state.plan?.sessions?.find(s=>s.id===id);if(!session)return;pendingSkipId=id;
    const recommendation=session.type==='easy'?'Es una sesión fácil: la recomendación de prueba es marcarla como omitida y seguir con la siguiente sesión prevista.':`Es una sesión de ${session.title.toLowerCase()}: la recomendación de prueba es no acumularla con la siguiente sesión exigente. Puedes omitirla y conservar el resto del plan.`;
    openModal('¿No puedes hacer esta sesión?',`${recommendation} Esta sugerencia usa reglas locales; todavía no es un análisis de IA.`,()=>{const item=state.plan?.sessions?.find(s=>s.id===id);if(item){item.status='skipped';item.recommendation=recommendation;save();renderPlanPage(target);note('Sesión marcada como omitida; el resto del plan sigue igual.');}},'Marcar omitida','Volver al plan');
  }
  function localAnalysis() {
    const recent=state.workouts.filter(w=>(Date.now()-new Date(`${w.date}T23:59:59`).getTime())<7*86400000);const km=recent.reduce((sum,w)=>sum+(Number(w.distance)||0),0);const rpe=recent.filter(w=>w.effort).map(w=>Number(w.effort));const log=[...state.logs].sort((a,b)=>b.date.localeCompare(a.date))[0];const lines=[];
    lines.push(recent.length?`Has registrado ${recent.length} sesión${recent.length===1?'':'es'} y ${km.toFixed(1)} km en los últimos siete días.`:'Aún faltan entrenamientos recientes para comparar la carga semanal.');
    if(log?.sleep){const hours=Number(log.sleep);lines.push(hours<6.5?`Anotaste ${hours} h de sueño; tenlo en cuenta al valorar cómo te encuentras hoy.`:`Anotaste ${hours} h de sueño. Puedes comparar esta noche con las sensaciones del próximo entrenamiento.`);}
    if(log?.energy)lines.push(`Tu sensación registrada fue “${log.energy}”.`);
    if(log?.carbs)lines.push(`También registraste alimentación: “${log.carbs}”.`);
    if(log?.weather)lines.push(`Contexto del día: ${log.weather}.`);
    if(rpe.length)lines.push(`El esfuerzo medio que declaraste fue ${ (rpe.reduce((a,b)=>a+b,0)/rpe.length).toFixed(1) }/10.`);
    return lines.join(' ');
  }
  function analyzeWeek() { $('coachResult').textContent=localAnalysis(); }
  function renderSettingsPage(target) {
    target.innerHTML=`<div class="workspace">${pageHeader('Ajustes y modo de prueba','Prepara datos de ejemplo, exporta tus registros y revisa las conexiones.')}${panel('Mi cuenta',`<div class="provider-card"><div><b>${esc(user?.user_metadata?.full_name||user?.email||'Perfil de prueba')}</b><small>${user?'Cuenta de Google conectada':'Modo local · solo este navegador'}</small></div><button class="button light" id="settingsAccount">${user?'Cerrar sesión':'Google por configurar'}</button></div><div class="hint">La cuenta real se activa al configurar Supabase y Google. No se suben los datos locales automáticamente.</div>`)}${panel('Datos de prueba',`<p class="sub">Carga sesiones y contexto ficticios para recorrer el panel, el análisis local y la adaptación del plan. Puedes borrarlos después.</p><div class="form-actions"><button class="button" id="loadDemo">Cargar datos de prueba</button><button class="button light" id="clearDemo">Borrar todos los datos locales</button></div>`)}${panel('Dispositivos',`<div class="provider-card"><div><b>Polar Flow</b><small>Importa una sesión exportada como TCX, GPX o CSV desde Entrenamientos.</small></div><button class="button light" id="polarSettings">Cómo probar</button></div><div class="provider-card"><div><b>Clima histórico</b><small>Consulta temperatura, lluvia y viento por ciudad, fecha y hora.</small></div><span class="status-chip">Disponible en pruebas</span></div><div class="provider-card"><div><b>Análisis</b><small>Lectura local basada en tus datos registrados; el proveedor de IA aún no está conectado.</small></div><span class="status-chip">Modo de prueba</span></div>`)}${panel('Privacidad y datos',`<button id="exportData" class="button light">Descargar mis datos (JSON)</button>`)}</div>`;
    $('settingsAccount').onclick=accountAction;$('polarSettings').onclick=()=>openModal('Importar desde Polar Flow','Exporta una sesión desde Polar Flow web y cárgala en Entrenamientos. Para sincronización automática hará falta registrar AccessLink y configurar OAuth.',()=>renderPage('Entrenamientos'));
    $('loadDemo').onclick=()=>{loadDemoData();renderPage('Resumen');note('Datos de prueba cargados en este navegador.');};
    $('clearDemo').onclick=()=>openModal('Borrar datos locales','Se borrarán entrenamientos, contexto y plan guardados en este navegador. La cuenta en la nube, si la conectas, no se borra.',()=>{localStorage.removeItem(activeKey);state=emptyState();save();renderPage('Resumen');note('Datos locales borrados.');},'Borrar datos');
    $('exportData').onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ritmo-mis-datos.json';a.click();URL.revokeObjectURL(url);};
  }
  function loadDemoData() {
    const dayOffset=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
    const demoWorkouts=[{title:'Rodaje fácil',type:'Carrera',date:dayOffset(-1),distance:'7.5',duration:'43:20',effort:'4',notes:'Sensación cómoda.',source:'Demo'},{title:'Tempo progresivo',type:'Carrera',date:dayOffset(-3),distance:'10.2',duration:'53:40',effort:'7',notes:'Últimos kilómetros más exigentes.',source:'Demo'},{title:'Tirada larga',type:'Carrera',date:dayOffset(-5),distance:'15.0',duration:'1:25:00',effort:'6',notes:'Clima templado.',source:'Demo'},{title:'Rodaje regenerativo',type:'Carrera',date:dayOffset(-8),distance:'6.0',duration:'36:10',effort:'3',notes:'Recuperación.',source:'Demo'}];
    for(const workout of demoWorkouts)if(!state.workouts.some(w=>w.source==='Demo'&&w.date===workout.date&&w.title===workout.title))state.workouts.push({...workout,id:crypto.randomUUID()});
    const demoLogs=[{date:dayOffset(-1),time:'07:00',sleep:'6.25',energy:'Normal',carbs:'Lo habitual',city:'Madrid',weather:'18 °C · lluvia 0 mm/h · viento 9 km/h · Fuente: Open-Meteo.'},{date:dayOffset(-3),time:'18:00',sleep:'7.75',energy:'Buena',carbs:'Buena carga de carbohidratos',city:'Madrid',weather:'21 °C · lluvia 0 mm/h · viento 6 km/h · Fuente: Open-Meteo.'}];
    for(const log of demoLogs)if(!state.logs.some(item=>item.date===log.date))state.logs.push(log);
    if(!state.plan){const race=new Date();race.setDate(race.getDate()+70);state.plan=buildSchedule({race:race.toISOString().slice(0,10),distance:'Media maratón',level:'Corro con regularidad',days:'4',weekly:'32',goal:'Terminar con buenas sensaciones'});}
  }
  function accountName() {
    const name=user?.user_metadata?.full_name||user?.email?.split('@')[0]||'Laura Martín';
    $('profileName').textContent=name;$('profileInitial').textContent=name.slice(0,1).toUpperCase();$('helloName').textContent=name.split(/\s+/)[0];$('profileCaption').textContent=user?.email||'Modo de prueba';
    $('todayDate').textContent=new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
    $('accountButton').textContent=user?`Cuenta · ${user.email||'Google'}`:window.RITMO_CONFIG?.supabaseUrl?'Continuar con Google':'Cuenta de prueba';
  }
  async function accountAction() {
    if(!supabase){openModal('Cuenta de prueba','Puedes probar todas las pantallas con datos locales desde Ajustes. El registro real con Google se activa al conectar un proyecto Supabase.',()=>renderPage('Ajustes'));return;}
    if(user){openModal('Cerrar sesión','La sesión se cerrará en este navegador; tus registros de la cuenta seguirán guardados.',()=>supabase.auth.signOut().then(({error})=>{if(error)note('No se pudo cerrar sesión.')}),'Cerrar sesión');return;}
    const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}});if(error)note('Google no está habilitado en el proyecto Supabase.');
  }
  async function initSupabase() {
    const config=window.RITMO_CONFIG||{};if(!config.supabaseUrl||!config.supabaseAnonKey){accountName();return;}
    try{const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');supabase=createClient(config.supabaseUrl,config.supabaseAnonKey);supabase.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','INITIAL_SESSION','SIGNED_OUT'].includes(event))void handleSession(session);});const {data}=await supabase.auth.getSession();await handleSession(data.session);}catch(error){console.error('Ritmo auth setup failed',error);note('No se pudo iniciar la conexión de cuentas.');}
  }
  async function handleSession(session) {
    user=session?.user||null;activeKey=user?`${DB_KEY}:${user.id}`:DB_KEY;state=readState(activeKey);accountName();
    if(user)await loadCloudData();else{renderPage('Resumen');}
  }
  async function loadCloudData() {
    const owner=user.id;
    const [workouts,logs,plans]=await Promise.all([
      supabase.from('workouts').select('*').eq('owner_id',owner).order('started_at',{ascending:false}),
      supabase.from('daily_context').select('*').eq('owner_id',owner).order('day',{ascending:false}),
      supabase.from('training_plans').select('*').eq('owner_id',owner).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    const error=workouts.error||logs.error||plans.error;
    if(error){note('No se pudieron cargar los datos. Comprueba la migración de Supabase.');return;}
    if(workouts.data?.length)state.workouts=workouts.data.map(w=>({id:w.id,title:w.title,type:w.activity_type,date:w.started_at.slice(0,10),distance:String(Number(w.distance_meters||0)/1000),duration:durationLabel(w.duration_seconds),effort:w.perceived_effort||'',notes:w.notes||'',source:w.provider==='polar'?'Polar':'Manual',metrics:w.imported_metrics||{}}));
    if(logs.data?.length)state.logs=logs.data.map(l=>({date:l.day,time:l.training_time||'',city:l.location_label||'',sleep:l.sleep_minutes?String(l.sleep_minutes/60):'',energy:({very_low:'Muy baja',low:'Baja',normal:'Normal',good:'Buena',very_good:'Muy buena'})[l.energy]||'',carbs:({low:'Pocos',usual:'Lo habitual',higher:'Más de lo habitual',carb_load:'Buena carga de carbohidratos'})[l.carbohydrate_intake]||'',weather:l.weather_summary||'',note:l.notes||''}));
    if(plans.data){
      const details=plans.data.plan_data||{id:plans.data.id,race:plans.data.race_date,distance:plans.data.race_distance,level:plans.data.experience_level,days:plans.data.runs_per_week,weekly:plans.data.current_weekly_km,goal:plans.data.goal,sessions:[]};
      const planSessions=await supabase.from('plan_sessions').select('*').eq('owner_id',owner).eq('plan_id',plans.data.id).order('scheduled_date');
      if(!planSessions.error&&planSessions.data?.length)details.sessions=planSessions.data.map(s=>({id:s.id,week:1,date:s.scheduled_date,title:s.title,type:s.session_type,distance:s.planned_distance_km,instructions:s.instructions,status:s.status,recommendation:s.skip_reason||''}));
      state.plan=details;
    }
    localStorage.setItem(activeKey,JSON.stringify(state));renderPage('Resumen');
  }
  async function syncRemote() {
    if(!supabase||!user||savingRemote)return;savingRemote=true;const owner=user.id;
    try{
      if(state.workouts.length){const rows=state.workouts.map(w=>({id:w.id||crypto.randomUUID(),owner_id:owner,provider:String(w.source||'').includes('Polar')?'polar':'manual',provider_activity_id:null,title:w.title||'Entrenamiento',activity_type:w.type||'Carrera',started_at:new Date(`${w.date||todayISO()}T12:00:00Z`).toISOString(),duration_seconds:durationSeconds(w.duration),distance_meters:Number(w.distance||0)*1000,average_heart_rate:w.metrics?.avgHeartRate||null,perceived_effort:w.effort?Number(w.effort):null,notes:w.notes||'',imported_metrics:w.metrics||{}}));const result=await supabase.from('workouts').upsert(rows,{onConflict:'id'});if(result.error)throw result.error;state.workouts.forEach((w,i)=>w.id=rows[i].id);}
      if(state.logs.length){const energy={'Muy baja':'very_low','Baja':'low','Normal':'normal','Buena':'good','Muy buena':'very_good'},carbs={'Pocos':'low','Lo habitual':'usual','Más de lo habitual':'higher','Buena carga de carbohidratos':'carb_load'};const rows=state.logs.map(l=>({owner_id:owner,day:l.date,training_time:l.time||null,location_label:l.city||null,sleep_minutes:l.sleep?Math.round(Number(l.sleep)*60):null,energy:energy[l.energy]||null,carbohydrate_intake:carbs[l.carbs]||null,weather_summary:l.weather||null,notes:l.note||''}));const result=await supabase.from('daily_context').upsert(rows,{onConflict:'owner_id,day'});if(result.error)throw result.error;}
      if(state.plan){
        const p=state.plan;if(!p.id)p.id=crypto.randomUUID();const distance={'Maratón':'marathon','Media maratón':'half_marathon','10 km':'10k','5 km':'5k'};
        const paused=await supabase.from('training_plans').update({status:'paused'}).eq('owner_id',owner).eq('status','active').neq('id',p.id);if(paused.error)throw paused.error;
        const result=await supabase.from('training_plans').upsert({id:p.id,owner_id:owner,race_date:p.race,race_distance:distance[p.distance]||'marathon',experience_level:p.level||'regular',runs_per_week:Number(p.days)||4,current_weekly_km:p.weekly?Number(p.weekly):null,goal:p.goal||'',plan_data:p,status:'active'},{onConflict:'id'});if(result.error)throw result.error;
        if(p.sessions?.length){const sessions=p.sessions.map(s=>({id:s.id,owner_id:owner,plan_id:p.id,scheduled_date:s.date,title:s.title,session_type:s.type||'easy',planned_distance_km:s.distance,instructions:s.instructions||'',status:s.status||'planned',skip_reason:s.recommendation||null}));const saved=await supabase.from('plan_sessions').upsert(sessions,{onConflict:'id'});if(saved.error)throw saved.error;}
      }
      localStorage.setItem(activeKey,JSON.stringify(state));
    }catch(error){console.error('Ritmo cloud sync failed',error);note('No se pudieron guardar los datos en la nube. Comprueba Supabase.');}finally{savingRemote=false;}
  }
  function connectPolar() {
    openModal('Polar Flow: prueba hoy con un archivo','La sincronización automática necesita un cliente AccessLink y autorización OAuth. Para probar ahora, exporta una sesión como TCX, GPX o CSV e impórtala en Entrenamientos.',()=>renderPage('Entrenamientos'));
  }
  function exportData() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='ritmo-mis-datos.json';link.click();URL.revokeObjectURL(url);
  }
  document.querySelectorAll('.nav button,[data-page]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();const page=button.dataset.page;if(!page)return;document.querySelectorAll('.nav button').forEach(item=>item.classList.toggle('active',item.dataset.page===page));renderPage(page);}));
  $('connect').onclick=()=>renderPage('Entrenamientos');$('polarStatus').onclick=connectPolar;$('accountButton').onclick=accountAction;$('closeModal').onclick=closeModal;$('cancelModal').onclick=closeModal;modal.onclick=event=>{if(event.target===modal)closeModal();};$('seePlan').onclick=()=>renderPage('Mi plan');$('analyzeWeek').onclick=analyzeWeek;$('carbLog').onclick=()=>renderPage('Progreso');$('feelLog').onclick=()=>renderPage('Progreso');$('logData').onclick=event=>{event.preventDefault();renderPage('Progreso');};
  accountName();updateDashboard();void initSupabase();
})();
