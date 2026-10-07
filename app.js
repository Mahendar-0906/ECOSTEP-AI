/* ══════════════════════════════════════════════════════════════════
   PIEZO ENERGY HARVESTING SMART DASHBOARD — v2
   Premium JavaScript Engine
   ══════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────────
   GLOBAL STATE
───────────────────────────────────────────────────────────────── */
const state = {
  voltage: 0, current: 0, power: 0, energy: 0,
  peakVoltage: 0, peakCurrent: 0, peakPower: 0,
  avgVoltage: 0, avgCurrent: 0, avgPower: 0,
  capacitorPct: 0, capacitorVoltage: 0,
  efficiency: 0, systemHealth: 0,
  steps: 0, simSteps: 0, simEnergy: 0,
  ledOn: false, dataMode: 'demo',
  running: true, samplingRate: 1000,
  startTime: Date.now(),
  history: { v: [], c: [], p: [], e: [], t: [] },
  maxHistory: 60,
  chartWindow: 60,
  lastSampleMs: null,
  serialPort: null,
  serialReader: null,
  serialBuffer: '',
  wifiTimer: null,
  connected: false,
  loadR: 330,
  vOffset: 0, cOffset: 0,
  reportData: [],
  notifications: [],
  faultHistory: [],
  theme: 'dark',
  animSpeed: 'normal',
  // Default demo fault so the jury/audience sees a live fault detection
  // example immediately without waiting for the random simulation.
  // 'dead' (0V) always triggers a hard FAULT (red) — reliable for demos.
  _demoFault: null,
  _demoFaultForced: false,
  demoPulse: { active: false, peak: 0, startedAt: 0, duration: 0 },
  demoLastStepAt: 0,
  demoTimer: null,
  chartMetric: 'voltage',
};

const TILE_COUNT = 4;
const tiles = Array.from({ length: TILE_COUNT }, (_, i) => ({
  id: i + 1,
  state: 'active',
  voltage: 0,
  isTriggered: false,
  lastSeenTimestamp: Date.now(),
  faultReason: null,
  status: 'HEALTHY',
  badgeClass: 'healthy',
  _voltageHistory: [],
  group: Math.floor(i / 2),
}));

/* ─────────────────────────────────────────────────────────────────
   CHART REGISTRY
───────────────────────────────────────────────────────────────── */
const charts = {};

/* ─────────────────────────────────────────────────────────────────
   LOADING SCREEN
───────────────────────────────────────────────────────────────── */
(function initLoader() {
  const fill = document.getElementById('loader-fill');
  const pct  = document.getElementById('loader-pct');
  const status = document.getElementById('loader-status');
  const messages = [
    'Initializing system...',
    'Loading sensor modules...',
    'Calibrating floor tiles...',
    'Connecting data pipeline...',
    'Building chart engine...',
    'Initializing AI insights...',
    'System ready.',
  ];
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 18 + 4;
    if (progress >= 100) progress = 100;
    fill.style.width = progress + '%';
    pct.textContent = Math.round(progress) + '%';
    const idx = Math.min(Math.floor(progress / 15), messages.length - 1);
    status.textContent = messages[idx];
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        document.getElementById('loading-screen').classList.add('fade-out');
        document.getElementById('main-app').classList.add('visible');
        initApp();
      }, 500);
    }
  }, 80);
})();

/* ─────────────────────────────────────────────────────────────────
   APP INIT
───────────────────────────────────────────────────────────────── */
function initApp() {
  initClock();
  initSidebar();
  initTopNav();
  initProfile();
  initCharts();
  initChartMetricToggle();
  initPiezoArray();
  initSimulation();
  initAIInsights();
  initCommandPalette();
  initNotifications();
  initReports();
  initSettings();
  initComponentHealth();
  initAnalyticsCharts();
  initMechanicalExplode();
  startDataLoop();
  state.running = true;
  state.dataMode = "demo";
  seedNotifications();
  updateReportDate();

  // FAB
  document.getElementById('fab-simulate').addEventListener('click', triggerSimulation);

  console.log('%c⚡ ECO STEP AI DASHBOARD LOADED', 'color:#3B82F6;font-size:16px;font-weight:900;font-family:monospace;');
}

/* ─────────────────────────────────────────────────────────────────
   CLOCK
───────────────────────────────────────────────────────────────── */
function initClock() {
  function tick() {
    const now = new Date();
    document.getElementById('nav-time').textContent = now.toLocaleTimeString('en-GB');
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2,'0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2,'0');
    const s = String(elapsed % 60).padStart(2,'0');
    const upEl = document.getElementById('uptime-display');
    if (upEl) upEl.textContent = `${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}

/* ─────────────────────────────────────────────────────────────────
   SIDEBAR NAVIGATION
───────────────────────────────────────────────────────────────── */
let currentPage = 'dashboard';

function initSidebar() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const page = item.dataset.page;
      switchPage(page);
    });
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
}

function switchPage(page) {
  if (page === currentPage) return;
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  // Trigger chart resize on switch
  setTimeout(() => {
    Object.values(charts).forEach(c => { if (c && c.resize) c.resize(); });
    if (page === 'energy') updateEnergyPage();
    if (page === 'performance') updatePerformancePage();
    if (page === 'live') resizeLiveCharts();
  }, 50);
}

/* ─────────────────────────────────────────────────────────────────
   TOP NAV
───────────────────────────────────────────────────────────────── */
let wifiAbort=null;
function setConnection(ok,label='Connected'){
 state.connected=ok;
 ['conn-dot','sb-conn-dot'].forEach(id=>{const e=document.getElementById(id);if(e)e.className=`status-dot ${ok?'green':''}`;});
 const a=document.getElementById('conn-text');if(a)a.textContent=ok?label:'Offline';
 const b=document.getElementById('sb-conn-text');if(b)b.textContent=ok?label:'Disconnected';
 const c=document.getElementById('profile-hardware');if(c)c.textContent=ok?label:'Not connected';
}
function clearHardwareConnection(){
 try{state.serialReader?.cancel();}catch(_){}
 try{state.serialPort?.close();}catch(_){}
 state.serialReader=null;state.serialPort=null;
 if(wifiAbort)try{wifiAbort.abort();}catch(_){}
 wifiAbort=null;if(state.wifiTimer)clearInterval(state.wifiTimer);state.wifiTimer=null;setConnection(false);
}
function parseHardwarePayload(raw){
 const text=String(raw).trim();if(!text)return null;
 try{
  const o=JSON.parse(text);
  const tileReadings = Array.isArray(o.tiles) ? o.tiles : (Array.isArray(o.tileVoltages) ? o.tileVoltages.map((v,i)=>({id:i+1, voltage:v})) : null);
  return {voltage:o.voltage??o.v,current:o.current??o.current_mA??o.mA??o.i,power:o.power??o.power_mW??o.mW??o.p,energy:o.energy??o.energy_j??o.energyJ,steps:o.steps??o.footsteps,capacitorPct:o.capacitorPct??o.cap_pct,capacitorVoltage:o.capacitorVoltage??o.cap_voltage,efficiency:o.efficiency,tiles:tileReadings};
 }catch(_){
  const p=text.split(',').map(Number);return Number.isFinite(p[0])?{voltage:p[0],current:p[1],power:p[2],energy:p[3],steps:p[4]}:null;
 }
}
function handleSerialText(text){
 state.serialBuffer+=text;const lines=state.serialBuffer.split(/\r?\n/);state.serialBuffer=lines.pop()||'';
 lines.forEach(line=>{const sample=parseHardwarePayload(line);if(sample&&recordSample(sample,'serial'))updateUI();});
}
async function connectSerial(){
 if(!('serial' in navigator)){showToast('error','Web Serial needs Chrome/Edge on localhost or HTTPS.');return;}
 try{
  clearHardwareConnection();state.dataMode='serial';document.getElementById('data-source-select').value='serial';
  const port=await navigator.serial.requestPort();await port.open({baudRate:parseInt(document.getElementById('baud-rate')?.value||'115200',10)});
  state.serialPort=port;setConnection(true,'ESP32 Serial');showToast('success','ESP32 Serial connected');
  const decoder=new TextDecoderStream();port.readable.pipeTo(decoder.writable).catch(()=>{});
  const reader=decoder.readable.getReader();state.serialReader=reader;
  while(true){const {value,done}=await reader.read();if(done)break;if(value)handleSerialText(value);}
 }catch(e){clearHardwareConnection();if(e?.name!=='NotFoundError')showToast('error',`Serial connection failed: ${e.message||e}`);}
}
async function pollWifi(){
 const ip=document.getElementById('wifi-ip')?.value.trim();if(!ip){showToast('error','Enter the ESP32 IP address first');return;}
 try{
  const r=await fetch(`http://${ip}/api/data`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const sample=parseHardwarePayload(await r.text());if(!sample||!Number.isFinite(Number(sample.voltage)))throw new Error('Invalid /api/data payload');
  recordSample(sample,'wifi');setConnection(true,'ESP32 WiFi');updateUI();
 }catch(e){setConnection(false);if(e.name!=='AbortError')showToast('error',`ESP32 WiFi unavailable: ${e.message||e}`);}
}
function connectWifi(){
 clearHardwareConnection();state.dataMode='wifi';document.getElementById('data-source-select').value='wifi';pollWifi();state.wifiTimer=setInterval(pollWifi,Math.max(500,state.samplingRate));
}
function initProfile(){
 const p=document.getElementById('profile-panel'),o=document.getElementById('profile-btn'),x=document.getElementById('profile-close');
 o?.addEventListener('click',()=>{const e=document.getElementById('data-source-select');document.getElementById('profile-mode').textContent=e?.selectedOptions[0]?.textContent||'Demo';p?.classList.remove('hidden');});
 x?.addEventListener('click',()=>p?.classList.add('hidden'));p?.addEventListener('click',e=>{if(e.target===p)p.classList.add('hidden')});
}
function initTopNav() {
  // Theme
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('settings-theme-btn').addEventListener('click', toggleTheme);

  // Notifications panel
  document.getElementById('notif-btn').addEventListener('click', () => {
    document.getElementById('notif-panel').classList.toggle('hidden');
  });
  document.getElementById('notif-clear').addEventListener('click', () => {
    state.notifications = [];
    renderNotifications();
    document.getElementById('notif-count').textContent = '0';
  });

  // Fullscreen
  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  // Data source
  document.getElementById('data-source-select').addEventListener('change', async e => {
    const mode=e.target.value; clearHardwareConnection(); state.dataMode=mode; state.lastSampleMs=null;
    document.getElementById('sb-data-mode').textContent={demo:'Demo Mode',serial:'ESP32 Serial',wifi:'ESP32 WiFi',manual:'Manual'}[mode];
    if(mode==='demo'){state.running=true;startDataLoop();showToast('info','Demo Mode: live simulation enabled');}
    else if(mode==='serial')await connectSerial();
    else if(mode==='wifi')connectWifi();
    else {state.running=false;showToast('info','Manual mode selected');}
  });

  // Battery simulation update
  setInterval(() => {
    const batt = Math.round(50 + 30 * Math.sin(Date.now() / 200000));
    document.getElementById('nav-battery').textContent = batt + '%';
  }, 5000);
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  const icon = state.theme === 'dark' ? 'fa-moon' : 'fa-sun';
  document.getElementById('theme-icon').className = `fa-solid ${icon}`;
  document.getElementById('settings-theme-icon').className = `fa-solid ${icon}`;
  showToast('info', `Switched to ${state.theme} mode`);
}

