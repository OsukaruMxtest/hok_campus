function resolvePhaseId(phaseId) {
  const alias = {
    cuartos: 'cuartos',
    day1_qualifiers: 'cuartos',
    semifinal: 'semifinal',
    final: 'final'
  };
  return alias[phaseId] || phaseId || 'cuartos';
}

function escapeHTML(str) {
  if (!str) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(str).replace(/[&<>"']/g, function(m) { return map[m]; });
}

// ============================================================
// GLOBAL TEAM LOGO FALLBACK (para imágenes de equipo)
// ============================================================
window.handleTeamLogoError = function(img, teamName) {
    if (img.dataset.logoManaged === 'team' && window.statsPage && typeof window.statsPage.applyTeamLogoFallback === 'function') {
        window.statsPage.applyTeamLogoFallback(img, teamName);
        return;
    }
    img.src = 'assets/logos/default_logo.png';
    img.onerror = null;
};
// ============================================================

// Parser CSV robusto con soporte para comillas, comas escapadas y BOM
function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;
  while (i < csvText.length) {
    const char = csvText[i];
    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < csvText.length && csvText[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          insideQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (char === '\n' || (char === '\r' && i + 1 < csvText.length && csvText[i + 1] === '\n')) {
        if (char === '\r') i++;
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
      } else if (char === '\r' && (i + 1 === csvText.length || csvText[i + 1] !== '\n')) {
        currentRow.push(currentField.trim());
        if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length > 0 && currentRow.some(f => f !== '')) {
      rows.push(currentRow);
    }
  }
  if (rows.length === 0) return [];
  // Eliminar BOM del primer encabezado
  let headers = rows[0].map(h => h.trim());
  if (headers.length > 0 && headers[0].charCodeAt(0) === 0xFEFF) {
    headers[0] = headers[0].slice(1);
  }
  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const entry = {};
    headers.forEach((header, idx) => {
      entry[header] = (row[idx] || '').trim();
    });
    data.push(entry);
  }
  return data;
}

// ============================================================
// INYECCIÓN DE ESTILOS PARA LOGOS EN ESTADÍSTICAS
// ============================================================
(function injectStatsStyles() {
  if (document.getElementById('hok-stats-styles')) return;
  const style = document.createElement('style');
  style.id = 'hok-stats-styles';
  style.textContent = `
    .hok-stats-team-logo {
      width: 28px;
      height: 28px;
      margin-right: 8px;
      vertical-align: middle;
      border-radius: 50%;
      object-fit: cover;
      background-color: rgba(255,255,255,0.1);
      flex-shrink: 0;
    }
    .ranking-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .presentation-card h4 {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `;
  document.head.appendChild(style);
})();

class StatsPage {
    constructor() {
        this.data = { cuartos: {}, semifinal: {}, final: {} };
        this.currentPhase = 'all';
        this.charts = {};
        this.uniqueTeams = new Set();
        this.uniquePlayers = new Set();
        this.orderedTeams = []; // Stable sorted list for colors
        // Modal de gráficas
        this.modalChart = null;
        this.modalTriggerElement = null;
        this.isModalOpen = false;
        this.modalRAF = null;
        this.modalResizeTimeout = null;
        // Presentación
        this.isPresentationOpen = false;
        this.init();
    }

    // ================== MÉTRICAS DESDE CONFIGURACIÓN GLOBAL ==================
    getEnabledMetrics() {
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getEnabledStatMetrics) {
            return config.helpers.getEnabledStatMetrics();
        }
        return [];
    }

    getAllMetrics() {
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.statMetrics) {
            const all = [];
            if (config.statMetrics.modo_5v5) all.push(...config.statMetrics.modo_5v5);
            if (config.statMetrics.modo_chaos) all.push(...config.statMetrics.modo_chaos);
            return all;
        }
        return [];
    }

    isMetricEnabled(key) {
        return this.getEnabledMetrics().some(m => m.key === key);
    }

    // ============================================================

    getNumericValue(row, fieldKey) {
        if (!row) return null;
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getNumericCsvValue) {
            let val = config.helpers.getNumericCsvValue(row, fieldKey);
            if (val !== undefined && val !== null) {
                if (typeof val === 'string') {
                    val = Number(val.replace(/,/g, ''));
                }
                if (typeof val === 'number' && isFinite(val)) return val;
            }
            return null;
        }
        // Fallback básico para columnas conocidas
        const aliases = {
            kills: ['kills', 'KILLS', 'Eliminaciones'],
            deaths: ['deaths', 'DEATHS', 'Muertes'],
            assists: ['assists', 'ASSISTS', 'Asistencias'],
            gold: ['gold', 'GOLD', 'Oro'],
            heroDamageDealt: ['heroDamageDealt', 'HERODAMAGEDEALT', 'DañoHeroe'],
            heroDamageTaken: ['heroDamageTaken', 'HERODAMAGETAKEN', 'DañoRecibido'],
            goldPercentage: ['goldPercentage', 'GOLDPERCENTAGE', 'PorcentajeOro'],
            teamFightPresence: ['teamFightPresence', 'TEAMFIGHTPRESENCE', 'PresenciaPeleas'],
            crowdControl: ['crowdControl', 'CROWDCONTROL', 'ControlMasas'],
            towerDamage: ['towerDamage', 'TOWERDAMAGE', 'DañoTorres'],
            participation: ['participation', 'PARTICIPATION', 'Participacion']
        };
        const candidates = aliases[fieldKey] || [fieldKey];
        for (const key of candidates) {
            if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
                const raw = String(row[key]).trim().replace(/,/g, '');
                const val = Number(raw);
                if (isFinite(val)) return val;
            }
        }
        return null;
    }

    getTextValue(row, fieldKey) {
        if (!row) return null;
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getCsvValue) {
            const val = config.helpers.getCsvValue(row, fieldKey);
            if (val !== undefined && val !== null) {
                const str = String(val).trim();
                return str !== '' ? str : null;
            }
            return null;
        }
        const aliases = { team: ['EQUIPO','Equipo','Team'], player: ['JUGADOR','Jugador','Player'], winner: ['GANADOR','Ganador','Winner'] };
        const candidates = aliases[fieldKey] || [];
        for (const c of candidates) {
            if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
                return String(row[c]).trim();
            }
        }
        return null;
    }

    async init() {
        this.showLoader();
        await this.loadAllData();
        this.setupEventListeners();
        this.setupChartModal();
        // Build ordered teams after data load
        this.processUniqueData(); // populates uniqueTeams and orderedTeams
        this.updateStatsTables();
        this.updateCharts();
        this.hideLoader();
    }

    showLoader() { const l = document.getElementById('loader'); if(l) l.classList.add('active'); }
    hideLoader() { const l = document.getElementById('loader'); if(l) l.classList.remove('active'); }

    // ================== CARGA DE DATOS CON PRIORIDADES ==================
    async loadAllData() {
        const phases = ['cuartos','semifinal','final'];
        for(const phase of phases) {
            try { await this.loadPhaseData(phase); } catch(e) { console.warn(e); }
        }
    }

    async loadPhaseData(phase) {
        try {
            const config = window.TOURNAMENT_CONFIG;
            let paths = [];
            if(config && config.helpers && config.helpers.getPhaseFilePaths) {
                const result = config.helpers.getPhaseFilePaths(resolvePhaseId(phase));
                if (Array.isArray(result)) {
                    paths = [...result];
                    // Ordenar para priorizar SF sobre S, y FM sobre F1M
                    paths.sort((a, b) => {
                        const aName = a.split('/').pop();
                        const bName = b.split('/').pop();
                        const priority = (name) => {
                            if (name.startsWith('SF')) return 2;
                            if (name.startsWith('S')) return 1;
                            if (name.startsWith('FM')) return 2;
                            if (name.startsWith('F1M')) return 1;
                            return 0;
                        };
                        return priority(bName) - priority(aName);
                    });
                } else {
                    console.warn('getPhaseFilePaths no devolvió un arreglo, usando fallback');
                    paths = [];
                }
            }
            // Fallback si no hay rutas configuradas
            if (!paths || paths.length === 0) {
                const baseNames = this.getBaseNamesForPhase(phase);
                const phasePath = `data/${phase}/`;
                for (const base of baseNames) {
                    const variants = this.getVariantsForBase(base, phase);
                    for (const variant of variants) {
                        paths.push(`${phasePath}${variant}.csv`);
                    }
                }
            }
            // Deduplicar por partida lógica
            const loadedSet = new Set();
            for (const filePath of paths) {
                try {
                    const fileName = filePath.split('/').pop();
                    const baseKey = this.getBaseKey(fileName, phase);
                    if (loadedSet.has(baseKey)) continue;
                    const csvData = await this.loadCSV(filePath);
                    const rows = this.parseCSV(csvData);
                    // Solo cargar si hay filas con datos válidos (equipo o jugador)
                    if (this.hasValidData(rows)) {
                        this.data[phase][fileName] = rows;
                        loadedSet.add(baseKey);
                    } else {
                        console.warn('Archivo sin datos válidos, se probará variante alternativa:', filePath);
                    }
                } catch(e) {
                    console.warn('No se pudo cargar', filePath, e);
                }
            }
        } catch(e) { console.warn(e); }
    }

    // Verifica si un conjunto de filas contiene al menos una con equipo o jugador no vacío
    hasValidData(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return false;
        for (const row of rows) {
            const team = this.getTextValue(row, 'team');
            const player = this.getTextValue(row, 'player');
            if (team || player) return true;
        }
        return false;
    }

    getBaseNamesForPhase(phase) {
        if (phase === 'cuartos') {
            return ['Q1M1', 'Q1M2', 'Q1M3', 'Q2M1', 'Q2M2', 'Q2M3', 'Q3M1', 'Q3M2', 'Q3M3', 'Q4M1', 'Q4M2', 'Q4M3'];
        } else if (phase === 'semifinal') {
            return ['SF1M1', 'SF1M2', 'SF1M3', 'SF2M1', 'SF2M2', 'SF2M3']; // prioridad SF
        } else if (phase === 'final') {
            return ['FM1', 'FM2', 'FM3', 'FM4', 'FM5']; // prioridad FM
        }
        return [];
    }

    getVariantsForBase(base, phase) {
        if (phase === 'semifinal') {
            const alt = base.replace('SF', 'S');
            return [base, alt];
        } else if (phase === 'final') {
            const num = base.replace('FM', '');
            const alt = 'F1M' + num;
            return [base, alt];
        } else {
            return [base];
        }
    }

    getBaseKey(fileName, phase) {
        const base = fileName.replace(/\.csv$/i, '');
        if (phase === 'semifinal') {
            const m = base.match(/^(?:S|SF)(\d+M\d+)$/);
            if (m) return 'S' + m[1];
        } else if (phase === 'final') {
            const m = base.match(/^(?:FM|F1M)(\d+)$/);
            if (m) return 'F1M' + m[1];
        }
        return base;
    }

    async loadCSV(filePath) {
        const r = await fetch(filePath);
        if(!r.ok) throw new Error(`Failed to fetch CSV: ${filePath}`);
        return await r.text();
    }

    parseCSV(csvText) {
        return parseCSV(csvText);
    }

    formatNumber(n) {
        if (n === null || n === undefined || !isFinite(n)) return '0';
        return Number(n).toLocaleString('en-US');
    }

    // ================== COLOR HELPERS (compartidos con main.js) ==================
    getOrderedTeams() {
        // Returns a stable sorted list of all teams
        if (this.orderedTeams.length === 0) {
            this.orderedTeams = Array.from(this.uniqueTeams).sort((a, b) => a.localeCompare(b));
        }
        return this.orderedTeams;
    }

    getTeamColor(teamName, alpha = 1) {
        // Use palette from config if available
        const config = window.TOURNAMENT_CONFIG;
        let palette = [];
        if (config && config.ui && Array.isArray(config.ui.teamColors)) {
            palette = config.ui.teamColors;
        }
        // Fallback palette if config missing
        if (palette.length === 0) {
            palette = [
                '#E63946', '#3A86FF', '#2EC4B6', '#FFBE0B',
                '#8338EC', '#FB5607', '#06D6A0', '#FF70A6'
            ];
        }

        const ordered = this.getOrderedTeams();
        let index = ordered.indexOf(teamName);
        if (index === -1) {
            // If team not found in ordered list (should not happen), use hash fallback
            let hash = 0;
            for (let i = 0; i < teamName.length; i++) {
                hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
            }
            index = Math.abs(hash) % palette.length;
        }
        const color = palette[index % palette.length];
        if (alpha === 1) return color;
        // Convert hex to rgba
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    // ================================================================

    // ================== HELPERS PARA LOGOS DE EQUIPOS ==================
    getTeamLogo(teamName) {
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && typeof config.helpers.getTeamLogoCandidates === 'function') {
            const candidates = config.helpers.getTeamLogoCandidates(teamName);
            if (candidates && candidates.length > 0) {
                return candidates[0];
            }
        }
        return 'assets/logos/default_logo.png';
    }

    applyTeamLogoFallback(imgElement, teamName) {
        if (!imgElement) return;
        const config = window.TOURNAMENT_CONFIG;
        if (!config || !config.helpers || typeof config.helpers.getTeamLogoCandidates !== 'function') {
            imgElement.src = 'assets/logos/default_logo.png';
            imgElement.onerror = null;
            return;
        }
        const candidates = config.helpers.getTeamLogoCandidates(teamName);
        if (!candidates || candidates.length === 0) {
            imgElement.src = 'assets/logos/default_logo.png';
            imgElement.onerror = null;
            return;
        }
        let currentIndex = parseInt(imgElement.dataset.logoRetryIndex);
        if (isNaN(currentIndex) || currentIndex < 1) {
            currentIndex = 1;
        }
        if (currentIndex >= candidates.length) {
            imgElement.src = 'assets/logos/default_logo.png';
            imgElement.onerror = null;
            imgElement.dataset.logoRetryIndex = candidates.length + 1;
            return;
        }
        imgElement.src = candidates[currentIndex];
        imgElement.dataset.logoRetryIndex = currentIndex + 1;
    }
    // ================================================================

    // ================== PROCESAR DATOS ÚNICOS ==================
    processUniqueData() {
        this.uniqueTeams.clear();
        this.uniquePlayers.clear();
        const phases = this.currentPhase === 'all' ? ['cuartos','semifinal','final'] : [this.currentPhase];
        for (const phase of phases) {
            if (!this.data[phase]) continue;
            Object.values(this.data[phase]).forEach(matchData => {
                matchData.forEach(row => {
                    const team = this.getTextValue(row, 'team');
                    const player = this.getTextValue(row, 'player');
                    if(team) this.uniqueTeams.add(team);
                    if(player) this.uniquePlayers.add(player);
                });
            });
        }
        this.orderedTeams = Array.from(this.uniqueTeams).sort((a, b) => a.localeCompare(b));
    }

    // ================== EVENTOS Y NAVEGACIÓN ==================
    setupEventListeners() {
        const phaseFilter = document.getElementById('stats-phase-filter');
        if(phaseFilter) {
            phaseFilter.addEventListener('change', (e) => {
                if (this.isModalOpen) this.closeChartModal();
                this.currentPhase = e.target.value;
                this.processUniqueData(); // re-process unique data
                this.updateStatsTables();
                this.updateCharts();
                const announcer = document.getElementById('stats-announcer');
                if(announcer) announcer.textContent = `Fase cambiada a ${e.target.options[e.target.selectedIndex].text}`;
            });
        }
        const presentationToggle = document.getElementById('presentation-mode-toggle');
        if(presentationToggle) presentationToggle.addEventListener('click', () => this.togglePresentationMode());
        const navToggle = document.getElementById('nav-toggle');
        if(navToggle) navToggle.addEventListener('click', () => this.toggleNavigation());
        const overlay = document.getElementById('presentation-overlay');
        if(overlay) {
            overlay.addEventListener('click', (e) => {
                if(e.target === overlay) this.closePresentationMode();
            });
        }
        const navMenu = document.getElementById('nav-menu');
        if(navMenu) {
            navMenu.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    if(navMenu.classList.contains('open')) {
                        navMenu.classList.remove('open');
                        if(navToggle) navToggle.setAttribute('aria-expanded', 'false');
                    }
                });
            });
        }
        document.addEventListener('click', (e) => {
            const navContainer = document.querySelector('.nav-container');
            if(navContainer && !navContainer.contains(e.target) && navMenu && navMenu.classList.contains('open')) {
                navMenu.classList.remove('open');
                if(navToggle) navToggle.setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('keydown', (e) => {
            if(e.key === 'Escape') {
                if(this.isModalOpen) {
                    this.closeChartModal();
                } else if(this.isPresentationOpen) {
                    this.closePresentationMode();
                }
            }
        });
    }

    toggleNavigation() {
        const navMenu = document.getElementById('nav-menu');
        const navToggle = document.getElementById('nav-toggle');
        if(navMenu) {
            const isOpen = navMenu.classList.toggle('open');
            if(navToggle) navToggle.setAttribute('aria-expanded', isOpen);
        }
    }

    // ================== MODAL DE GRÁFICAS ==================
    setupChartModal() {
        const container = document.querySelector('.advanced-charts');
        if(!container) return;
        if(this._chartModalHandler) {
            container.removeEventListener('click', this._chartModalHandler);
            container.removeEventListener('keydown', this._chartModalHandlerKey);
        }
        this._chartModalHandler = (e) => {
            const target = e.target.closest('.is-chart-expandable');
            if(!target) return;
            const canvas = target.querySelector('canvas');
            if(!canvas) return;
            let title = target.dataset.chartTitle || '';
            if(!title) {
                const heading = target.querySelector('h3');
                if(heading) title = heading.textContent.trim();
            }
            if(!title) title = 'Gráfica';
            this.openChartModal(canvas, title, target);
        };
        this._chartModalHandlerKey = (e) => {
            if(e.key === 'Enter' || e.key === ' ') {
                const target = e.target.closest('.is-chart-expandable');
                if(!target) return;
                e.preventDefault();
                const canvas = target.querySelector('canvas');
                if(!canvas) return;
                let title = target.dataset.chartTitle || '';
                if(!title) {
                    const heading = target.querySelector('h3');
                    if(heading) title = heading.textContent.trim();
                }
                if(!title) title = 'Gráfica';
                this.openChartModal(canvas, title, target);
            }
        };
        container.addEventListener('click', this._chartModalHandler);
        container.addEventListener('keydown', this._chartModalHandlerKey);

        const modal = document.getElementById('chart-modal');
        if(modal) {
            modal.addEventListener('click', (e) => {
                if(e.target === modal) this.closeChartModal();
            });
        }
    }

    openChartModal(sourceCanvas, title, triggerElement) {
        if(typeof Chart === 'undefined') {
            console.warn('Chart.js no está disponible');
            return;
        }
        const modal = document.getElementById('chart-modal');
        const modalTitle = document.getElementById('chart-modal-title');
        const modalCanvas = document.getElementById('chart-modal-canvas');
        if(!modal || !modalCanvas || !sourceCanvas) return;

        const originalChart = Chart.getChart(sourceCanvas);
        if(!originalChart) {
            console.warn('No se encontró instancia de Chart.js para el canvas');
            return;
        }

        this.modalTriggerElement = triggerElement || document.activeElement;

        if(this.modalChart) {
            this.modalChart.destroy();
            this.modalChart = null;
        }

        if(modalTitle) modalTitle.textContent = title || 'Gráfica ampliada';

        const expandedConfig = this.buildExpandedConfig(originalChart);

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        this.isModalOpen = true;
        document.body.classList.add('modal-open');

        if (this.modalRAF) {
            cancelAnimationFrame(this.modalRAF);
            this.modalRAF = null;
        }
        if (this.modalResizeTimeout) {
            clearTimeout(this.modalResizeTimeout);
            this.modalResizeTimeout = null;
        }

        this.modalRAF = requestAnimationFrame(() => {
            if (!modal.classList.contains('active') || !modalCanvas.isConnected || !Chart.getChart(sourceCanvas) || !this.isModalOpen) {
                if (modal.classList.contains('active')) {
                    this.closeChartModal();
                }
                this.modalRAF = null;
                return;
            }
            const ctx = modalCanvas.getContext('2d');
            this.modalChart = new Chart(ctx, expandedConfig);
            this.modalResizeTimeout = setTimeout(() => {
                if (this.isModalOpen && this.modalChart && modalCanvas.isConnected) {
                    this.modalChart.resize();
                }
                this.modalResizeTimeout = null;
            }, 50);
            this.modalRAF = null;
        });

        modal.focus();
    }

    buildExpandedConfig(originalChart) {
        const config = originalChart.config;
        const data = {
            labels: config.data.labels.slice(),
            datasets: config.data.datasets.map(ds => {
                const newDs = {
                    label: ds.label,
                    data: ds.data.slice(),
                    backgroundColor: ds.backgroundColor,
                    borderColor: ds.borderColor,
                    borderWidth: ds.borderWidth ?? 2,
                    pointBackgroundColor: ds.pointBackgroundColor,
                    pointBorderColor: ds.pointBorderColor,
                    pointHoverBackgroundColor: ds.pointHoverBackgroundColor,
                    pointHoverBorderColor: ds.pointHoverBorderColor,
                    pointRadius: ds.pointRadius ?? 4,
                    pointHoverRadius: ds.pointHoverRadius ?? 6,
                    tension: ds.tension,
                    fill: ds.fill,
                    yAxisID: ds.yAxisID
                };
                if (ds.borderRadius !== undefined) newDs.borderRadius = ds.borderRadius;
                if (ds.pointBorderWidth !== undefined) newDs.pointBorderWidth = ds.pointBorderWidth;
                if (ds.showLine !== undefined) newDs.showLine = ds.showLine;
                if (ds.spanGaps !== undefined) newDs.spanGaps = ds.spanGaps;
                if (originalChart.config.type === 'bar') {
                    newDs.barPercentage = ds.barPercentage ?? 0.8;
                    newDs.categoryPercentage = ds.categoryPercentage ?? 0.7;
                }
                return newDs;
            })
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: 'white',
                        font: { size: 16, family: 'Poppins', weight: 'bold' },
                        padding: 20
                    },
                    position: 'top'
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#E372F2',
                    borderWidth: 1,
                    titleFont: { size: 16, family: 'Poppins' },
                    bodyFont: { size: 14, family: 'Poppins' },
                    callbacks: {
                        label: function(ctx) {
                            let label = ctx.dataset.label || '';
                            let value = ctx.parsed.y;
                            if (value === undefined || value === null || !isFinite(value)) {
                                if (ctx.parsed.x !== undefined && isFinite(ctx.parsed.x)) {
                                    value = ctx.parsed.x;
                                } else if (ctx.raw !== undefined && isFinite(ctx.raw)) {
                                    value = ctx.raw;
                                } else {
                                    value = null;
                                }
                            }
                            if (typeof value === 'number' && isFinite(value)) {
                                if (Math.abs(value) >= 1000000) value = (value/1000000).toFixed(1) + 'M';
                                else if (Math.abs(value) >= 1000) value = (value/1000).toFixed(1) + 'K';
                                else value = value.toFixed(1);
                            } else {
                                value = '—';
                            }
                            return label + ': ' + value;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: {
                        color: 'white',
                        font: { size: 14, family: 'Poppins' },
                        maxRotation: 30,
                        autoSkip: true
                    }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: {
                        color: 'white',
                        font: { size: 14, family: 'Poppins' },
                        callback: function(value) {
                            if (!isFinite(value)) return '0';
                            if (Math.abs(value) >= 1000000) return (value/1000000).toFixed(1) + 'M';
                            if (Math.abs(value) >= 1000) return (value/1000).toFixed(1) + 'K';
                            return value;
                        }
                    }
                }
            },
            animation: {
                duration: 800,
                easing: 'easeOutQuart'
            }
        };

        if (originalChart.options && originalChart.options.showLine !== undefined && !config.data.datasets.some(ds => ds.showLine !== undefined)) {
            options.showLine = originalChart.options.showLine;
        }
        if (originalChart.options && originalChart.options.spanGaps !== undefined && !config.data.datasets.some(ds => ds.spanGaps !== undefined)) {
            options.spanGaps = originalChart.options.spanGaps;
        }

        if(originalChart.options && originalChart.options.scales && originalChart.options.scales.y1) {
            options.scales.y1 = {
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: {
                    color: 'white',
                    font: { size: 14, family: 'Poppins' },
                    callback: function(value) {
                        if (!isFinite(value)) return '0';
                        if (Math.abs(value) >= 1000000) return (value/1000000).toFixed(1) + 'M';
                        if (Math.abs(value) >= 1000) return (value/1000).toFixed(1) + 'K';
                        return value;
                    }
                }
            };
            if (originalChart.options.scales.y1.title) {
                options.scales.y1.title = {
                    display: true,
                    text: originalChart.options.scales.y1.title.text,
                    color: 'white',
                    font: { size: 16, family: 'Poppins' }
                };
            }
        }
        if(originalChart.options && originalChart.options.scales && originalChart.options.scales.y && originalChart.options.scales.y.title) {
            options.scales.y.title = {
                display: true,
                text: originalChart.options.scales.y.title.text,
                color: 'white',
                font: { size: 16, family: 'Poppins' }
            };
        }
        if(originalChart.options && originalChart.options.scales && originalChart.options.scales.x && originalChart.options.scales.x.title) {
            options.scales.x.title = {
                display: true,
                text: originalChart.options.scales.x.title.text,
                color: 'white',
                font: { size: 16, family: 'Poppins' }
            };
        }

        return {
            type: originalChart.config.type,
            data: data,
            options: options
        };
    }

    closeChartModal() {
        const modal = document.getElementById('chart-modal');
        if(!modal) return;

        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        this.isModalOpen = false;
        document.body.classList.remove('modal-open');

        if (this.modalRAF) {
            cancelAnimationFrame(this.modalRAF);
            this.modalRAF = null;
        }
        if (this.modalResizeTimeout) {
            clearTimeout(this.modalResizeTimeout);
            this.modalResizeTimeout = null;
        }

        if(this.modalChart) {
            this.modalChart.destroy();
            this.modalChart = null;
        }

        if(this.modalTriggerElement && this.modalTriggerElement.isConnected) {
            this.modalTriggerElement.focus();
        } else {
            const fallback = document.querySelector('.is-chart-expandable');
            if(fallback) fallback.focus();
        }
        this.modalTriggerElement = null;
    }

    // ================== HELPER PARA OCULTAR/MOSTRAR TARJETAS ==================
    setChartCardVisibility(cardId, visible) {
        const card = document.getElementById(cardId);
        if (!card) return;
        if (visible) {
            card.hidden = false;
            card.removeAttribute('aria-hidden');
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');
            card.classList.remove('is-mode-hidden');
        } else {
            card.hidden = true;
            card.setAttribute('aria-hidden', 'true');
            card.removeAttribute('tabindex');
            card.removeAttribute('role');
            card.classList.add('is-mode-hidden');
        }
    }

    // ================== GRÁFICAS (dinámicas según métricas) ==================
    updateCharts() {
        if(this.isModalOpen) this.closeChartModal();
        if (typeof Chart === 'undefined') {
            for (const key in this.charts) {
                if (this.charts[key]) {
                    this.charts[key].destroy();
                    delete this.charts[key];
                }
            }
            const canvases = document.querySelectorAll('.advanced-charts canvas');
            canvases.forEach(c => {
                const wrap = c.closest('.chart-wrap');
                if (wrap) {
                    let empty = wrap.querySelector('.chart-empty-state');
                    if (!empty) {
                        empty = document.createElement('div');
                        empty.className = 'chart-empty-state';
                        wrap.appendChild(empty);
                    }
                    empty.textContent = 'Chart.js no está disponible';
                    empty.hidden = false;
                    wrap.classList.add('chart-has-empty-state');
                    c.hidden = true;
                }
            });
            return;
        }

        // Determinar visibilidad de tarjetas según métricas habilitadas
        const hasKDA = this.isMetricEnabled('kills') && this.isMetricEnabled('deaths') && this.isMetricEnabled('assists');
        const hasGoldEfficiency = this.isMetricEnabled('heroDamageDealt') && this.isMetricEnabled('gold');

        this.setChartCardVisibility('kda-chart-card', hasKDA);
        this.setChartCardVisibility('gold-efficiency-chart-card', hasGoldEfficiency);

        // Actualizar cada gráfica según métricas habilitadas
        this.updateKDAChart();
        this.updatePerformanceChart();
        this.updateDamageComparisonChart();
        this.updateGoldEfficiencyChart();
        this.updateTopPlayersChart();
    }

    _handleEmptyState(canvas, hasData, message) {
        const wrap = canvas.closest('.chart-wrap');
        if (!wrap) return;
        let empty = wrap.querySelector('.chart-empty-state');
        if (!empty) {
            empty = document.createElement('div');
            empty.className = 'chart-empty-state';
            wrap.appendChild(empty);
        }
        if (hasData) {
            empty.hidden = true;
            empty.textContent = '';
            canvas.hidden = false;
            wrap.classList.remove('chart-has-empty-state');
        } else {
            empty.hidden = false;
            empty.textContent = message || 'No hay datos para la fase seleccionada';
            canvas.hidden = true;
            wrap.classList.add('chart-has-empty-state');
        }
    }

    _getCompactFontSize() {
        return 10;
    }

    // KDA chart – solo si modo_5v5 activo y la tarjeta está visible
    updateKDAChart() {
        const card = document.getElementById('kda-chart-card');
        if (!card || card.hidden) {
            if (this.charts.kda) {
                this.charts.kda.destroy();
                delete this.charts.kda;
            }
            return;
        }
        const canvas = document.getElementById('kda-chart');
        if(!canvas) return;
        if(this.charts.kda) { this.charts.kda.destroy(); delete this.charts.kda; }

        // Requiere modo_5v5 (kills, deaths, assists) - respaldo
        if (!this.isMetricEnabled('kills') || !this.isMetricEnabled('deaths') || !this.isMetricEnabled('assists')) {
            this._handleEmptyState(canvas, false, 'Métrica KDA no habilitada (requiere modo 5v5)');
            return;
        }

        const teams = Array.from(this.uniqueTeams);
        const teamStats = teams.map(t => this.calculateTeamStats(t))
            .filter(t => t.matches > 0)
            .sort((a,b) => parseFloat(b.kda) - parseFloat(a.kda))
            .slice(0, 8);

        if(teamStats.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos para la fase seleccionada');
            return;
        }
        this._handleEmptyState(canvas, true);

        const bgColors = teamStats.map(t => this.getTeamColor(t.name, 0.7));
        const borderColors = teamStats.map(t => this.getTeamColor(t.name, 1));

        const ctx = canvas.getContext('2d');
        this.charts.kda = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: teamStats.map(t=>t.name),
                datasets: [{
                    label:'KDA Ratio',
                    data: teamStats.map(t=>parseFloat(t.kda)),
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    borderRadius: 3,
                    barPercentage: 0.7,
                    categoryPercentage: 0.6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        ticks: { color: 'white', font: { size: 10, family: 'Poppins' } },
                        title: { display: true, text: 'KDA', color: 'white', font: { size: 11, family: 'Poppins' } }
                    },
                    x: {
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        ticks: { color: 'white', font: { size: 10, family: 'Poppins' }, maxRotation: 20 }
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 11, family: 'Poppins' } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `KDA: ${ctx.parsed.y.toFixed(2)}`
                        }
                    }
                }
            }
        });
    }

    // Performance chart – evoluciona según métricas habilitadas (sum metrics)
    updatePerformanceChart() {
        const canvas = document.getElementById('performance-chart');
        if(!canvas) return;
        if(this.charts.performance) { this.charts.performance.destroy(); delete this.charts.performance; }

        const enabledMetrics = this.getEnabledMetrics().filter(m => m.aggregation === 'sum');
        if (enabledMetrics.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay métricas de suma habilitadas');
            return;
        }

        let phasesToShow = [];
        if (this.currentPhase === 'all') {
            phasesToShow = ['cuartos','semifinal','final'];
        } else {
            phasesToShow = [this.currentPhase];
        }
        const phaseLabels = {
            'cuartos': 'Clasificatorias Día 1',
            'semifinal': 'Semifinales',
            'final': 'Final'
        };

        const allTeams = Array.from(this.uniqueTeams);
        const teamsWithData = allTeams.filter(team => {
            for (const p of phasesToShow) {
                const stats = this.calculateTeamStatsForPhase(team, p);
                if (stats.matches > 0) return true;
            }
            return false;
        });
        const ordered = this.getOrderedTeams();
        const topTeams = ordered.filter(team => teamsWithData.includes(team)).slice(0, 8);

        if(topTeams.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos para la fase seleccionada');
            return;
        }

        // Simplified: pick the first sum metric
        const primaryMetric = enabledMetrics[0];
        const key = primaryMetric.key;
        const label = primaryMetric.label;

        const teamData = topTeams.map(team => {
            const data = phasesToShow.map(p => {
                const stats = this.calculateTeamStatsForPhase(team, p);
                return stats.matches > 0 ? stats['total_' + key] || 0 : null;
            });
            const hasData = data.some(v => v !== null);
            return { team, data, hasData };
        }).filter(d => d.hasData);

        if (teamData.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos de rendimiento');
            return;
        }

        const datasetsLine = teamData.map(item => {
            const color = this.getTeamColor(item.team, 1);
            return {
                label: item.team,
                data: item.data,
                borderColor: color,
                backgroundColor: this.getTeamColor(item.team, 0.1),
                tension: 0.4,
                spanGaps: false,
                pointRadius: phasesToShow.length === 1 ? 5 : 3,
                pointHoverRadius: phasesToShow.length === 1 ? 8 : 5,
                borderWidth: 2,
                showLine: true,
                pointBackgroundColor: color,
                pointBorderColor: 'white'
            };
        });

        if (datasetsLine.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos de rendimiento');
            return;
        }

        const labels = phasesToShow.map(p => phaseLabels[p] || p);

        this._handleEmptyState(canvas, true);
        const ctx = canvas.getContext('2d');
        this.charts.performance = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasetsLine },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        ticks: {
                            color: 'white',
                            font: { size: 10, family: 'Poppins' },
                            callback: (v) => this.formatNumber(v)
                        },
                        title: { display: true, text: label, color: 'white', font: { size: 11, family: 'Poppins' } }
                    },
                    x: {
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        ticks: { color: 'white', font: { size: 10, family: 'Poppins' } }
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 11, family: 'Poppins' } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${this.formatNumber(ctx.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    // Damage comparison – usa heroDamageDealt (modo_chaos) y gold (modo_5v5)
    updateDamageComparisonChart() {
        const canvas = document.getElementById('damage-comparison-chart');
        if(!canvas) return;
        if(this.charts.damage) { this.charts.damage.destroy(); delete this.charts.damage; }

        const hasDamage = this.isMetricEnabled('heroDamageDealt');
        const hasGold = this.isMetricEnabled('gold');

        if (!hasDamage && !hasGold) {
            this._handleEmptyState(canvas, false, 'No hay métricas de daño u oro habilitadas');
            return;
        }

        const allTeams = Array.from(this.uniqueTeams);
        const teamsWithData = allTeams.filter(t => {
            const stats = this.calculateTeamStats(t);
            return stats.matches > 0;
        });
        const ordered = this.getOrderedTeams();
        const topTeams = ordered.filter(team => teamsWithData.includes(team)).slice(0, 8);

        if(topTeams.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos para la fase seleccionada');
            return;
        }

        const teamStats = topTeams.map(t => this.calculateTeamStats(t));
        const datasets = [];
        if (hasDamage) {
            datasets.push({
                label: 'Daño Total',
                data: teamStats.map(t => t.total_heroDamageDealt || 0),
                backgroundColor: teamStats.map(t => this.getTeamColor(t.name, 0.7)),
                borderColor: teamStats.map(t => this.getTeamColor(t.name, 1)),
                borderWidth: 1.5,
                yAxisID: 'y',
                borderRadius: 3,
                barPercentage: 0.7,
                categoryPercentage: 0.6
            });
        }
        if (hasGold) {
            datasets.push({
                label: 'Oro Total',
                data: teamStats.map(t => t.total_gold || 0),
                backgroundColor: teamStats.map(t => this.getTeamColor(t.name, 0.5)),
                borderColor: teamStats.map(t => this.getTeamColor(t.name, 0.8)),
                borderWidth: 1.5,
                yAxisID: 'y1',
                borderRadius: 3,
                barPercentage: 0.7,
                categoryPercentage: 0.6
            });
        }

        if (datasets.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos para comparar');
            return;
        }

        this._handleEmptyState(canvas, true);
        const ctx = canvas.getContext('2d');
        const scales = {
            x: {
                grid: { color: 'rgba(255,255,255,0.08)' },
                ticks: { color: 'white', font: { size: 10, family: 'Poppins' }, maxRotation: 20 }
            }
        };
        if (hasDamage) {
            scales.y = {
                position: 'left',
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.08)' },
                ticks: { color: 'white', font: { size: 10, family: 'Poppins' }, callback: (v) => this.formatNumber(v) },
                title: { display: true, text: 'Daño Total', color: 'white', font: { size: 11, family: 'Poppins' } }
            };
        }
        if (hasGold) {
            scales.y1 = {
                position: 'right',
                beginAtZero: true,
                grid: { drawOnChartArea: false },
                ticks: { color: 'white', font: { size: 10, family: 'Poppins' }, callback: (v) => this.formatNumber(v) },
                title: { display: true, text: 'Oro Total', color: 'white', font: { size: 11, family: 'Poppins' } }
            };
        }

        this.charts.damage = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: teamStats.map(t=>t.name),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: scales,
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 11, family: 'Poppins' } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${this.formatNumber(ctx.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    // Gold efficiency – necesita heroDamageDealt y gold, y la tarjeta visible
    updateGoldEfficiencyChart() {
        const card = document.getElementById('gold-efficiency-chart-card');
        if (!card || card.hidden) {
            if (this.charts.gold) {
                this.charts.gold.destroy();
                delete this.charts.gold;
            }
            return;
        }
        const canvas = document.getElementById('gold-efficiency-chart');
        if(!canvas) return;
        if(this.charts.gold) { this.charts.gold.destroy(); delete this.charts.gold; }

        if (!this.isMetricEnabled('heroDamageDealt') || !this.isMetricEnabled('gold')) {
            this._handleEmptyState(canvas, false, 'Se requieren daño y oro para eficiencia');
            return;
        }

        const allTeams = Array.from(this.uniqueTeams);
        const teamsWithData = allTeams.filter(t => {
            const stats = this.calculateTeamStats(t);
            return stats.matches > 0 && stats.total_gold > 0;
        });
        const ordered = this.getOrderedTeams();
        const topTeams = ordered.filter(team => teamsWithData.includes(team)).slice(0, 8);

        if(topTeams.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos para la fase seleccionada');
            return;
        }

        const eff = topTeams.map(t => {
            const s = this.calculateTeamStats(t);
            const efficiency = s.total_gold > 0 ? s.total_heroDamageDealt / s.total_gold : 0;
            return { name: t, efficiency: efficiency, matches: s.matches };
        }).filter(t => t.matches > 0);

        if(eff.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos de eficiencia');
            return;
        }

        const bgColors = eff.map(e => this.getTeamColor(e.name, 0.7));
        const borderColors = eff.map(e => this.getTeamColor(e.name, 1));

        this._handleEmptyState(canvas, true);
        const ctx = canvas.getContext('2d');
        this.charts.gold = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: eff.map(e=>e.name),
                datasets: [{
                    label: 'Eficiencia de Oro (Daño/Oro)',
                    data: eff.map(e=>e.efficiency),
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    borderRadius: 3,
                    barPercentage: 0.7,
                    categoryPercentage: 0.6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        ticks: {
                            color: 'white',
                            font: { size: 10, family: 'Poppins' },
                            callback: (v) => v.toFixed(2)
                        },
                        title: { display: true, text: 'Daño por Oro', color: 'white', font: { size: 11, family: 'Poppins' } }
                    },
                    x: {
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        ticks: { color: 'white', font: { size: 10, family: 'Poppins' }, maxRotation: 20 }
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 11, family: 'Poppins' } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Eficiencia: ${ctx.parsed.y.toFixed(2)}`
                        }
                    }
                }
            }
        });
    }

    // Top players – muestra kills (modo_5v5) y daño (modo_chaos)
    updateTopPlayersChart() {
        const canvas = document.getElementById('top-players-chart');
        if(!canvas) return;
        if(this.charts.topPlayers) { this.charts.topPlayers.destroy(); delete this.charts.topPlayers; }

        const hasKills = this.isMetricEnabled('kills');
        const hasDamage = this.isMetricEnabled('heroDamageDealt');

        if (!hasKills && !hasDamage) {
            this._handleEmptyState(canvas, false, 'No hay métricas de eliminaciones o daño habilitadas');
            return;
        }

        const players = Array.from(this.uniquePlayers);
        const playerStats = players.map(p => this.calculatePlayerStats(p))
            .filter(p => p.matches > 0)
            .sort((a,b) => {
                if (hasKills) return b.kills - a.kills;
                return b.total_heroDamageDealt - a.total_heroDamageDealt;
            })
            .slice(0, 8);

        if(playerStats.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos para la fase seleccionada');
            return;
        }

        const datasets = [];
        if (hasKills) {
            datasets.push({
                label: 'Eliminaciones',
                data: playerStats.map(p=>p.kills),
                backgroundColor: 'rgba(227,114,242,0.7)',
                borderColor: 'rgba(227,114,242,1)',
                borderWidth: 1.5,
                yAxisID: 'y',
                borderRadius: 3,
                barPercentage: 0.7,
                categoryPercentage: 0.6
            });
        }
        if (hasDamage) {
            datasets.push({
                label: 'Daño Total (K)',
                data: playerStats.map(p=>Math.round(p.total_heroDamageDealt/1000)),
                backgroundColor: 'rgba(119,185,242,0.7)',
                borderColor: 'rgba(119,185,242,1)',
                borderWidth: 1.5,
                yAxisID: 'y1',
                borderRadius: 3,
                barPercentage: 0.7,
                categoryPercentage: 0.6
            });
        }

        if (datasets.length === 0) {
            this._handleEmptyState(canvas, false, 'No hay datos para mostrar');
            return;
        }

        this._handleEmptyState(canvas, true);
        const ctx = canvas.getContext('2d');
        const scales = {
            x: {
                grid: { color: 'rgba(255,255,255,0.08)' },
                ticks: { color: 'white', font: { size: 10, family: 'Poppins' }, maxRotation: 25, autoSkip: true }
            }
        };
        if (hasKills) {
            scales.y = {
                position: 'left',
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.08)' },
                ticks: { color: 'white', font: { size: 10, family: 'Poppins' }, callback: (v) => this.formatNumber(v) },
                title: { display: true, text: 'Eliminaciones', color: 'white', font: { size: 11, family: 'Poppins' } }
            };
        }
        if (hasDamage) {
            scales.y1 = {
                position: 'right',
                beginAtZero: true,
                grid: { drawOnChartArea: false },
                ticks: { color: 'white', font: { size: 10, family: 'Poppins' }, callback: (v) => v + 'K' },
                title: { display: true, text: 'Daño Total (miles)', color: 'white', font: { size: 11, family: 'Poppins' } }
            };
        }

        this.charts.topPlayers = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: playerStats.map(p=>p.name),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: scales,
                plugins: {
                    legend: { labels: { color: 'white', font: { size: 11, family: 'Poppins' } } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                if(ctx.dataset.label === 'Daño Total (K)') {
                                    return `${ctx.dataset.label}: ${(ctx.parsed.y * 1000).toLocaleString()}`;
                                }
                                return `${ctx.dataset.label}: ${ctx.parsed.y}`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ================== TABLAS Y RANKINGS (dinámicos) ==================
    updateStatsTables() {
        this.processUniqueData();
        this.updateSummaryCards();
        this.updateTeamStatsTable();
        this.updatePlayerStatsTable();
        this.updateTopTeamsRanking();
        this.updateTopPlayersRanking();
    }

    // ---- Summary Cards ----
    calculateSummaryStats() {
        let totalMatches = 0;
        const enabledMetrics = this.getEnabledMetrics();
        const allMetrics = this.getAllMetrics();
        const metricsMap = {};
        allMetrics.forEach(m => {
            metricsMap[m.key] = m;
        });

        const phases = this.currentPhase === 'all' ? ['cuartos','semifinal','final'] : [this.currentPhase];
        // Accumulate per metric
        const sums = {};
        const counts = {};
        allMetrics.forEach(m => {
            sums[m.key] = 0;
            counts[m.key] = 0;
        });

        for (const phase of phases) {
            if (!this.data[phase]) continue;
            Object.values(this.data[phase]).forEach(match => {
                let matchHasData = false;
                // Check if any row belongs to a team in uniqueTeams (if we have teams)
                for (const row of match) {
                    const team = this.getTextValue(row, 'team');
                    const player = this.getTextValue(row, 'player');
                    if ((team && this.uniqueTeams.has(team)) || (player && this.uniquePlayers.has(player))) {
                        matchHasData = true;
                        break;
                    }
                }
                if (matchHasData) {
                    totalMatches++;
                    for (const row of match) {
                        const team = this.getTextValue(row, 'team');
                        const player = this.getTextValue(row, 'player');
                        if ((team && this.uniqueTeams.has(team)) || (player && this.uniquePlayers.has(player))) {
                            allMetrics.forEach(metric => {
                                const val = this.getNumericValue(row, metric.key);
                                if (val !== null && isFinite(val)) {
                                    sums[metric.key] += val;
                                    counts[metric.key] += 1;
                                }
                            });
                        }
                    }
                }
            });
        }

        // Compute averages for average metrics
        const avgResults = {};
        allMetrics.forEach(m => {
            if (m.aggregation === 'sum') {
                avgResults[m.key] = sums[m.key] || 0;
            } else {
                avgResults[m.key] = counts[m.key] > 0 ? sums[m.key] / counts[m.key] : 0;
            }
        });

        // Best KDA if modo_5v5 enabled
        let bestKdaValue = 0;
        let bestKdaPlayer = '';
        if (this.isMetricEnabled('kills') && this.isMetricEnabled('deaths') && this.isMetricEnabled('assists')) {
            this.uniquePlayers.forEach(player => {
                const stats = this.calculatePlayerStats(player);
                const kda = parseFloat(stats.kda);
                if (!isNaN(kda) && kda > bestKdaValue) {
                    bestKdaValue = kda;
                    bestKdaPlayer = player;
                }
            });
        }

        return {
            totalMatches,
            totalTeams: this.uniqueTeams.size,
            totalPlayers: this.uniquePlayers.size,
            metricValues: avgResults,
            bestKDA: bestKdaValue,
            bestKdaPlayer
        };
    }

    updateSummaryCards() {
        const container = document.getElementById('stats-summary-cards');
        if (!container) return;
        const stats = this.calculateSummaryStats();
        const enabled = this.getEnabledMetrics();

        let html = `
            <div class="summary-card glass fade-in" role="listitem">
                <div class="sc-value">${stats.totalMatches}</div>
                <div class="sc-label">Partidos</div>
            </div>
            <div class="summary-card glass fade-in" role="listitem">
                <div class="sc-value">${stats.totalTeams}</div>
                <div class="sc-label">Equipos</div>
            </div>
            <div class="summary-card glass fade-in" role="listitem">
                <div class="sc-value">${stats.totalPlayers}</div>
                <div class="sc-label">Jugadores</div>
            </div>
        `;

        if (enabled.length === 0) {
            html += `
                <div class="summary-card glass fade-in" style="grid-column: 1 / -1; text-align: center; padding: 1rem;">
                    <p style="color: var(--text-light);">No hay grupos de métricas habilitados</p>
                </div>
            `;
        } else {
            enabled.forEach(metric => {
                const value = stats.metricValues[metric.key] !== undefined ? stats.metricValues[metric.key] : 0;
                let display;
                if (metric.format === 'percentage') {
                    display = value.toFixed(1) + '%';
                } else {
                    display = this.formatNumber(Math.round(value));
                }
                html += `
                    <div class="summary-card glass fade-in" role="listitem">
                        <div class="sc-value">${display}</div>
                        <div class="sc-label">${metric.label}</div>
                    </div>
                `;
            });

            // Best KDA
            if (this.isMetricEnabled('kills') && this.isMetricEnabled('deaths') && this.isMetricEnabled('assists')) {
                html += `
                    <div class="summary-card glass fade-in" role="listitem">
                        <div class="sc-value">${stats.bestKDA.toFixed(2)}</div>
                        <div class="sc-label">Mejor KDA (${escapeHTML(stats.bestKdaPlayer || '—')})</div>
                    </div>
                `;
            }
        }

        container.innerHTML = html;
    }

    // ---- Team Stats Table ----
    updateTeamStatsTable() {
        const tbody = document.querySelector('#team-stats-table tbody');
        if(!tbody) return;
        const enabled = this.getEnabledMetrics();
        const teams = Array.from(this.uniqueTeams);
        const teamStats = teams.map(t => this.calculateTeamStats(t))
            .filter(t => t.matches > 0)
            .sort((a,b) => {
                if (a.wins !== b.wins) return b.wins - a.wins;
                if (this.isMetricEnabled('kills') && a.kda && b.kda) {
                    return parseFloat(b.kda) - parseFloat(a.kda);
                }
                return b.total_heroDamageDealt - a.total_heroDamageDealt;
            });

        if (teamStats.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${2 + (enabled.length > 0 ? enabled.length + 1 : 1)}" class="no-data-row">No hay datos para la fase seleccionada</td></tr>`;
            // Also update thead?
            return;
        }

        // Build headers
        const thead = document.querySelector('#team-stats-table thead');
        if (thead) {
            let headers = '<tr><th>Equipo</th><th>Partidos</th><th>Victorias</th>';
            if (this.isMetricEnabled('kills')) {
                headers += '<th>KDA</th>';
            }
            enabled.forEach(metric => {
                headers += `<th>${metric.label}</th>`;
            });
            headers += '</tr>';
            thead.innerHTML = headers;
        }

        // Build rows
        let rows = '';
        teamStats.forEach(t => {
            let row = `<tr><td>${escapeHTML(t.name)}</td><td>${t.matches}</td><td>${t.wins}</td>`;
            if (this.isMetricEnabled('kills')) {
                row += `<td>${t.kda}</td>`;
            }
            enabled.forEach(metric => {
                let val;
                if (metric.aggregation === 'sum') {
                    val = t['total_' + metric.key] || 0;
                } else {
                    val = t['avg_' + metric.key] || 0;
                }
                let display;
                if (metric.format === 'percentage') {
                    display = val.toFixed(1) + '%';
                } else {
                    display = this.formatNumber(Math.round(val));
                }
                row += `<td>${display}</td>`;
            });
            row += '</tr>';
            rows += row;
        });
        tbody.innerHTML = rows;
    }

    // ---- Player Stats Table ----
    updatePlayerStatsTable() {
        const tbody = document.querySelector('#player-stats-table tbody');
        if(!tbody) return;
        const enabled = this.getEnabledMetrics();
        const players = Array.from(this.uniquePlayers);
        const playerStats = players.map(p => this.calculatePlayerStats(p))
            .filter(p => p.matches > 0)
            .sort((a,b) => {
                if (this.isMetricEnabled('kills')) {
                    return b.kills - a.kills;
                }
                return b.total_heroDamageDealt - a.total_heroDamageDealt;
            })
            .slice(0, 20);

        if (playerStats.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${3 + (enabled.length > 0 ? enabled.length : 0)}" class="no-data-row">No hay datos para la fase seleccionada</td></tr>`;
            return;
        }

        const thead = document.querySelector('#player-stats-table thead');
        if (thead) {
            let headers = '<tr><th>Jugador</th><th>Equipo</th>';
            if (this.isMetricEnabled('kills')) {
                headers += '<th>KDA</th>';
            }
            enabled.forEach(metric => {
                headers += `<th>${metric.label}</th>`;
            });
            headers += '</tr>';
            thead.innerHTML = headers;
        }

        let rows = '';
        playerStats.forEach(p => {
            let row = `<tr><td>${escapeHTML(p.name)}</td><td>${escapeHTML(p.team)}</td>`;
            if (this.isMetricEnabled('kills')) {
                row += `<td>${p.kda}</td>`;
            }
            enabled.forEach(metric => {
                let val;
                if (metric.aggregation === 'sum') {
                    val = p['total_' + metric.key] || 0;
                } else {
                    val = p['avg_' + metric.key] || 0;
                }
                let display;
                if (metric.format === 'percentage') {
                    display = val.toFixed(1) + '%';
                } else {
                    display = this.formatNumber(Math.round(val));
                }
                row += `<td>${display}</td>`;
            });
            row += '</tr>';
            rows += row;
        });
        tbody.innerHTML = rows;
    }

    // ---- Top Teams Ranking ----
    updateTopTeamsRanking() {
        const container = document.getElementById('top-teams-ranking');
        if (!container) return;
        const enabled = this.getEnabledMetrics();
        const teams = Array.from(this.uniqueTeams);
        const topTeams = teams.map(t => this.calculateTeamStats(t))
            .filter(t => t.matches > 0)
            .sort((a,b) => b.wins - a.wins || parseFloat(b.kda || 0) - parseFloat(a.kda || 0))
            .slice(0, 4);

        if (topTeams.length === 0) {
            container.innerHTML = `<div class="no-data-msg">No hay datos para la fase seleccionada</div>`;
            return;
        }

        // Build ranking cards
        let html = `<div class="ranking-cards">`;
        topTeams.forEach((t, idx) => {
            const cls = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅';
            let statsHtml = `<span>Victorias: ${t.wins}</span>`;
            if (this.isMetricEnabled('kills')) {
                statsHtml += `<span>KDA: ${t.kda}</span>`;
            }
            // Show first enabled sum metric
            const firstSum = enabled.find(m => m.aggregation === 'sum');
            if (firstSum) {
                const val = t['total_' + firstSum.key] || 0;
                statsHtml += `<span>${firstSum.label}: ${this.formatNumber(Math.round(val))}</span>`;
            }

            const logoSrc = this.getTeamLogo(t.name);
            const escapedName = escapeHTML(t.name);

            html += `
                <div class="ranking-card glass ${cls}" role="listitem">
                    <div class="ranking-card-header">
                        <img class="hok-stats-team-logo" src="${logoSrc}" alt="${escapedName}" 
                             data-team="${escapedName}"
                             data-logo-managed="team"
                             data-logo-retry-index="1"
                             onerror="window.handleTeamLogoError(this, '${escapedName}')" />
                        ${medal} ${escapedName}
                    </div>
                    <div class="ranking-card-stats">${statsHtml}</div>
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;
    }

    // ---- Top Players Ranking ----
    updateTopPlayersRanking() {
        const container = document.getElementById('top-players-ranking');
        if (!container) return;
        const enabled = this.getEnabledMetrics();
        // Determine ranking metric: prefer kills, else damage, else first sum
        let rankMetric = null;
        if (this.isMetricEnabled('kills')) {
            rankMetric = { key: 'kills', label: 'Eliminaciones' };
        } else if (this.isMetricEnabled('heroDamageDealt')) {
            rankMetric = { key: 'heroDamageDealt', label: 'Daño' };
        } else {
            const firstSum = enabled.find(m => m.aggregation === 'sum');
            if (firstSum) {
                rankMetric = { key: firstSum.key, label: firstSum.label };
            }
        }

        if (!rankMetric) {
            container.innerHTML = `<div class="no-data-msg">No hay métricas de ranking habilitadas</div>`;
            return;
        }

        const players = Array.from(this.uniquePlayers);
        const topPlayers = players.map(p => this.calculatePlayerStats(p))
            .filter(p => p.matches > 0)
            .sort((a,b) => {
                const va = a['total_' + rankMetric.key] || 0;
                const vb = b['total_' + rankMetric.key] || 0;
                return vb - va;
            })
            .slice(0, 5);

        if (topPlayers.length === 0) {
            container.innerHTML = `<div class="no-data-msg">No hay datos para la fase seleccionada</div>`;
            return;
        }

        let html = `<div class="ranking-cards">`;
        topPlayers.forEach((p, idx) => {
            const cls = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '⭐';
            const val = p['total_' + rankMetric.key] || 0;
            let statsHtml = `<span>Equipo: ${escapeHTML(p.team)}</span>`;
            if (this.isMetricEnabled('kills')) {
                statsHtml += `<span>KDA: ${p.kda}</span>`;
            }
            statsHtml += `<span>${rankMetric.label}: ${this.formatNumber(Math.round(val))}</span>`;
            html += `
                <div class="ranking-card glass ${cls}" role="listitem">
                    <div class="ranking-card-header">${medal} ${escapeHTML(p.name)}</div>
                    <div class="ranking-card-stats">${statsHtml}</div>
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;
    }

    // ================== MODO PRESENTACIÓN (dinámico) ==================
    togglePresentationMode() {
        if(this.isPresentationOpen) {
            this.closePresentationMode();
        } else {
            this.openPresentationMode();
        }
    }

    openPresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        const toggleBtn = document.getElementById('presentation-mode-toggle');
        if(!overlay) return;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        this.isPresentationOpen = true;
        document.body.classList.add('presentation-active');
        if(toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        this.updatePresentationStats();
        overlay.focus();
    }

    closePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        const toggleBtn = document.getElementById('presentation-mode-toggle');
        if(!overlay) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        this.isPresentationOpen = false;
        document.body.classList.remove('presentation-active');
        if(toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        if(toggleBtn) toggleBtn.focus();
    }

    updatePresentationStats() {
        const container = document.getElementById('presentation-stats-tables');
        if(!container) return;
        const enabled = this.getEnabledMetrics();
        const summary = this.calculateSummaryStats();

        // Top teams
        const topTeams = Array.from(this.uniqueTeams)
            .map(t => this.calculateTeamStats(t))
            .filter(t => t.matches > 0)
            .sort((a,b) => b.wins - a.wins || parseFloat(b.kda || 0) - parseFloat(a.kda || 0))
            .slice(0, 3);

        // Top players
        let rankMetric = null;
        if (this.isMetricEnabled('kills')) {
            rankMetric = { key: 'kills', label: 'Eliminaciones' };
        } else if (this.isMetricEnabled('heroDamageDealt')) {
            rankMetric = { key: 'heroDamageDealt', label: 'Daño' };
        } else {
            const firstSum = enabled.find(m => m.aggregation === 'sum');
            if (firstSum) {
                rankMetric = { key: firstSum.key, label: firstSum.label };
            }
        }
        let topPlayers = [];
        if (rankMetric) {
            topPlayers = Array.from(this.uniquePlayers)
                .map(p => this.calculatePlayerStats(p))
                .filter(p => p.matches > 0)
                .sort((a,b) => {
                    const va = a['total_' + rankMetric.key] || 0;
                    const vb = b['total_' + rankMetric.key] || 0;
                    return vb - va;
                })
                .slice(0, 3);
        }

        const bestKdaDisplay = summary.bestKdaPlayer ? `${summary.bestKDA.toFixed(2)} (${escapeHTML(summary.bestKdaPlayer)})` : '—';

        let html = `
            <div class="presentation-summary">
                <div class="presentation-stats-grid">
                    <div class="presentation-stat-card">🎮 Partidos: ${summary.totalMatches}</div>
                    <div class="presentation-stat-card">🏆 Equipos: ${summary.totalTeams}</div>
                    <div class="presentation-stat-card">👥 Jugadores: ${summary.totalPlayers}</div>
        `;
        // Add enabled metric cards
        enabled.forEach(metric => {
            const val = summary.metricValues[metric.key] !== undefined ? summary.metricValues[metric.key] : 0;
            let display;
            if (metric.format === 'percentage') {
                display = val.toFixed(1) + '%';
            } else {
                display = this.formatNumber(Math.round(val));
            }
            html += `<div class="presentation-stat-card">📊 ${metric.label}: ${display}</div>`;
        });
        if (this.isMetricEnabled('kills')) {
            html += `<div class="presentation-stat-card">🌟 Mejor KDA: ${bestKdaDisplay}</div>`;
        }
        html += `
                </div>
            </div>
            <div class="presentation-rankings">
                <div class="presentation-teams">
                    <h3>🏅 Top 3 Equipos</h3>
                    <div class="presentation-grid">
                        ${topTeams.map(t => {
                            const logoSrc = this.getTeamLogo(t.name);
                            const escapedName = escapeHTML(t.name);
                            return `
                            <div class="presentation-card glass">
                                <h4>
                                    <img class="hok-stats-team-logo" src="${logoSrc}" alt="${escapedName}" 
                                         data-team="${escapedName}"
                                         data-logo-managed="team"
                                         data-logo-retry-index="1"
                                         style="width:24px;height:24px;border-radius:50%;object-fit:cover;margin-right:6px;"
                                         onerror="window.handleTeamLogoError(this, '${escapedName}')" />
                                    ${escapedName}
                                </h4>
                                <p>Victorias: ${t.wins}${this.isMetricEnabled('kills') ? ' | KDA: '+t.kda : ''}</p>
                            </div>
                        `}).join('')}
                    </div>
                </div>
        `;
        if (rankMetric && topPlayers.length > 0) {
            html += `
                <div class="presentation-players">
                    <h3>⭐ Top 3 Jugadores</h3>
                    <div class="presentation-grid">
                        ${topPlayers.map(p => `
                            <div class="presentation-card glass">
                                <h4>${escapeHTML(p.name)}</h4>
                                <p>Equipo: ${escapeHTML(p.team)}${this.isMetricEnabled('kills') ? ' | KDA: '+p.kda : ''}</p>
                                <p>${rankMetric.label}: ${this.formatNumber(Math.round(p['total_' + rankMetric.key] || 0))}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        html += `</div>`;
        container.innerHTML = html;
    }

    // ================== CÁLCULOS AUXILIARES (con todas las métricas) ==================
    calculateTeamStats(teamName) {
        let matches=0, wins=0;
        const allMetrics = this.getAllMetrics();
        // Inicializar acumuladores
        const sums = {};
        const counts = {};
        allMetrics.forEach(m => {
            sums[m.key] = 0;
            counts[m.key] = 0;
        });

        const phases = this.currentPhase === 'all' ? ['cuartos','semifinal','final'] : [this.currentPhase];
        for (const phaseName of phases) {
            const phase = this.data[phaseName];
            if (!phase) continue;
            Object.values(phase).forEach(match => {
                let teamInMatch=false, matchCount=0;
                const matchWinner = this.determineMatchWinner(match);
                match.forEach(row => {
                    if(this.getTextValue(row, 'team') === teamName) {
                        teamInMatch = true;
                        matchCount++;
                        allMetrics.forEach(metric => {
                            const val = this.getNumericValue(row, metric.key);
                            if (val !== null && isFinite(val)) {
                                sums[metric.key] += val;
                                counts[metric.key] += 1;
                            }
                        });
                    }
                });
                if(teamInMatch && matchCount > 0) {
                    matches++;
                    if(matchWinner === teamName) wins++;
                }
            });
        }

        // Calcular promedios
        const avgResults = {};
        allMetrics.forEach(m => {
            if (m.aggregation === 'sum') {
                avgResults['total_' + m.key] = sums[m.key] || 0;
                avgResults['avg_' + m.key] = 0;
            } else {
                avgResults['total_' + m.key] = 0;
                avgResults['avg_' + m.key] = counts[m.key] > 0 ? sums[m.key] / counts[m.key] : 0;
            }
        });

        // KDA (solo si modo_5v5)
        let kda = '0.00';
        if (this.isMetricEnabled('kills') && this.isMetricEnabled('deaths') && this.isMetricEnabled('assists')) {
            const k = avgResults['total_kills'] || 0;
            const d = avgResults['total_deaths'] || 0;
            const a = avgResults['total_assists'] || 0;
            kda = ((k + a) / Math.max(d, 1)).toFixed(2);
        } else {
            kda = '—';
        }

        // Para compatibilidad con código existente que usa totalDamage, totalGold, avgParticipation
        const result = {
            name: teamName,
            matches,
            wins,
            kda,
            // legacy fields
            totalDamage: avgResults['total_heroDamageDealt'] || 0,
            totalGold: avgResults['total_gold'] || 0,
            avgParticipation: avgResults['avg_participation'] || 0,
            kills: avgResults['total_kills'] || 0,
            deaths: avgResults['total_deaths'] || 0,
            assists: avgResults['total_assists'] || 0,
        };
        // Añadir todas las métricas con prefijos
        allMetrics.forEach(m => {
            result['total_' + m.key] = avgResults['total_' + m.key] || 0;
            result['avg_' + m.key] = avgResults['avg_' + m.key] || 0;
        });
        return result;
    }

    calculateTeamStatsForPhase(teamName, phase) {
        if(!this.data[phase]) return { matches:0 };
        const allMetrics = this.getAllMetrics();
        const sums = {};
        allMetrics.forEach(m => { sums[m.key] = 0; });
        let matches=0;
        Object.values(this.data[phase]).forEach(match => {
            let teamInMatch=false;
            match.forEach(row => {
                if(this.getTextValue(row, 'team') === teamName) {
                    teamInMatch = true;
                    allMetrics.forEach(metric => {
                        const val = this.getNumericValue(row, metric.key);
                        if (val !== null && isFinite(val)) {
                            sums[metric.key] += val;
                        }
                    });
                }
            });
            if(teamInMatch) matches++;
        });
        const result = { matches };
        allMetrics.forEach(m => {
            result['total_' + m.key] = sums[m.key] || 0;
        });
        return result;
    }

    calculatePlayerStats(playerName) {
        let matches=0;
        const allMetrics = this.getAllMetrics();
        const sums = {};
        const counts = {};
        allMetrics.forEach(m => {
            sums[m.key] = 0;
            counts[m.key] = 0;
        });
        let team = '';

        const phases = this.currentPhase === 'all' ? ['cuartos','semifinal','final'] : [this.currentPhase];
        for (const phaseName of phases) {
            const phase = this.data[phaseName];
            if (!phase) continue;
            Object.values(phase).forEach(match => {
                let playerInMatch=false;
                match.forEach(row => {
                    if(this.getTextValue(row, 'player') === playerName) {
                        playerInMatch = true;
                        team = this.getTextValue(row, 'team') || '';
                        allMetrics.forEach(metric => {
                            const val = this.getNumericValue(row, metric.key);
                            if (val !== null && isFinite(val)) {
                                sums[metric.key] += val;
                                counts[metric.key] += 1;
                            }
                        });
                    }
                });
                if(playerInMatch) matches++;
            });
        }

        const avgResults = {};
        allMetrics.forEach(m => {
            if (m.aggregation === 'sum') {
                avgResults['total_' + m.key] = sums[m.key] || 0;
                avgResults['avg_' + m.key] = 0;
            } else {
                avgResults['total_' + m.key] = 0;
                avgResults['avg_' + m.key] = counts[m.key] > 0 ? sums[m.key] / counts[m.key] : 0;
            }
        });

        let kda = '0.00';
        if (this.isMetricEnabled('kills') && this.isMetricEnabled('deaths') && this.isMetricEnabled('assists')) {
            const k = avgResults['total_kills'] || 0;
            const d = avgResults['total_deaths'] || 0;
            const a = avgResults['total_assists'] || 0;
            kda = ((k + a) / Math.max(d, 1)).toFixed(2);
        } else {
            kda = '—';
        }

        const result = {
            name: playerName,
            team,
            matches,
            kda,
            // legacy
            kills: avgResults['total_kills'] || 0,
            deaths: avgResults['total_deaths'] || 0,
            assists: avgResults['total_assists'] || 0,
            totalDamage: avgResults['total_heroDamageDealt'] || 0,
            totalGold: avgResults['total_gold'] || 0,
        };
        allMetrics.forEach(m => {
            result['total_' + m.key] = avgResults['total_' + m.key] || 0;
            result['avg_' + m.key] = avgResults['avg_' + m.key] || 0;
        });
        return result;
    }

    determineMatchWinner(matchData) {
        if(!Array.isArray(matchData) || matchData.length===0) return null;
        const winners = [];
        for(const row of matchData) {
            const w = this.getTextValue(row, 'winner');
            if(w) winners.push(w);
        }
        if(winners.length===0) return null;
        const count = {};
        winners.forEach(w=>count[w]=(count[w]||0)+1);
        let max=0, winner=null, tie=false;
        for(const [t,c] of Object.entries(count)) {
            if(c>max) { max=c; winner=t; tie=false; }
            else if(c===max) { tie=true; }
        }
        return tie ? null : winner;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.statsPage = new StatsPage();
});

// Fallback global de imágenes – modificado para ignorar logos de equipo administrados
window.addEventListener('error', (e) => {
    const image = e.target;
    if (!(image instanceof HTMLImageElement)) return;
    // Ignorar imágenes administradas (logos de equipo)
    if (image.dataset.logoManaged === 'team') {
        return;
    }
    const src = image.src || '';
    if (src.includes('default_logo.png')) return;
    if (src.includes('assets/logos/') || src.includes('assets/players/')) {
        image.dataset.fallbackApplied = 'true';
        image.src = 'assets/logos/default_logo.png';
        image.onerror = null;
    }
}, true);