/* ─────────────────────────────────────────────────────────────────
   DATA GENERATION (Demo Mode)
───────────────────────────────────────────────────────────────── */
let t = 0;

function recordSample(sample, source = state.dataMode) {
  const v = Number(sample?.voltage);
  if (!Number.isFinite(v)) return false;
  const now = Date.now();
  const previousSteps = state.steps;
  const iRaw = Number(sample.current);
  const pRaw = Number(sample.power);
  const voltage = Math.max(0, v + (source === 'demo' ? state.vOffset : 0));
  const current = Number.isFinite(iRaw) ? Math.max(0, iRaw + (source === 'demo' ? state.cOffset : 0))
    : (state.loadR > 0 ? voltage / state.loadR * 1000 : 0);
  const power = Number.isFinite(pRaw) ? Math.max(0, pRaw) : voltage * current / 1000 * 1000;
  const dt = state.lastSampleMs == null ? state.samplingRate / 1000 : Math.min(10, Math.max(0,(now-state.lastSampleMs)/1000));
  state.lastSampleMs = now;
  state.voltage=voltage; state.current=current; state.power=power;
  if (Number.isFinite(Number(sample.energy))) state.energy=Math.max(state.energy,Number(sample.energy));
  else state.energy=Math.max(0,state.energy+(power/1000)*dt);
  if (Number.isFinite(Number(sample.steps))) state.steps=Math.max(0,Number(sample.steps));
  state.peakVoltage=Math.max(state.peakVoltage,voltage); state.peakCurrent=Math.max(state.peakCurrent,current); state.peakPower=Math.max(state.peakPower,power);
  if (Number.isFinite(Number(sample.efficiency))) state.efficiency=Math.max(0,Math.min(100,Number(sample.efficiency)));
  else if (source==='demo') state.efficiency=72+14*Math.abs(Math.sin(t*.2));
  state.capacitorPct=Number.isFinite(Number(sample.capacitorPct))?Math.max(0,Math.min(100,Number(sample.capacitorPct))):state.capacitorPct;
  state.capacitorVoltage=Number.isFinite(Number(sample.capacitorVoltage))?Math.max(0,Number(sample.capacitorVoltage)):state.capacitorPct/100*5;
  state.ledOn=voltage>=3;
  const ts=new Date(now).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  state.history.v.push(voltage); state.history.c.push(current); state.history.p.push(power); state.history.e.push(state.energy); state.history.t.push(ts);
  const keep=Math.max(10,state.chartWindow);
  Object.keys(state.history).forEach(k=>{while(state.history[k].length>keep) state.history[k].shift();});
  const av=(arr)=>arr.length?arr.reduce((x,y)=>x+y,0)/arr.length:0;
  state.avgVoltage=av(state.history.v.slice(-20)); state.avgCurrent=av(state.history.c.slice(-20)); state.avgPower=av(state.history.p.slice(-20));
  const incomingTiles = Array.isArray(sample.tiles) ? sample.tiles : null;
  const triggerDetected = Boolean(sample.isTriggered ?? sample.triggered ?? (Number.isFinite(Number(sample.steps)) && Number(sample.steps) > previousSteps));
  tiles.forEach((tile, index) => {
    const incoming = incomingTiles?.[index] ?? incomingTiles?.find(x => Number(x?.id) === tile.id);
    if (incoming && Number.isFinite(Number(incoming.voltage ?? incoming.v))) {
      tile.voltage = Math.max(0, Number(incoming.voltage ?? incoming.v));
      tile.isTriggered = Boolean(incoming.isTriggered ?? incoming.triggered ?? triggerDetected);
    } else {
      tile.voltage = tile.state === 'active' ? +(voltage * (.75 + .25 * Math.random())).toFixed(2) : 0;
      tile.isTriggered = tile.state === 'active' && (source === 'demo' ? voltage > 0.25 : triggerDetected);
    }
    tile.lastSeenTimestamp = now;
  });
  if(state.history.v.length%5===0){state.reportData.push({ts,v:voltage.toFixed(3),c:current.toFixed(2),p:power.toFixed(3),e:state.energy.toFixed(4)});if(state.reportData.length>500)state.reportData.shift();}
  // Update fault detection first
  detectFaultTiles();

  if (document.getElementById("fault-count")) {
        updateFaultPanel();
  }
  return true;
}
  
function updateFaultPanel(){
  const faulty = tiles.filter(t => t.status === 'FAULTS');
  const warning = tiles.filter(t => t.status === 'NEEDS CHECK');
  const healthy = tiles.length - faulty.length - warning.length;

  const faultEl = document.getElementById('fault-count');
  const needsEl = document.getElementById('needs-check-count');
  const healthyEl = document.getElementById('healthy-count');
  const totalEl = document.getElementById('tile-total-count');
  if (faultEl) faultEl.textContent = faulty.length;
  if (needsEl) needsEl.textContent = warning.length;
  if (healthyEl) healthyEl.textContent = healthy;
  if (totalEl) totalEl.textContent = tiles.length;

  state.systemHealth = Math.round(((healthy * 100) + (warning.length * 60)) / Math.max(1, tiles.length));
  state.systemHealth = Math.max(0, Math.min(100, state.systemHealth));
  renderTileStatusGrid();

  const healthEl = document.getElementById('tile-health-summary');
  if (healthEl) healthEl.textContent = `${healthy}/${tiles.length} tiles healthy`;

  const logEl = document.getElementById('tile-fault-log');
  if (logEl) {
    logEl.innerHTML = state.faultHistory.length
      ? state.faultHistory.slice(0, 6).map(item => `
          <div class="tile-log-item ${item.status === 'FAULTS' ? 'fault' : 'warning'}">
            <div><strong>TILE ${String(item.tileId).padStart(2, '0')}</strong><span>${item.status}</span></div>
            <p>${item.message}</p>
            <small>${item.time}</small>
          </div>`).join('')
      : '<div class="tile-log-empty">No tile faults recorded.</div>';
  }
}

/**
 * Dynamically evaluate one tile's electrical and communication health.
 * Voltage history is stored on the tile object so the same evaluator
 * can be reused independently for T01..T04.
 */
function evaluateTileStatus(voltage, isTriggered, lastSeenTimestamp) {
  const now = Date.now();
  const v = Number(voltage);

  if (!Number.isFinite(v)) {
    return { status: 'FAULTS', message: 'Invalid voltage data received from tile sensor.', badgeClass: 'fault' };
  }

  const lastSeen = Number(lastSeenTimestamp);
  if (!Number.isFinite(lastSeen) || now - lastSeen > 5000) {
    return { status: 'FAULTS', message: 'No data received from ESP32 for more than 5 seconds.', badgeClass: 'fault' };
  }

  if (v > 5.0) {
    return { status: 'FAULTS', message: `Over-voltage detected (${v.toFixed(2)}V). Check signal-conditioning and protection circuit.`, badgeClass: 'fault' };
  }

  if (isTriggered && v <= 0.05) {
    return { status: 'FAULTS', message: 'Tile is triggered but producing no voltage. Check wiring or tile connection.', badgeClass: 'fault' };
  }

  if (isTriggered && v > 0.05 && v < 0.5) {
    return { status: 'NEEDS CHECK', message: `Tile output is unusually low (${v.toFixed(2)}V). Inspect mechanical pressure transfer and piezo element.`, badgeClass: 'warning' };
  }

  // Per-tile noise detection. A few samples are required so one spike
  // does not immediately create a false warning.
  const history = this && Array.isArray(this._voltageHistory) ? this._voltageHistory : [];
  if (history.length >= 6 && !isTriggered) {
    const samples = history.slice(-6);
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance = samples.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / samples.length;
    if (variance > 0.25) {
      return { status: 'NEEDS CHECK', message: 'Unstable signal detected. Check wiring, shielding and mechanical vibration.', badgeClass: 'warning' };
    }
  }

  // A triggered tile whose signal never changes can indicate a stuck ADC,
  // broken connection or sensor path.
  if (history.length >= 8 && isTriggered) {
    const samples = history.slice(-8);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    if ((max - min) < 0.01) {
      return { status: 'NEEDS CHECK', message: 'Tile signal appears stuck. Check sensor wiring and ADC input.', badgeClass: 'warning' };
    }
  }

  return { status: 'HEALTHY', message: 'Tile operating within expected range.', badgeClass: 'healthy' };
}

function detectFaultTiles() {
  tiles.forEach(tile => {
    if (!Array.isArray(tile._voltageHistory)) tile._voltageHistory = [];
    tile._voltageHistory.push(tile.voltage);
    if (tile._voltageHistory.length > 12) tile._voltageHistory.shift();

    const result = evaluateTileStatus.call(tile, tile.voltage, tile.isTriggered, tile.lastSeenTimestamp);
    const changed = tile.status !== result.status || tile.faultReason !== result.message;
    tile.status = result.status;
    tile.badgeClass = result.badgeClass;
    tile.faultReason = result.message;

    if (changed && result.status !== 'HEALTHY') {
      state.faultHistory.unshift({
        tileId: tile.id,
        status: result.status,
        message: result.message,
        time: new Date().toLocaleTimeString('en-GB')
      });
      if (state.faultHistory.length > 50) state.faultHistory.pop();

      if (result.status === 'FAULTS') {
        const key = `Tile ${tile.id} fault detected: ${result.message}`;
        if (!state.notifications.some(n => n.text === key)) {
          addNotification('warning', `Tile ${tile.id} fault detected`, result.message);
        }
      }
    }
  });
}

function generateDemoData() {
  const now = Date.now();
  const dt = state.lastSampleMs == null
    ? state.samplingRate / 1000
    : Math.min(3, Math.max(0.1, (now - state.lastSampleMs) / 1000));

  const pulse = state.demoPulse;
  const shouldStartPulse = !pulse.active &&
    (now - state.demoLastStepAt > 1400) &&
    (Math.random() < 0.72 || now - state.demoLastStepAt > 4200);

  if (shouldStartPulse) {
    pulse.active = true;
    pulse.peak = +(1.5 + Math.random() * 10.5).toFixed(2);
    pulse.startedAt = now;
    pulse.duration = 1200 + Math.random() * 900;
    state.demoLastStepAt = now;
    state.steps += 1;
  }

  let voltage = 0;
  let triggered = false;

  if (pulse.active) {
    const age = now - pulse.startedAt;
    const progress = age / pulse.duration;
    triggered = progress < 0.18;

    if (age >= pulse.duration) {
      pulse.active = false;
    } else {
      const rise = Math.min(1, age / 130);
      const decay = Math.exp(-Math.max(0, age - 90) / 430);
      const envelope = rise * decay;
      const noise = (Math.random() - 0.5) * Math.max(0.03, pulse.peak * 0.025);
      voltage = Math.max(0, pulse.peak * envelope + noise);
    }
  }

  if (!triggered && voltage < 0.15) voltage = Math.max(0, Math.random() * 0.08);

  if (state._demoFault) {
    const f = state._demoFault;
    if (f.kind === 'dead') voltage = 0;
    else if (f.kind === 'low') voltage = +(voltage * 0.18).toFixed(2);
    else if (f.kind === 'stuck') {
      if (f.stuckValue == null) f.stuckValue = +(Math.max(0.8, voltage * 0.6)).toFixed(2);
      voltage = f.stuckValue;
    } else if (f.kind === 'noise') {
      voltage = Math.max(0, voltage + (Math.random() - 0.5) * 3.5);
    }
  }

  const current = voltage > 0.15
    ? Math.min(45, 5 + ((Math.min(voltage, 12) - 1.5) / 10.5) * 40)
    : voltage * 3.2;
  const power = voltage * current;
  const energyGain = (power / 1000) * dt * 0.78;

  state.energy += Math.max(0, energyGain);
  state.simEnergy += Math.max(0, energyGain);
  state.efficiency = +(75 + Math.random() * 20).toFixed(1);
  state.capacitorPct = Math.min(100, state.capacitorPct + Math.max(0, energyGain * 1.8));
  state.capacitorVoltage = +(state.capacitorPct / 100 * 5).toFixed(2);

  tiles.forEach(tile => {
    const f = state._demoFault;
    if (f && tile.id === f.id) {
      if (f.kind === 'dead') tile.voltage = 0;
      else if (f.kind === 'low') tile.voltage = +(voltage * 0.18).toFixed(2);
      else if (f.kind === 'stuck') tile.voltage = f.stuckValue ?? 1.2;
      else tile.voltage = Math.max(0, +(voltage + (Math.random() - 0.5) * 2.8).toFixed(2));
    } else {
      tile.voltage = +(voltage * (0.88 + Math.random() * 0.18)).toFixed(2);
    }
    tile.isTriggered = triggered;
    tile.lastSeenTimestamp = now;
  });

  recordSample({
    voltage, current, power, energy: state.energy, steps: state.steps,
    efficiency: state.efficiency, capacitorPct: state.capacitorPct,
    capacitorVoltage: state.capacitorVoltage, isTriggered: triggered,
    tiles: tiles.map(tile => ({ id: tile.id, voltage: tile.voltage, isTriggered: tile.isTriggered }))
  }, 'demo');
}
/* ─────────────────────────────────────────────────────────────────
   DATA LOOP
───────────────────────────────────────────────────────────────── */
function startDataLoop() {
  if (state.demoTimer) clearInterval(state.demoTimer);
  const tick = () => {
    if (state.running && state.dataMode === 'demo') {
      generateDemoData();
      updateUI();
    }
  };
  state.demoTimer = setInterval(tick, Math.max(1000, state.samplingRate));
  tick();
}
/* ─────────────────────────────────────────────────────────────────
   UI UPDATE
───────────────────────────────────────────────────────────────── */
function updateUI() {
  // Metric cards
  animateNumber('m-voltage', state.voltage, 3);
  animateNumber('m-current', state.current, 2);
  animateNumber('m-power',   state.power,   2);
  animateNumber('m-energy',  state.energy,  3);

  setText('v-peak', state.peakVoltage.toFixed(2) + 'V');
  setText('v-avg',  state.avgVoltage.toFixed(2)  + 'V');
  setText('c-peak', state.peakCurrent.toFixed(2) + 'mA');
  setText('c-avg',  state.avgCurrent.toFixed(2)  + 'mA');
  setText('p-peak', state.peakPower.toFixed(2)   + 'mW');
  setText('p-avg',  state.avgPower.toFixed(2)    + 'mW');
  setText('e-cap',  state.capacitorPct.toFixed(0) + '%');
  setText('e-rate', (state.power * 0.06).toFixed(2) + 'J/min');

  // Hero ring
  const health = state.systemHealth;
  const ringFill = document.getElementById('hero-ring-fill');
  const ringVal  = document.getElementById('hero-ring-val');
  if (ringFill) {
    const circ = 2 * Math.PI * 85;
    ringFill.style.strokeDashoffset = circ * (1 - health / 100);
    ringFill.setAttribute('stroke', 'url(#ringGrad)');
  }
  if (ringVal) ringVal.textContent = health + '%';
  setText('eff-display', state.efficiency.toFixed(0) + '%');
  setText('steps-display', state.steps.toLocaleString());

  // LED & capacitor status
  updateLEDStatus();
  updateCapacitorStatus();

  // Bridge rectifier AC/DC values
  const acEl = document.getElementById('br-ac-in');
  const dcEl = document.getElementById('br-dc-out');
  if (acEl) acEl.textContent = (state.voltage * 1.1).toFixed(2) + ' V';
  if (dcEl) dcEl.textContent = state.voltage.toFixed(2) + ' V';

  // Update sparklines
  updateSparklines();

  // Update main chart
  updateMainChart();

  // Live charts (only if visible)
  if (currentPage === 'live') updateLiveCharts();
  if (currentPage === 'energy') updateEnergyPage();
  if (currentPage === 'performance') updatePerformancePage();
  if (currentPage === 'piezo') updateDiscUI();
}

/* ─────────────────────────────────────────────────────────────────
   LED & CAPACITOR STATUS
───────────────────────────────────────────────────────────────── */
function updateLEDStatus() {
  const dot = document.getElementById('led-dot');
  const tag  = document.getElementById('led-status-tag');
  const simLed = document.getElementById('sim-led');
  const ledBulb = document.getElementById('led-bulb');
  const ledGlow = document.getElementById('led-glow');

  if (state.ledOn) {
    dot && dot.classList.add('green');
    if (tag) { tag.textContent = 'ON'; tag.className = 'status-tag green'; }
    if (simLed) simLed.innerHTML = '<i class="fa-solid fa-circle" style="color:#fbbf24"></i> ON';
    ledBulb && ledBulb.classList.add('on');
    ledGlow && ledGlow.classList.add('on');
  } else {
    dot && dot.classList.remove('green');
    if (tag) { tag.textContent = 'OFF'; tag.className = 'status-tag'; }
    if (simLed) simLed.innerHTML = '<i class="fa-solid fa-circle"></i> OFF';
    ledBulb && ledBulb.classList.remove('on');
    ledGlow && ledGlow.classList.remove('on');
  }
}

function updateCapacitorStatus() {
  const dot = document.getElementById('cap-dot');
  const tag  = document.getElementById('cap-status-tag');
  const pct  = state.capacitorPct;
  if (pct > 90) {
    dot && (dot.className = 'status-dot green');
    if (tag) { tag.textContent = 'Full'; tag.className = 'status-tag green'; }
  } else if (pct > 20) {
    dot && (dot.className = 'status-dot blue');
    if (tag) { tag.textContent = 'Charging'; tag.className = 'status-tag blue'; }
  } else {
    dot && (dot.className = 'status-dot amber');
    if (tag) { tag.textContent = 'Low'; tag.className = 'status-tag amber'; }
  }
}

/* ─────────────────────────────────────────────────────────────────
   ANIMATED NUMBER
───────────────────────────────────────────────────────────────── */
const animTargets = {};
function animateNumber(id, target, decimals = 2) {
  const el = document.getElementById(id);
  if (!el) return;
  if (animTargets[id] === undefined) animTargets[id] = 0;
  const current = animTargets[id];
  const step = (target - current) * 0.18;
  animTargets[id] = current + step;
  el.textContent = animTargets[id].toFixed(decimals);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ─────────────────────────────────────────────────────────────────
   SPARKLINES
───────────────────────────────────────────────────────────────── */
function drawSparkline(canvasId, data, color, fillColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 200;
  const H = canvas.offsetHeight || 50;
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  if (data.length < 2) return;

  const max = Math.max(...data, 0.01);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pad = 4;

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (W - 2*pad),
    y: H - pad - ((v - min) / range) * (H - 2*pad),
  }));

  // Fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, fillColor);
  grad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, H);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i-1], curr = pts[i];
    const cx = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cx, prev.y, cx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dot at end
  const last = pts[pts.length-1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, 2*Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function updateSparklines() {
  const v = state.history.v.slice(-30);
  const c = state.history.c.slice(-30);
  const p = state.history.p.slice(-30);
  const e = state.history.e.slice(-30);
  drawSparkline('spark-voltage', v, '#3B82F6', 'rgba(59,130,246,0.15)');
  drawSparkline('spark-current', c, '#10B981', 'rgba(16,185,129,0.15)');
  drawSparkline('spark-power',   p, '#F59E0B', 'rgba(245,158,11,0.15)');
  drawSparkline('spark-energy',  e, '#8B5CF6', 'rgba(139,92,246,0.15)');
}

/* ─────────────────────────────────────────────────────────────────
   CHART.JS SETUP HELPERS
───────────────────────────────────────────────────────────────── */
Chart.defaults.color = '#71717A';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";

function makeLineChart(canvasId, label, color, yLabel = '') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 200);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '00');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        backgroundColor: grad,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      scales: {
        x: {
          ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
        },
        y: {
          title: { display: !!yLabel, text: yLabel, color: '#71717A', font: { size: 10 } },
          ticks: { font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
          beginAtZero: true,
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(9,9,11,0.9)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#A1A1AA',
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toFixed(3)} ${yLabel}`,
          },
        },
      },
      interaction: { mode: 'index', intersect: false },
    }
  });
}

function pushChartData(chart, label, value) {
  if (!chart) return;
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > state.maxHistory) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update('none');
}

/* ─────────────────────────────────────────────────────────────────
   MAIN CHART (Dashboard)
───────────────────────────────────────────────────────────────── */
function initCharts() {
  // Add SVG gradient defs for hero ring
  const svgNS = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = `
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3B82F6"/>
      <stop offset="100%" style="stop-color:#10B981"/>
    </linearGradient>`;
  document.querySelector('.hero-ring')?.prepend(defs);

  charts.main = makeLineChart('main-chart', 'Voltage', '#3B82F6', 'V');
  charts.simSpike = makeLineChart('sim-spike-chart', 'Voltage', '#10B981', 'V');
  charts.energyAccum = makeLineChart('energy-accum-chart', 'Energy (J)', '#8B5CF6', 'J');

  // Monthly bar chart
  initMonthlyChart();

  // Performance daily chart
  initPerfDailyChart();

  // Live page charts
  charts.liveV  = makeLineChart('live-voltage-chart', 'Voltage', '#3B82F6', 'V');
  charts.liveC  = makeLineChart('live-current-chart', 'Current', '#10B981', 'mA');
  charts.liveP  = makeLineChart('live-power-chart',   'Power',   '#F59E0B', 'mW');
  charts.liveE  = makeLineChart('live-energy-chart',  'Energy',  '#8B5CF6', 'J');
  charts.liveEff = makeLineChart('live-eff-chart',    'Efficiency', '#EF4444', '%');

  // Live daily bar chart
  initLiveDailyChart();

  // Chart window controls
  document.querySelectorAll('.chart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const win = parseInt(btn.dataset.window);
      state.chartWindow=Math.max(10,Math.min(win,3600)); state.maxHistory=state.chartWindow; updateMainChart(); if(currentPage==='live')updateLiveCharts();
    });
  });
}

function updateMainChart() {
  if (!charts.main) return;
  const metricMap = {
    voltage: { label: 'Voltage', unit: 'V', data: state.history.v },
    current: { label: 'Current', unit: 'mA', data: state.history.c },
    power:   { label: 'Power', unit: 'mW', data: state.history.p },
  };
  const selected = metricMap[state.chartMetric] || metricMap.voltage;
  charts.main.data.labels = [...state.history.t];
  charts.main.data.datasets[0].label = selected.label;
  charts.main.data.datasets[0].data = [...selected.data];
  charts.main.options.scales.y.title.text = selected.unit;
  charts.main.options.plugins.tooltip.callbacks.label = ctx => ` ${Number(ctx.parsed.y).toFixed(2)} ${selected.unit}`;
  charts.main.update('none');
}

function initChartMetricToggle() {
  const controls = document.querySelector('.chart-controls');
  if (!controls || controls.querySelector('[data-metric]')) return;
  ['voltage', 'current', 'power'].forEach(metric => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chart-btn metric-toggle ${metric === 'voltage' ? 'active' : ''}`;
    btn.dataset.metric = metric;
    btn.textContent = metric === 'voltage' ? 'V' : metric === 'current' ? 'I' : 'P';
    btn.title = metric[0].toUpperCase() + metric.slice(1);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.metric-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.chartMetric = metric;
      updateMainChart();
    });
    controls.appendChild(btn);
  });
}

function updateLiveCharts() {
  if (!charts.liveV) return;

  const h = state.history;

  const map = {
    liveV: h.v,
    liveC: h.c,
    liveP: h.p,
    liveE: h.e,
    liveEff: h.v.map(() => state.efficiency)
  };

  Object.keys(map).forEach(key => {
    charts[key].data.labels = [...h.t];
    charts[key].data.datasets[0].data = [...map[key]];
    charts[key].update('none');
  });
}
function resizeLiveCharts() {
  ['liveV','liveC','liveP','liveE','liveEff'].forEach(k => charts[k]?.resize());
}

function initMonthlyChart() {
  const ctx = document.getElementById('monthly-chart')?.getContext('2d');
  if (!ctx) return;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const values = months.map(() => +(Math.random() * 80 + 20).toFixed(1));
  charts.monthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Energy (J)',
        data: values,
        backgroundColor: months.map((_,i) => i === new Date().getMonth() ? '#3B82F6' : 'rgba(59,130,246,0.3)'),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      }
    }
  });
}

function initLiveDailyChart() {
  const ctx = document.getElementById('live-daily-chart')?.getContext('2d');
  if (!ctx) return;
  const hours = Array.from({length: 24}, (_,i) => `${String(i).padStart(2,'0')}:00`);
  const values = hours.map(() => +(Math.random() * 12 + 1).toFixed(2));
  charts.liveDaily = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hours,
      datasets: [{
        label: 'Energy (J)',
        data: values,
        backgroundColor: 'rgba(16,185,129,0.4)',
        borderColor: '#10B981',
        borderWidth: 1,
        borderRadius: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      }
    }
  });
}

function initPerfDailyChart() {
  const ctx = document.getElementById('perf-daily-chart')?.getContext('2d');
  if (!ctx) return;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  charts.perfDaily = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: 'Harvested (J)',
        data: days.map(() => +(Math.random() * 100 + 30).toFixed(1)),
        backgroundColor: 'rgba(59,130,246,0.4)',
        borderColor: '#3B82F6', borderWidth: 1, borderRadius: 6,
      },{
        label: 'Target (J)',
        data: days.map(() => 100),
        backgroundColor: 'rgba(16,185,129,0.15)',
        borderColor: '#10B981', borderWidth: 1, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#A1A1AA', font: { size: 11 } } } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      }
    }
  });
}

/* ─────────────────────────────────────────────────────────────────
   ENERGY PAGE
───────────────────────────────────────────────────────────────── */
function updateEnergyPage() {
  const pct = state.capacitorPct;
  const circ = 2 * Math.PI * 95;

  // Capacitor gauge
  const gaugeFill = document.getElementById('cap-gauge-fill');
  if (gaugeFill) gaugeFill.style.strokeDashoffset = circ * (1 - pct / 100);
  setText('cap-pct-val', pct.toFixed(0) + '%');
  setText('cap-voltage-val', state.capacitorVoltage.toFixed(2) + 'V');

  // Details
  const speed = state.power > 8 ? 'Fast' : state.power > 3 ? 'Moderate' : 'Slow';
  setText('cap-speed', speed);
  const remaining = Math.max(0, (100 - pct) / Math.max(0.01, state.power) * 10);
  const mins = Math.floor(remaining); const secs = Math.floor((remaining % 1) * 60);
  setText('cap-eta', `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`);
  setText('cap-stored', state.energy.toFixed(3) + ' J');

  // Battery fill
  const battFill = document.getElementById('battery-fill');
  if (battFill) battFill.style.height = pct + '%';
  setText('battery-pct-inside', pct.toFixed(0) + '%');
  setText('batt-v', state.capacitorVoltage.toFixed(2) + 'V');

  const lightning = document.getElementById('battery-lightning');
  if (lightning) {
    lightning.classList.toggle('charging', pct < 95);
  }

  // Energy accumulation chart
  const ts = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  pushChartData(charts.energyAccum, ts, state.energy);
}

/* ─────────────────────────────────────────────────────────────────
   PERFORMANCE PAGE
───────────────────────────────────────────────────────────────── */
function updatePerformancePage() {
  // Efficiency arc (half circle, 283 is circumference for r=90)
  const eff = Math.min(100, Math.max(0, state.efficiency));
  const effArc = document.getElementById('eff-arc');
  if (effArc) effArc.style.strokeDashoffset = 283 * (1 - eff / 100);
  setText('eff-pct-text', eff.toFixed(0) + '%');
  setText('perf-health', state.systemHealth + '%');

  const active = tiles.filter(d => d.state === 'active').length;
  setText('perf-discs', `${active}/${TILE_COUNT}`);
  setText('perf-conv', (eff * 0.95).toFixed(1) + '%');
}

/* ─────────────────────────────────────────────────────────────────
   ANALYTICS CHARTS
───────────────────────────────────────────────────────────────── */
function initAnalyticsCharts() {
  // Weekly bar chart
  const wCtx = document.getElementById('anal-weekly')?.getContext('2d');
  if (wCtx) {
    new Chart(wCtx, {
      type: 'bar',
      data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
          label: 'Energy (J)',
          data: [45, 72, 63, 89, 55, 41, 98],
          backgroundColor: 'rgba(59,130,246,0.5)',
          borderColor: '#3B82F6', borderWidth: 2, borderRadius: 8,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
      }
    });
  }

  // Monthly comparison
  const mCtx = document.getElementById('anal-monthly')?.getContext('2d');
  if (mCtx) {
    const months = ['Aug 2024','Sep','Oct','Nov','Dec','Jan 2025','Feb','Mar'];
    new Chart(mCtx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'This Year',
          data: [120,185,210,163,220,198,245,280],
          borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)',
          fill: true, tension: 0.4, pointRadius: 4,
        },{
          label: 'Last Year',
          data: [100,140,160,130,170,155,200,220],
          borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'transparent',
          tension: 0.4, borderDash: [4,4], pointRadius: 0,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#A1A1AA', font: { size: 11 } } } },
        scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { beginAtZero: true } }
      }
    });
  }

  // Voltage distribution (doughnut)
  const vdCtx = document.getElementById('anal-volt-dist')?.getContext('2d');
  if (vdCtx) {
    new Chart(vdCtx, {
      type: 'doughnut',
      data: {
        labels: ['0-2V','2-4V','4-6V','6-8V','8V+'],
        datasets: [{
          data: [5, 30, 40, 20, 5],
          backgroundColor: ['rgba(239,68,68,0.7)','rgba(245,158,11,0.7)','rgba(59,130,246,0.7)','rgba(16,185,129,0.7)','rgba(139,92,246,0.7)'],
          borderWidth: 0, spacing: 3,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'right', labels: { color: '#A1A1AA', font: { size: 11 }, boxWidth: 12 } } },
      }
    });
  }

  // Power vs Efficiency scatter
  const peCtx = document.getElementById('anal-pwr-eff')?.getContext('2d');
  if (peCtx) {
    const scatterData = Array.from({ length: 50 }, () => ({
      x: +(Math.random() * 15).toFixed(2),
      y: +(65 + Math.random() * 30).toFixed(1),
    }));
    new Chart(peCtx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Power vs Eff',
          data: scatterData,
          backgroundColor: 'rgba(59,130,246,0.6)',
          pointRadius: 5, pointHoverRadius: 7,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'Power (mW)', color: '#A1A1AA' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { title: { display: true, text: 'Efficiency (%)', color: '#A1A1AA' }, beginAtZero: false }
        }
      }
    });
  }
}

/* ─────────────────────────────────────────────────────────────────
   PIEZO ARRAY
───────────────────────────────────────────────────────────────── */
function initPiezoArray() {
  renderDiscGroups();
  renderTileStatusGrid();
  document.getElementById('btn-activate-all')?.addEventListener('click', () => {
    tiles.forEach(d => { if (d.state !== 'fault') d.state = 'active'; });
    renderDiscGroups();
    showToast('success', 'All tiles activated');
  });
  document.getElementById('btn-reset-discs')?.addEventListener('click', () => {
    tiles.forEach(d => { d.state = 'active'; });
    renderDiscGroups();
    showToast('info', 'Tile array reset');
  });
  document.getElementById('btn-demo-fault')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-demo-fault');
    if (state._demoFault && state._demoFaultForced) {
      // Turn Off — clear the forced fault
      state._demoFault = null;
      state._demoFaultForced = false;
      btn.textContent = 'Demo fault: Off';
    } else {
      // Turn On — force a random tile dead (0V), guaranteed to show
      // as a red FAULT immediately (no ambiguous threshold cases)
      const pickId = 1 + Math.floor(Math.random() * TILE_COUNT);
      state._demoFault = { id: pickId, kind: 'dead', stuckValue: null };
      state._demoFaultForced = true;
      btn.textContent = `Demo fault: On (Tile ${pickId})`;
    }
  });
}

function renderTileStatusGrid() {
  const container = document.getElementById('tile-status-grid');
  if (!container) return;

  container.innerHTML = tiles.map(tile => {
    const status = tile.status || 'HEALTHY';
    const stateClass = status === 'FAULTS' ? 'fault' : status === 'NEEDS CHECK' ? 'warning' : 'healthy';
    const icon = status === 'FAULTS' ? 'fa-triangle-exclamation' : status === 'NEEDS CHECK' ? 'fa-screwdriver-wrench' : 'fa-circle-check';
    return `
      <div class="tile-status-item ${stateClass}" id="tile-status-${tile.id}" data-tile-id="${tile.id}" tabindex="0" role="button" aria-label="Tile ${tile.id} ${status}">
        <div class="tile-status-topline">
          <div class="tile-status-label">TILE ${String(tile.id).padStart(2, '0')}</div>
          <span class="tile-status-badge ${tile.badgeClass}">${status}</span>
        </div>
        <div class="tile-status-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="tile-status-state">${status}</div>
        <div class="tile-status-volt">${tile.voltage.toFixed(2)} V</div>
        <div class="tile-status-sub">${tile.faultReason || 'Tile operating within expected range.'}</div>
      </div>`;
  }).join('');
}

function renderDiscGroups() {
  const container = document.getElementById('disc-groups');
  if (!container) return;
  container.innerHTML = '';

  const groups = [
    { label: 'TILE Array — 2 × 2', discs: Array.from({length:TILE_COUNT},(_,i)=>i+1) },
  ];

  groups.forEach(g => {
    const groupEl = document.createElement('div');
    groupEl.className = 'disc-group';
    groupEl.innerHTML = `<div class="disc-group-label">${g.label} <span style="color:var(--text-sec);font-family:var(--font-mono);font-size:0.65rem">— Parallel</span></div>`;
    const row = document.createElement('div');
    row.className = 'disc-row';
    g.discs.forEach(id => {
      const disc = tiles[id - 1];
      const item = document.createElement('div');
      item.className = 'disc-item';
      item.id = `disc-item-${id}`;
      item.innerHTML = `
        <div class="disc-circle ${disc.state}" id="disc-${id}">T${String(id).padStart(2,'0')}</div>
        <div class="disc-num">T${String(id).padStart(2,'0')}</div>
        <div class="disc-volt" id="disc-v-${id}">${disc.voltage.toFixed(1)}V</div>`;
      item.addEventListener('click', () => cycleDiscState(disc, item));
      row.appendChild(item);
    });
    groupEl.appendChild(row);
    container.appendChild(groupEl);
  });

  updateActiveCount();
}

function cycleDiscState(disc, item) {
  const states = ['active','idle','standby'];
  const idx = states.indexOf(disc.state);
  disc.state = states[(idx + 1) % states.length];
  const circle = document.getElementById(`disc-${disc.id}`);
  if (circle) circle.className = `disc-circle ${disc.state}`;
  updateActiveCount();
  showToast('info', `Tile ${disc.id} → ${disc.state}`);
}

function updateDiscUI() {
  tiles.forEach(d => {
    const voltEl = document.getElementById(`disc-v-${d.id}`);
    const circle = document.getElementById(`disc-${d.id}`);

    if (voltEl)
      voltEl.textContent = d.state === 'active' ? d.voltage.toFixed(1) + 'V' : '0.0V';

    if (circle) {
      circle.className = `disc-circle ${d.state}`;

      // Highlight faulty / warning tiles
      circle.classList.remove("fault", "warning");
      if (d.status === "FAULTS") circle.classList.add("fault");
      else if (d.status === "NEEDS CHECK") circle.classList.add("warning");
    }
  });

  updateActiveCount();
}
function updateActiveCount() {
  const active = tiles.filter(d => d.state === "active").length;
  const idle = tiles.filter(d => d.state === "idle").length;
  const standby = tiles.filter(d => d.state === "standby").length;
  const fault = tiles.filter(d => d.status === "FAULTS").length;

  // Main counter (if it exists)
  const activeEl = document.getElementById("active-count");
  if (activeEl) activeEl.textContent = active;

  // Optional status counters (only update if the elements exist)
  const idleEl = document.getElementById("idle-count");
  if (idleEl) idleEl.textContent = idle;

  const standbyEl = document.getElementById("standby-count");
  if (standbyEl) standbyEl.textContent = standby;

  const faultEl = document.getElementById("fault-count");
  if (faultEl) faultEl.textContent = fault;
}

/* ─────────────────────────────────────────────────────────────────
   MECHANICAL EXPLODED VIEW
───────────────────────────────────────────────────────────────── */
function initMechanicalExplode() {
  const simRow = document.getElementById('piezo-sim-row');
  if (simRow) {
    for (let i = 0; i < TILE_COUNT; i++) {
      const d = document.createElement('div');
      d.className = 'piezo-sim-disc';
      d.id = `sim-disc-${i}`;
      simRow.appendChild(d);
    }
  }
}

/* ─────────────────────────────────────────────────────────────────
   SIMULATION
───────────────────────────────────────────────────────────────── */
function initSimulation() {
  document.getElementById('btn-footstep')?.addEventListener('click', triggerSimulation);
}

let simActive = false;
function triggerSimulation() {
  if (simActive) return;
  simActive = true;

  const now = Date.now();
  const peakV = +(1.5 + Math.random() * 10.5).toFixed(2);
  const current = Math.min(45, 5 + ((Math.min(peakV, 12) - 1.5) / 10.5) * 40);
  const power = peakV * current;
  const energyGain = +(0.03 + power / 1000 * 0.45).toFixed(4);

  state.simSteps += 1;
  state.steps += 1;
  state.simEnergy += energyGain;
  state.energy += energyGain;
  state.efficiency = +(75 + Math.random() * 20).toFixed(1);
  state.capacitorPct = Math.min(100, state.capacitorPct + energyGain * 1.8);
  state.capacitorVoltage = +(state.capacitorPct / 100 * 5).toFixed(2);
  state.demoPulse = { active: true, peak: peakV, startedAt: now, duration: 1100 };
  state.demoLastStepAt = now;

  tiles.forEach(tile => {
    tile.voltage = +(peakV * (0.88 + Math.random() * 0.18)).toFixed(2);
    tile.isTriggered = true;
    tile.lastSeenTimestamp = now;
  });

  recordSample({
    voltage: peakV, current, power, energy: state.energy, steps: state.steps,
    efficiency: state.efficiency, capacitorPct: state.capacitorPct,
    capacitorVoltage: state.capacitorVoltage, isTriggered: true,
    tiles: tiles.map(tile => ({ id: tile.id, voltage: tile.voltage, isTriggered: true }))
  }, 'demo');
  updateUI();
  setText('sim-steps', state.simSteps);
  setText('sim-energy', state.simEnergy.toFixed(3) + 'J');

  const btn = document.getElementById('btn-footstep');
  btn?.classList.add('simulating');
  document.getElementById('layer-springs')?.style.setProperty('transform', 'translateY(8px) scale(0.97)');
  document.getElementById('layer-top')?.style.setProperty('transform', 'translateY(12px)');
  for (let i = 0; i < TILE_COUNT; i++) document.getElementById(`sim-disc-${i}`)?.classList.add('active-sim');
  document.getElementById('led-bulb')?.classList.add('on');
  document.getElementById('led-glow')?.classList.add('on');

  const spikeData = [];
  for (let i = 0; i < 30; i++) {
    const x = i / 29;
    const v = peakV * (x < 0.17 ? x / 0.17 : Math.exp(-(x - 0.17) * 4.8));
    spikeData.push({ v: Math.max(0, v), t: `${Math.round(x * 1200)}ms` });
  }
  if (charts.simSpike) {
    charts.simSpike.data.labels = spikeData.map(d => d.t);
    charts.simSpike.data.datasets[0].data = spikeData.map(d => d.v);
    charts.simSpike.update();
  }

  setTimeout(() => {
    simActive = false;
    btn?.classList.remove('simulating');
    document.getElementById('layer-springs')?.style.removeProperty('transform');
    document.getElementById('layer-top')?.style.removeProperty('transform');
    for (let i = 0; i < TILE_COUNT; i++) document.getElementById(`sim-disc-${i}`)?.classList.remove('active-sim');
    document.getElementById('led-bulb')?.classList.remove('on');
    document.getElementById('led-glow')?.classList.remove('on');
  }, 700);
}
/* ─────────────────────────────────────────────────────────────────
   AI INSIGHTS
───────────────────────────────────────────────────────────────── */
const AI_INSIGHTS=[
 {icon:'⚡',title:'Live Output',text:'Measurements are read from the selected data source.',type:'info'},
 {icon:'📈',title:'Trend Analysis',text:'Peak and average values are calculated from recorded history.',type:'info'},
 {icon:'🔋',title:'Energy Tracking',text:'Accumulated energy is integrated from measured power and does not decrease.',type:'ok'},
 {icon:'🔌',title:'ESP32 Ready',text:'Serial and WiFi inputs accept live measurements when hardware is connected.',type:'ok'},
 {icon:'🧪',title:'Demo Mode',text:'Random readings are used only in Demo Mode.',type:'info'}
];

function initAIInsights() {
  // Ticker
  const tickerInner = document.getElementById('ai-ticker-inner');
  if (tickerInner) {
    tickerInner.textContent = AI_INSIGHTS.map(i => `⚡ ${i.title}: ${i.text}`).join('   ·   ');
  }

  // Grid
  const grid = document.getElementById('ai-grid');
  if (grid) {
    grid.innerHTML = '';
    AI_INSIGHTS.forEach(insight => {
      const div = document.createElement('div');
      div.className = 'ai-insight-item';
      div.innerHTML = `
        <div class="ai-insight-icon">${insight.icon}</div>
        <div class="ai-insight-text">
          <span class="ai-insight-title">${insight.title}</span>
          ${insight.text}
        </div>`;
      grid.appendChild(div);
    });
  }
}

/* ─────────────────────────────────────────────────────────────────
   COMMAND PALETTE
───────────────────────────────────────────────────────────────── */
const COMMANDS = [
  { icon: 'fa-gauge-high',    label: 'Dashboard',        action: () => switchPage('dashboard'),   shortcut: '⌘1' },
  { icon: 'fa-wave-square',   label: 'Live Monitoring',  action: () => switchPage('live'),         shortcut: '⌘2' },
  { icon: 'fa-circle-nodes',  label: 'Piezo Array',      action: () => switchPage('piezo'),        shortcut: '⌘3' },
  { icon: 'fa-battery-full',  label: 'Energy Storage',   action: () => switchPage('energy'),       shortcut: '' },
  { icon: 'fa-sitemap',       label: 'Bridge Rectifier', action: () => switchPage('bridge'),       shortcut: '' },
  { icon: 'fa-chart-line',    label: 'Performance',      action: () => switchPage('performance'),  shortcut: '' },
  { icon: 'fa-chart-bar',     label: 'Analytics',        action: () => switchPage('analytics'),    shortcut: '' },
  { icon: 'fa-flask',         label: 'Prototype',        action: () => switchPage('prototype'),    shortcut: '' },
  { icon: 'fa-file-export',   label: 'Reports',          action: () => switchPage('reports'),      shortcut: '' },
  { icon: 'fa-gear',          label: 'Settings',         action: () => switchPage('settings'),     shortcut: '' },
  { icon: 'fa-shoe-prints',   label: 'Simulate Footstep', action: triggerSimulation,              shortcut: '⌘S' },
  { icon: 'fa-moon',          label: 'Toggle Theme',     action: toggleTheme,                      shortcut: '⌘T' },
  { icon: 'fa-expand',        label: 'Fullscreen',       action: () => document.documentElement.requestFullscreen(), shortcut: '' },
];

function openCommandPalette() {
  const overlay = document.getElementById('cmd-palette-overlay');
  overlay?.classList.remove('hidden');
  document.getElementById('cmd-input')?.focus();
  renderCommandResults('');
}

function initCommandPalette() {
  const overlay = document.getElementById('cmd-palette-overlay');
  const input   = document.getElementById('cmd-input');

  overlay?.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
  input?.addEventListener('input', e => renderCommandResults(e.target.value));
  input?.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay?.classList.add('hidden');
  });

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openCommandPalette(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); triggerSimulation(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 't') { e.preventDefault(); toggleTheme(); }
    if (e.key === 'Escape') overlay?.classList.add('hidden');
    // Number shortcuts
    if (e.metaKey || e.ctrlKey) {
      if (e.key === '1') switchPage('dashboard');
      if (e.key === '2') switchPage('live');
      if (e.key === '3') switchPage('tiles');
    }
  });
}

function renderCommandResults(query) {
  const results = document.getElementById('cmd-results');
  if (!results) return;
  const q = query.toLowerCase();
  const filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(q));
  results.innerHTML = filtered.map((cmd, i) => `
    <div class="cmd-item" onclick="(${cmd.action.toString()})(); document.getElementById('cmd-palette-overlay').classList.add('hidden')">
      <i class="cmd-item-icon fa-solid ${cmd.icon}"></i>
      <span class="cmd-item-label">${cmd.label}</span>
      ${cmd.shortcut ? `<kbd class="cmd-item-shortcut">${cmd.shortcut}</kbd>` : ''}
    </div>`).join('');
}

/* ─────────────────────────────────────────────────────────────────
   NOTIFICATIONS
───────────────────────────────────────────────────────────────── */
function seedNotifications() {
  state.notifications = [
    { icon: '✅', title: 'System Online', sub: 'Dashboard initialized successfully', time: 'just now' },
    { icon: 'ℹ️', title: 'Demo Mode', sub: 'Random values are simulation-only', time: 'now' },
    { icon: '📊', title: 'Efficiency Report', sub: 'Weekly report available', time: '5m ago' },
  ];
  renderNotifications();
}

function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  list.innerHTML = state.notifications.map(n => `
    <div class="notif-item">
      <div class="notif-icon">${n.icon}</div>
      <div class="notif-body">
        <div class="notif-title">${n.title}</div>
        <div class="notif-sub">${n.sub}</div>
      </div>
      <div class="notif-time">${n.time}</div>
    </div>`).join('') || '<div style="padding:1rem;color:var(--text-muted);font-size:0.8rem;text-align:center">No notifications</div>';
  document.getElementById('notif-count').textContent = state.notifications.length;
}

function initNotifications() {
  // Close when clicking outside
  document.addEventListener('click', e => {
    const panel = document.getElementById('notif-panel');
    const btn   = document.getElementById('notif-btn');
    if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}

/* ─────────────────────────────────────────────────────────────────
   TOAST NOTIFICATIONS
───────────────────────────────────────────────────────────────── */
function showToast(type, message) {
  const icons = { success: 'fa-check-circle', error: 'fa-xmark-circle', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} toast-icon"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ─────────────────────────────────────────────────────────────────
   COMPONENT HEALTH
───────────────────────────────────────────────────────────────── */
const COMPONENTS = [
 {name:'Floor Tiles (×4)',status:'Configured'},
 {name:'Bridge Rectifier',status:'Configured'},
 {name:'Capacitor',status:'Configured'},
 {name:'LED / Load',status:'Configured'},
 {name:'Spring Suspension',status:'Mechanical'},
 {name:'Foam Pads',status:'Mechanical'},
 {name:'Acrylic Sheet',status:'Mechanical'},
 {name:'Plywood Base',status:'Mechanical'}
];

function initComponentHealth(){
 const list=document.getElementById('comp-health-list'); if(!list)return;
 list.innerHTML=COMPONENTS.map(c=>`<div class="comp-health-item"><div class="comp-health-header"><span class="comp-name">${c.name}</span><span class="comp-pct text-sec">${c.status}</span></div><div class="comp-bar"><div class="comp-bar-fill" style="width:100%;background:var(--blue);opacity:.35"></div></div></div>`).join('');
}

/* ─────────────────────────────────────────────────────────────────
   REPORTS
───────────────────────────────────────────────────────────────── */
function updateReportDate() {
  const el = document.getElementById('report-date');
  if (el) el.textContent = new Date().toLocaleString();
}

function initReports() {
  document.getElementById('btn-csv')?.addEventListener('click', exportCSV);
  document.getElementById('btn-pdf')?.addEventListener('click', exportPDF);
  document.getElementById('btn-xls')?.addEventListener('click', exportExcel);

  // Populate report preview table
  setInterval(updateReportTable, 5000);
  updateReportTable();
}

function updateReportTable() {
  const tbody = document.getElementById('report-tbody');
  if (!tbody) return;
  const data = state.reportData.slice(-20).reverse();
  tbody.innerHTML = data.map(d => `
    <tr>
      <td>${d.ts}</td>
      <td>${d.v}</td>
      <td>${d.c}</td>
      <td>${d.p}</td>
      <td>${d.e}</td>
    </tr>`).join('');
}

function exportCSV() {
  const rows = [['Timestamp','Voltage(V)','Current(mA)','Power(mW)','Energy(J)']];
  state.reportData.forEach(d => rows.push([d.ts, d.v, d.c, d.p, d.e]));
  const csv = rows.map(r => r.join(',')).join('\n');
  downloadFile('piezo-report.csv', csv, 'text/csv');
  showToast('success', 'CSV exported!');
}

function exportPDF() {
  showToast('info', 'PDF export requires print dialog — Ctrl+P to print');
  setTimeout(() => window.print(), 500);
}

function exportExcel() {
  const rows = [['Timestamp','Voltage(V)','Current(mA)','Power(mW)','Energy(J)']];
  state.reportData.forEach(d => rows.push([d.ts, d.v, d.c, d.p, d.e]));
  const csv = rows.map(r => r.join('\t')).join('\n');
  downloadFile('piezo-report.xls', csv, 'application/vnd.ms-excel');
  showToast('success', 'Excel exported!');
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────────────────────
   SETTINGS
───────────────────────────────────────────────────────────────── */
function initSettings() {
  document.getElementById('btn-connect-serial')?.addEventListener('click', connectSerial);
  document.getElementById('btn-connect-wifi')?.addEventListener('click', connectWifi);
  document.getElementById('sampling-rate')?.addEventListener('change', e => {
    state.samplingRate = parseInt(e.target.value);
    showToast('info', `Sampling rate: ${e.target.value}ms`);
  });

  document.getElementById('history-window')?.addEventListener('change', e => {
    state.chartWindow = parseInt(e.target.value); state.maxHistory = state.chartWindow; updateMainChart(); if(currentPage==='live')updateLiveCharts();
    showToast('info', `History window: ${e.target.value} points`);
  });

  document.getElementById('v-offset')?.addEventListener('change', e => {
    state.vOffset = parseFloat(e.target.value) || 0;
    showToast('info', `Voltage offset set: ${state.vOffset}V`);
  });

  document.getElementById('c-offset')?.addEventListener('change', e => {
    state.cOffset = parseFloat(e.target.value) || 0;
  });

  document.getElementById('load-r')?.addEventListener('change', e => {
    state.loadR = parseFloat(e.target.value) || 330;
    showToast('info', `Load resistance: ${state.loadR}Ω`);
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    if (confirm('Reset all dashboard data?')) {
      state.voltage = state.current = state.power = state.energy = 0;
      state.peakVoltage = state.peakCurrent = state.peakPower = 0;
      state.capacitorPct = 0; state.steps = 0;
      state.history = { v:[], c:[], p:[], e:[], t:[] };
      state.reportData = [];
      t=0; state.lastSampleMs=null; tiles.forEach(d=>{d.state='active';d.voltage=0;});
      Object.values(charts).forEach(c=>{if(c?.data){c.data.labels=[];c.data.datasets.forEach(ds=>ds.data=[]);c.update('none');}});
      renderDiscGroups(); updateUI(); showToast('warning','Dashboard reset');
    }
  });

  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    state.history = { v:[], c:[], p:[], e:[], t:[] };
    state.reportData=[]; state.faultHistory=[]; Object.values(charts).forEach(c=>{if(c?.data){c.data.labels=[];c.data.datasets.forEach(ds=>ds.data=[]);c.update('none');}});
    showToast('info','History cleared');
  });

  // Live pause/resume
  document.getElementById('live-pause-btn')?.addEventListener('click', function() {
    state.running = !state.running;
    this.innerHTML = state.running
      ? '<i class="fa-solid fa-pause"></i> Pause'
      : '<i class="fa-solid fa-play"></i> Resume';
    showToast(state.running ? 'info' : 'warning', state.running ? 'Resumed' : 'Paused');
  });

  document.getElementById('live-export-btn')?.addEventListener('click', exportCSV);
}

/* ─────────────────────────────────────────────────────────────────
   PERIODIC AI NOTIFICATIONS
───────────────────────────────────────────────────────────────── */
setInterval(() => {
  if (state.dataMode === 'demo' && state.history.v.length && Math.random() < 0.3) {
    const msgs = [
      { icon:'⚡', title:'Voltage Spike', sub:`Peak: ${(state.peakVoltage).toFixed(2)}V detected` },
      { icon:'📊', title:'Efficiency Update', sub:`Current: ${state.efficiency.toFixed(0)}%` },
      { icon:'🔋', title:'Capacitor', sub:`Charge level: ${state.capacitorPct.toFixed(0)}%` },
    ];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    state.notifications.unshift({ ...msg, time: 'just now' });
    if (state.notifications.length > 20) state.notifications.pop();
    renderNotifications();
  }
}, 15000);

/* ─────────────────────────────────────────────────────────────────
   DONE
───────────────────────────────────────────────────────────────── */
console.log('%c Dashboard engine loaded ✓', 'color:#10B981;font-family:monospace');
