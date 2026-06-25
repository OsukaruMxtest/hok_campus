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
// GLOBAL TEAM LOGO FALLBACK
// ============================================================
window.handleTeamLogoError = function(img, teamName) {
    if (img.dataset.logoManaged === 'team' && window.featuredPlayers && typeof window.featuredPlayers.applyTeamLogoFallback === 'function') {
        window.featuredPlayers.applyTeamLogoFallback(img, teamName);
        return;
    }
    img.src = 'assets/logos/default_logo.png';
    img.onerror = null;
};
// ============================================================

// Parser CSV robusto con soporte para comillas, comas escapadas, saltos \r\n y BOM
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
// INYECCIÓN DE ESTILOS PARA LOGOS EN FEATURED PLAYERS
// ============================================================
(function injectFeaturedStyles() {
    if (document.getElementById('hok-featured-styles')) return;
    const style = document.createElement('style');
    style.id = 'hok-featured-styles';
    style.textContent = `
        .featured-player-team-logo {
            width: 20px;
            height: 20px;
            margin-left: 4px;
            margin-right: 4px;
            vertical-align: middle;
            border-radius: 50%;
            object-fit: cover;
            background-color: rgba(255,255,255,0.1);
            display: inline-block;
            flex-shrink: 0;
        }
        .player-team {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-wrap: wrap;
        }
        .modal-player-team .featured-player-team-logo {
            width: 24px;
            height: 24px;
        }
        .pres-team .featured-player-team-logo {
            width: 18px;
            height: 18px;
        }
    `;
    document.head.appendChild(style);
})();

class FeaturedPlayersDashboard {
    constructor() {
        this.data = { cuartos: {}, semifinal: {}, final: {} };
        this.topPlayersByPhase = { cuartos: [], semifinal: [], final: [] };
        this.uniquePlayers = new Set();
        this.modalTriggerElement = null;
        this.isModalOpen = false;
        this._hasError = false;
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

    isMetricEnabled(key) {
        return this.getEnabledMetrics().some(m => m.key === key);
    }
    // ================================================================

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
        const aliases = {
            team: ['EQUIPO', 'Equipo', 'Team'],
            player: ['JUGADOR', 'Jugador', 'Player'],
            winner: ['GANADOR', 'Ganador', 'Winner']
        };
        const candidates = aliases[fieldKey] || [];
        for (const c of candidates) {
            if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
                return String(row[c]).trim();
            }
        }
        return null;
    }

    // ================== HELPERS PARA LOGOS DE EQUIPOS ==================
    getTeamLogo(teamName) {
        if (!teamName) return 'assets/logos/default_logo.png';
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

    // ================== INICIALIZACIÓN ==================
    async init() {
        this.setupEventListeners();
        this.setupPlayerModal();

        try {
            await this.loadAllData();
            this.processPlayersData();
            this.calculateTopPlayersByPhase();
            this.updateFeaturedPlayersDisplay();
            this.updateStatsSummary();
            this.hideLoadingIndicator();
        } catch (err) {
            console.error(err);
            this._hasError = true;
            this.showError('Error al cargar los datos de jugadores');
        }
    }

    // ================== EVENTOS Y NAVEGACIÓN ==================
    setupEventListeners() {
        const pt = document.getElementById('presentation-mode-toggle');
        if (pt) pt.addEventListener('click', () => this.togglePresentationMode());

        const po = document.getElementById('presentation-overlay');
        if (po) {
            po.addEventListener('click', (e) => {
                if (e.target === po) this.closePresentationMode();
            });
        }

        const nt = document.getElementById('nav-toggle');
        if (nt) nt.addEventListener('click', () => this.toggleNavigation());

        const navMenu = document.getElementById('nav-menu');
        if (navMenu) {
            navMenu.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    if (navMenu.classList.contains('open')) {
                        navMenu.classList.remove('open');
                        if (nt) nt.setAttribute('aria-expanded', 'false');
                    }
                });
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.isModalOpen) {
                    this.closePlayerModal();
                } else {
                    const overlay = document.getElementById('presentation-overlay');
                    if (overlay && overlay.classList.contains('active')) {
                        this.closePresentationMode();
                    }
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (navMenu && navMenu.classList.contains('open')) {
                const navContainer = document.querySelector('.nav-container');
                if (navContainer && !navContainer.contains(e.target)) {
                    navMenu.classList.remove('open');
                    if (nt) nt.setAttribute('aria-expanded', 'false');
                }
            }
        });
    }

    toggleNavigation() {
        const navMenu = document.getElementById('nav-menu');
        const navToggle = document.getElementById('nav-toggle');
        if (navMenu) {
            const isOpen = navMenu.classList.toggle('open');
            if (navToggle) navToggle.setAttribute('aria-expanded', isOpen);
        }
    }

    // ================== MODO PRESENTACIÓN ==================
    togglePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        const toggleBtn = document.getElementById('presentation-mode-toggle');
        if (!overlay) return;
        const isActive = overlay.classList.toggle('active');
        overlay.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', isActive ? 'true' : 'false');
        if (isActive) {
            document.body.classList.add('presentation-active');
            this.updatePresentationFeaturedPlayers();
            overlay.focus();
        } else {
            document.body.classList.remove('presentation-active');
            if (toggleBtn) toggleBtn.focus();
        }
    }

    closePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        const toggleBtn = document.getElementById('presentation-mode-toggle');
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('presentation-active');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.focus();
        }
    }

    // ================== MODAL DE JUGADOR ==================
    setupPlayerModal() {
        const modal = document.getElementById('player-modal');
        if (!modal) return;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closePlayerModal();
        });

        const titleEl = document.getElementById('player-modal-title');
        if (titleEl) {
            this._originalModalTitle = titleEl.textContent;
        }
    }

    openPlayerModal(playerName, phase) {
        const modal = document.getElementById('player-modal');
        const titleEl = document.getElementById('player-modal-title');
        const bodyEl = document.getElementById('player-modal-content');
        if (!modal || !bodyEl) return;

        const stats = this.getPlayerStatsInPhase(playerName, phase);
        if (!stats) {
            bodyEl.innerHTML = '<p class="no-data-msg">No hay datos disponibles para este jugador en esta fase.</p>';
            return;
        }

        this.modalTriggerElement = document.activeElement;

        const phaseNames = { cuartos: 'Clasificatorias Día 1', semifinal: 'Semifinales', final: 'Final' };
        const rank = this.getPlayerRank(playerName, phase);
        const rankText = rank ? `#${rank}` : '—';
        const team = this.getPlayerTeam(playerName, phase) || 'Sin equipo';

        if (titleEl) {
            titleEl.textContent = `${playerName} - Detalles`;
        }

        // Avatar con fallback
        const avatarImg = document.createElement('img');
        avatarImg.src = this.getPlayerImage(playerName);
        avatarImg.alt = playerName;
        let fallbackApplied = false;
        avatarImg.addEventListener('error', function onError() {
            if (fallbackApplied) return;
            fallbackApplied = true;
            this.src = 'assets/logos/default_logo.png';
        });

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'modal-player-avatar';
        avatarDiv.appendChild(avatarImg);

        const headerDiv = document.createElement('div');
        headerDiv.className = 'modal-player-header';

        const rankDiv = document.createElement('div');
        rankDiv.className = 'modal-player-rank';
        rankDiv.textContent = rankText;

        const nameDiv = document.createElement('div');
        nameDiv.className = 'modal-player-name';
        nameDiv.textContent = playerName;

        // Equipo con logo
        const teamDiv = document.createElement('div');
        teamDiv.className = 'modal-player-team';
        const logoSrc = this.getTeamLogo(team);
        const teamLogo = document.createElement('img');
        teamLogo.className = 'featured-player-team-logo';
        teamLogo.src = logoSrc;
        teamLogo.alt = team;
        teamLogo.setAttribute('aria-hidden', 'true');
        teamLogo.dataset.logoManaged = 'team';
        teamLogo.dataset.logoRetryIndex = '1';
        teamLogo.onerror = function() {
            window.handleTeamLogoError(this, team);
        };

        const teamText = document.createTextNode(`${team} · ${phaseNames[phase] || phase}`);
        teamDiv.appendChild(teamLogo);
        teamDiv.appendChild(teamText);

        headerDiv.appendChild(rankDiv);
        headerDiv.appendChild(nameDiv);
        headerDiv.appendChild(teamDiv);

        const statsGrid = document.createElement('div');
        statsGrid.className = 'modal-stats-grid';

        // Construir métricas dinámicamente
        const enabledMetrics = this.getEnabledMetrics();
        if (enabledMetrics.length === 0) {
            statsGrid.innerHTML = '<p class="no-data-msg">No hay métricas habilitadas.</p>';
        } else {
            // Primero mostramos KDA si modo_5v5 activo
            let html = '';
            if (this.isMetricEnabled('kills')) {
                const kda = stats.kda || '0.00';
                html += `
                    <div class="modal-stat-item">
                        <div class="ms-value">${kda}</div>
                        <div class="ms-label">KDA</div>
                    </div>
                `;
            }
            // Luego cada métrica habilitada
            enabledMetrics.forEach(metric => {
                let val;
                if (metric.aggregation === 'sum') {
                    val = stats['total_' + metric.key] || 0;
                } else {
                    val = stats['avg_' + metric.key] || 0;
                }
                let display;
                if (metric.format === 'percentage') {
                    display = val.toFixed(1) + '%';
                } else {
                    display = this.formatNumber(Math.round(val));
                }
                html += `
                    <div class="modal-stat-item">
                        <div class="ms-value">${display}</div>
                        <div class="ms-label">${metric.label}</div>
                    </div>
                `;
            });
            statsGrid.innerHTML = html;
        }

        bodyEl.innerHTML = '';
        bodyEl.appendChild(avatarDiv);
        bodyEl.appendChild(headerDiv);
        bodyEl.appendChild(statsGrid);

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        this.isModalOpen = true;
        document.body.classList.add('modal-open');
        modal.focus();
    }

    closePlayerModal() {
        const modal = document.getElementById('player-modal');
        const titleEl = document.getElementById('player-modal-title');
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        this.isModalOpen = false;
        document.body.classList.remove('modal-open');

        if (titleEl && this._originalModalTitle) {
            titleEl.textContent = this._originalModalTitle;
        }

        if (this.modalTriggerElement && this.modalTriggerElement.isConnected) {
            this.modalTriggerElement.focus();
        }
        this.modalTriggerElement = null;
    }

    getPlayerRank(playerName, phase) {
        const list = this.topPlayersByPhase[phase] || [];
        const idx = list.findIndex(p => p.name === playerName);
        return idx !== -1 ? idx + 1 : null;
    }

    getPlayerTeam(playerName, phase) {
        const phaseData = this.data[phase];
        if (!phaseData) return null;
        for (const match of Object.values(phaseData)) {
            for (const row of match) {
                if (this.getTextValue(row, 'player') === playerName) {
                    const team = this.getTextValue(row, 'team');
                    if (team) return team;
                }
            }
        }
        return null;
    }

    // ================== CARGA DE DATOS ==================
    async loadAllData() {
        const phases = ['cuartos', 'semifinal', 'final'];
        for (const phase of phases) {
            try {
                await this.loadPhaseData(phase);
            } catch (e) {
                console.warn(e);
            }
        }
    }

    async loadPhaseData(phase) {
        try {
            const config = window.TOURNAMENT_CONFIG;
            let paths = [];
            if (config && config.helpers && config.helpers.getPhaseFilePaths) {
                const result = config.helpers.getPhaseFilePaths(resolvePhaseId(phase));
                if (Array.isArray(result)) {
                    paths = [...result];
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
            const loadedSet = new Set();
            for (const filePath of paths) {
                try {
                    const fileName = filePath.split('/').pop();
                    const baseKey = this.getBaseKey(fileName, phase);
                    if (loadedSet.has(baseKey)) continue;
                    const csvData = await this.loadCSV(filePath);
                    const rows = this.parseCSV(csvData);
                    if (this.hasValidData(rows)) {
                        this.data[phase][fileName] = rows;
                        loadedSet.add(baseKey);
                    } else {
                        console.warn('Archivo sin datos válidos, se probará variante alternativa:', filePath);
                    }
                } catch (e) {
                    console.warn('No se pudo cargar', filePath, e);
                }
            }
        } catch (e) {
            console.warn(`Error cargando fase ${phase}:`, e);
        }
    }

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
            return ['SF1M1', 'SF1M2', 'SF1M3', 'SF2M1', 'SF2M2', 'SF2M3'];
        } else if (phase === 'final') {
            return ['FM1', 'FM2', 'FM3', 'FM4', 'FM5'];
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

    async loadCSV(path) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to fetch ${path}`);
        return response.text();
    }

    parseCSV(csvText) {
        return parseCSV(csvText);
    }

    // ================== PROCESAMIENTO DE JUGADORES ==================
    processPlayersData() {
        this.uniquePlayers.clear();
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                match.forEach(row => {
                    const p = this.getTextValue(row, 'player');
                    if (p) this.uniquePlayers.add(p);
                });
            });
        });
    }

    // ================== CÁLCULO DE RANKING ==================
    calculateTopPlayersByPhase() {
        const phases = ['cuartos', 'semifinal', 'final'];
        const is5v5 = this.isMetricEnabled('kills');
        const isChaos = this.isMetricEnabled('heroDamageDealt') && this.isMetricEnabled('teamFightPresence') &&
                        this.isMetricEnabled('goldPercentage') && this.isMetricEnabled('heroDamageTaken');

        phases.forEach(phase => {
            const statsList = [];
            const playersInPhase = this.getPlayersInPhase(phase);
            playersInPhase.forEach(p => {
                const s = this.getPlayerStatsInPhase(p, phase);
                if (s && s.matches > 0) statsList.push({ name: p, stats: s });
            });

            if (statsList.length === 0) {
                this.topPlayersByPhase[phase] = [];
                return;
            }

            if (is5v5) {
                // Criterio 5v5: kills, damage, assists
                statsList.sort((a, b) => {
                    if (b.stats.total_kills !== a.stats.total_kills) return b.stats.total_kills - a.stats.total_kills;
                    if (b.stats.avg_heroDamageDealt !== a.stats.avg_heroDamageDealt) return b.stats.avg_heroDamageDealt - a.stats.avg_heroDamageDealt;
                    return b.stats.total_assists - a.stats.total_assists;
                });
            } else if (isChaos) {
                // Criterio Chaos: índice normalizado basado en:
                // Daño infligido (avg_heroDamageDealt), Presencia en peleas (avg_teamFightPresence),
                // Porcentaje de oro (avg_goldPercentage), Daño recibido (avg_heroDamageTaken)
                // Normalizamos cada métrica entre 0 y 1 usando el máximo de cada una entre todos los jugadores de esta fase.
                const maxDamage = Math.max(...statsList.map(item => item.stats.avg_heroDamageDealt || 0), 1);
                const maxTFP = Math.max(...statsList.map(item => item.stats.avg_teamFightPresence || 0), 1);
                const maxGP = Math.max(...statsList.map(item => item.stats.avg_goldPercentage || 0), 1);
                const maxTaken = Math.max(...statsList.map(item => item.stats.avg_heroDamageTaken || 0), 1);

                statsList.forEach(item => {
                    const normDamage = (item.stats.avg_heroDamageDealt || 0) / maxDamage;
                    const normTFP = (item.stats.avg_teamFightPresence || 0) / maxTFP;
                    const normGP = (item.stats.avg_goldPercentage || 0) / maxGP;
                    const normTaken = (item.stats.avg_heroDamageTaken || 0) / maxTaken;
                    // Índice: promedio de los cuatro (todos contribuyen positivamente)
                    item._chaosIndex = (normDamage + normTFP + normGP + normTaken) / 4;
                });

                statsList.sort((a, b) => (b._chaosIndex || 0) - (a._chaosIndex || 0));
            } else {
                // Sin métricas, orden alfabético
                statsList.sort((a, b) => a.name.localeCompare(b.name));
            }

            this.topPlayersByPhase[phase] = statsList.slice(0, 10);
        });
    }

    // ================== OBTENCIÓN DE ESTADÍSTICAS DE JUGADOR ==================
    getPlayersInPhase(phase) {
        if (!this.data[phase]) return [];
        const players = new Set();
        Object.values(this.data[phase]).forEach(match => {
            match.forEach(row => {
                const p = this.getTextValue(row, 'player');
                if (p) players.add(p);
            });
        });
        return Array.from(players);
    }

    getPlayerStatsInPhase(playerName, phase) {
        if (!this.data[phase]) return null;
        // Inicializar todas las métricas
        const metrics = {
            kills: 0, deaths: 0, assists: 0, gold: 0,
            heroDamageDealt: 0, heroDamageTaken: 0,
            goldPercentage: 0, teamFightPresence: 0,
            crowdControl: 0, towerDamage: 0,
            participation: 0
        };
        let matches = 0;

        Object.values(this.data[phase]).forEach(match => {
            let found = false;
            match.forEach(row => {
                if (this.getTextValue(row, 'player') === playerName) {
                    const k = this.getNumericValue(row, 'kills');
                    if (k !== null) metrics.kills += k;
                    const d = this.getNumericValue(row, 'deaths');
                    if (d !== null) metrics.deaths += d;
                    const a = this.getNumericValue(row, 'assists');
                    if (a !== null) metrics.assists += a;
                    const g = this.getNumericValue(row, 'gold');
                    if (g !== null) metrics.gold += g;
                    const hd = this.getNumericValue(row, 'heroDamageDealt');
                    if (hd !== null) metrics.heroDamageDealt += hd;
                    const ht = this.getNumericValue(row, 'heroDamageTaken');
                    if (ht !== null) metrics.heroDamageTaken += ht;
                    const gp = this.getNumericValue(row, 'goldPercentage');
                    if (gp !== null) metrics.goldPercentage += gp;
                    const tfp = this.getNumericValue(row, 'teamFightPresence');
                    if (tfp !== null) metrics.teamFightPresence += tfp;
                    const cc = this.getNumericValue(row, 'crowdControl');
                    if (cc !== null) metrics.crowdControl += cc;
                    const td = this.getNumericValue(row, 'towerDamage');
                    if (td !== null) metrics.towerDamage += td;
                    const part = this.getNumericValue(row, 'participation');
                    if (part !== null) metrics.participation += part;
                    found = true;
                }
            });
            if (found) matches++;
        });

        if (matches === 0) return null;

        // Calcular promedios para métricas que son promedio (participation, crowdControl, goldPercentage, teamFightPresence)
        const avgParticipation = metrics.participation / matches;
        const avgCrowdControl = metrics.crowdControl / matches;
        const avgGoldPercentage = metrics.goldPercentage / matches;
        const avgTeamFightPresence = metrics.teamFightPresence / matches;
        const avgDamage = metrics.heroDamageDealt / matches;
        const avgGold = metrics.gold / matches;
        const avgHeroDamageTaken = metrics.heroDamageTaken / matches;
        const avgTowerDamage = metrics.towerDamage / matches;

        // KDA (si modo_5v5 activo)
        const kda = (metrics.deaths === 0) ? (metrics.kills + metrics.assists).toFixed(2) :
                    ((metrics.kills + metrics.assists) / metrics.deaths).toFixed(2);

        // Totales y promedios con prefijos para acceso dinámico
        const result = {
            matches,
            total_kills: metrics.kills,
            total_deaths: metrics.deaths,
            total_assists: metrics.assists,
            total_gold: metrics.gold,
            total_heroDamageDealt: metrics.heroDamageDealt,
            total_heroDamageTaken: metrics.heroDamageTaken,
            total_goldPercentage: metrics.goldPercentage,
            total_teamFightPresence: metrics.teamFightPresence,
            total_crowdControl: metrics.crowdControl,
            total_towerDamage: metrics.towerDamage,
            total_participation: metrics.participation,
            avg_heroDamageDealt: avgDamage,
            avg_gold: avgGold,
            avg_participation: avgParticipation,
            avg_crowdControl: avgCrowdControl,
            avg_goldPercentage: avgGoldPercentage,
            avg_teamFightPresence: avgTeamFightPresence,
            avg_heroDamageTaken: avgHeroDamageTaken,
            avg_towerDamage: avgTowerDamage,
            kda: kda
        };
        return result;
    }

    // ================== RENDERIZADO DE TARJETAS ==================
    updateFeaturedPlayersDisplay() {
        this.updatePhasePlayers('cuartos');
        this.updatePhasePlayers('semifinal');
        this.updatePhasePlayers('final');
    }

    updatePhasePlayers(phase) {
        const container = document.getElementById(`${phase}-players`);
        if (!container) return;
        container.setAttribute('role', 'list');

        const players = this.topPlayersByPhase[phase];
        const enabledMetrics = this.getEnabledMetrics();

        if (players.length === 0) {
            container.innerHTML = '<p class="no-players">No hay datos disponibles para esta fase.</p>';
            return;
        }

        if (enabledMetrics.length === 0) {
            container.innerHTML = '<p class="no-players">No hay métricas habilitadas.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        players.forEach((p, idx) => {
            const rank = idx + 1;
            let rankClass = 'rank-standard';
            if (rank === 1) rankClass = 'rank-1';
            else if (rank === 2) rankClass = 'rank-2';
            else if (rank === 3) rankClass = 'rank-3';

            const playerName = p.name;
            const card = document.createElement('div');
            card.className = `featured-player-card ${rankClass}`;
            card.setAttribute('role', 'listitem');
            card.setAttribute('tabindex', '0');
            card.dataset.player = playerName;
            card.dataset.phase = phase;
            card.setAttribute('aria-label', `${playerName} - Puesto ${rank} en ${phase}`);

            // Avatar con fallback
            const avatarImg = document.createElement('img');
            avatarImg.src = this.getPlayerImage(playerName);
            avatarImg.alt = playerName;
            let fallbackApplied = false;
            avatarImg.addEventListener('error', function onError() {
                if (fallbackApplied) return;
                fallbackApplied = true;
                this.src = 'assets/logos/default_logo.png';
            });

            const rankDiv = document.createElement('div');
            rankDiv.className = `rank-number ${rankClass}`;
            rankDiv.textContent = `#${rank}`;

            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'player-avatar';
            avatarDiv.appendChild(avatarImg);

            const nameDiv = document.createElement('div');
            nameDiv.className = 'player-name';
            nameDiv.textContent = playerName;

            const team = this.getPlayerTeam(playerName, phase) || '';
            const teamDiv = document.createElement('div');
            teamDiv.className = 'player-team';
            if (team) {
                const logoSrc = this.getTeamLogo(team);
                const teamLogo = document.createElement('img');
                teamLogo.className = 'featured-player-team-logo';
                teamLogo.src = logoSrc;
                teamLogo.alt = team;
                teamLogo.setAttribute('aria-hidden', 'true');
                teamLogo.dataset.logoManaged = 'team';
                teamLogo.dataset.logoRetryIndex = '1';
                teamLogo.onerror = function() {
                    window.handleTeamLogoError(this, team);
                };
                const teamText = document.createTextNode(team);
                teamDiv.appendChild(teamLogo);
                teamDiv.appendChild(teamText);
            } else {
                teamDiv.textContent = 'Sin equipo';
            }

            const statsDiv = document.createElement('div');
            statsDiv.className = 'player-stats-mini';

            // Generar estadísticas dinámicamente
            let statsHtml = '';
            const stats = p.stats;

            // KDA si modo_5v5
            if (this.isMetricEnabled('kills')) {
                statsHtml += `<span class="stat-item">📊 <span class="stat-value">${stats.kda || '0.00'}</span></span>`;
            }

            enabledMetrics.forEach(metric => {
                let val;
                if (metric.aggregation === 'sum') {
                    val = stats['total_' + metric.key] || 0;
                } else {
                    val = stats['avg_' + metric.key] || 0;
                }
                let display;
                if (metric.format === 'percentage') {
                    display = val.toFixed(1) + '%';
                } else {
                    display = this.formatNumber(Math.round(val));
                }
                // Icono simple
                let icon = '📊';
                if (metric.key === 'kills') icon = '🗡️';
                else if (metric.key === 'deaths') icon = '💀';
                else if (metric.key === 'assists') icon = '🤝';
                else if (metric.key === 'gold') icon = '💰';
                else if (metric.key === 'heroDamageDealt') icon = '⚔️';
                else if (metric.key === 'heroDamageTaken') icon = '🛡️';
                else if (metric.key === 'goldPercentage') icon = '📈';
                else if (metric.key === 'teamFightPresence') icon = '🎯';
                else if (metric.key === 'crowdControl') icon = '⛓️';
                else if (metric.key === 'towerDamage') icon = '🏰';
                else if (metric.key === 'participation') icon = '🤝';
                statsHtml += `<span class="stat-item">${icon} <span class="stat-value">${display}</span></span>`;
            });

            statsDiv.innerHTML = statsHtml;

            card.appendChild(rankDiv);
            card.appendChild(avatarDiv);
            card.appendChild(nameDiv);
            card.appendChild(teamDiv);
            card.appendChild(statsDiv);

            card.addEventListener('click', () => this.openPlayerModal(playerName, phase));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.openPlayerModal(playerName, phase);
                }
            });

            fragment.appendChild(card);
        });
        container.innerHTML = '';
        container.appendChild(fragment);
    }

    // ================== RESUMEN ESTADÍSTICO ==================
    updateStatsSummary() {
        const summaryDiv = document.getElementById('stats-summary');
        if (!summaryDiv) return;

        const enabledMetrics = this.getEnabledMetrics();
        if (enabledMetrics.length === 0) {
            summaryDiv.innerHTML = '<p class="no-data-msg">No hay métricas habilitadas.</p>';
            return;
        }

        let totalMatches = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(matchData => {
                if (this.hasValidData(matchData)) {
                    totalMatches++;
                }
            });
        });

        const totalPlayers = this.uniquePlayers.size;

        // Calcular máximos globales para cada métrica
        const maxValues = {};
        enabledMetrics.forEach(metric => {
            maxValues[metric.key] = 0;
        });

        const phases = ['cuartos', 'semifinal', 'final'];
        phases.forEach(phase => {
            const playersInPhase = this.getPlayersInPhase(phase);
            playersInPhase.forEach(player => {
                const stats = this.getPlayerStatsInPhase(player, phase);
                if (stats) {
                    enabledMetrics.forEach(metric => {
                        let val;
                        if (metric.aggregation === 'sum') {
                            val = stats['total_' + metric.key] || 0;
                        } else {
                            val = stats['avg_' + metric.key] || 0;
                        }
                        if (val > maxValues[metric.key]) maxValues[metric.key] = val;
                    });
                }
            });
        });

        // Mejor KDA (si modo_5v5)
        let bestKDA = 0;
        if (this.isMetricEnabled('kills')) {
            phases.forEach(phase => {
                const playersInPhase = this.getPlayersInPhase(phase);
                playersInPhase.forEach(player => {
                    const stats = this.getPlayerStatsInPhase(player, phase);
                    if (stats) {
                        const kdaVal = parseFloat(stats.kda);
                        if (!isNaN(kdaVal) && kdaVal > bestKDA) bestKDA = kdaVal;
                    }
                });
            });
        }

        let html = `
            <div class="summary-stat" role="listitem"><div class="summary-stat-value">${totalPlayers}</div><div class="summary-stat-label">Jugadores Totales</div></div>
            <div class="summary-stat" role="listitem"><div class="summary-stat-value">${totalMatches}</div><div class="summary-stat-label">Partidos Analizados</div></div>
        `;

        // Mostrar máximo de cada métrica
        enabledMetrics.forEach(metric => {
            const val = maxValues[metric.key] || 0;
            let display;
            if (metric.format === 'percentage') {
                display = val.toFixed(1) + '%';
            } else {
                display = this.formatNumber(Math.round(val));
            }
            html += `
                <div class="summary-stat" role="listitem">
                    <div class="summary-stat-value">${display}</div>
                    <div class="summary-stat-label">Mayor ${metric.label}</div>
                </div>
            `;
        });

        if (this.isMetricEnabled('kills')) {
            html += `
                <div class="summary-stat" role="listitem">
                    <div class="summary-stat-value">${bestKDA.toFixed(2)}</div>
                    <div class="summary-stat-label">Mejor KDA</div>
                </div>
            `;
        }

        summaryDiv.innerHTML = html;
    }

    // ================== MODO PRESENTACIÓN ==================
    updatePresentationFeaturedPlayers() {
        const container = document.getElementById('presentation-featured-players');
        if (!container) return;

        const enabledMetrics = this.getEnabledMetrics();
        if (enabledMetrics.length === 0) {
            container.innerHTML = '<p class="no-data-msg">No hay métricas habilitadas.</p>';
            return;
        }

        const phases = ['cuartos', 'semifinal', 'final'];
        const phaseNames = { cuartos: 'Clasificatorias Día 1', semifinal: 'Semifinales', final: 'Final' };

        let html = '';
        phases.forEach(phase => {
            const top3 = this.topPlayersByPhase[phase].slice(0, 3);
            html += `<div class="presentation-phase">`;
            html += `<h3 class="presentation-phase-title">🏆 ${phaseNames[phase]}</h3>`;
            if (top3.length) {
                html += `<div class="presentation-players-list" role="list">`;
                top3.forEach((player, idx) => {
                    const rankIcon = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
                    const stats = player.stats;
                    let statsHtml = '';
                    // KDA si modo_5v5
                    if (this.isMetricEnabled('kills')) {
                        statsHtml += `<span>📊 <span class="pres-val">${stats.kda || '0.00'}</span></span>`;
                    }
                    enabledMetrics.forEach(metric => {
                        let val;
                        if (metric.aggregation === 'sum') {
                            val = stats['total_' + metric.key] || 0;
                        } else {
                            val = stats['avg_' + metric.key] || 0;
                        }
                        let display;
                        if (metric.format === 'percentage') {
                            display = val.toFixed(1) + '%';
                        } else {
                            display = this.formatNumber(Math.round(val));
                        }
                        let icon = '📊';
                        if (metric.key === 'kills') icon = '🗡️';
                        else if (metric.key === 'deaths') icon = '💀';
                        else if (metric.key === 'assists') icon = '🤝';
                        else if (metric.key === 'gold') icon = '💰';
                        else if (metric.key === 'heroDamageDealt') icon = '⚔️';
                        else if (metric.key === 'heroDamageTaken') icon = '🛡️';
                        else if (metric.key === 'goldPercentage') icon = '📈';
                        else if (metric.key === 'teamFightPresence') icon = '🎯';
                        else if (metric.key === 'crowdControl') icon = '⛓️';
                        else if (metric.key === 'towerDamage') icon = '🏰';
                        else if (metric.key === 'participation') icon = '🤝';
                        statsHtml += `<span>${icon} <span class="pres-val">${display}</span></span>`;
                    });

                    const team = this.getPlayerTeam(player.name, phase) || '';
                    const logoSrc = this.getTeamLogo(team);
                    const teamLogoHtml = team ? `<img class="featured-player-team-logo" src="${logoSrc}" alt="${escapeHTML(team)}" aria-hidden="true" 
                        data-logo-managed="team" data-logo-retry-index="1"
                        onerror="window.handleTeamLogoError(this, '${escapeHTML(team)}')" />` : '';

                    html += `
                        <div class="presentation-player-card" role="listitem">
                            <div class="pres-rank">${rankIcon} #${idx+1}</div>
                            <div class="pres-name">${escapeHTML(player.name)}</div>
                            <div class="pres-team">${teamLogoHtml}${escapeHTML(team)}</div>
                            <div class="pres-stats">${statsHtml}</div>
                        </div>
                    `;
                });
                html += `</div>`;
            } else {
                html += `<p class="no-data">Sin datos destacados</p>`;
            }
            html += `</div>`;
        });

        container.innerHTML = html;
    }

    // ================== UTILIDADES ==================
    formatNumber(n) {
        if (n === null || n === undefined || !isFinite(n)) return '0';
        return Number(n).toLocaleString('en-US');
    }

    getPlayerImage(playerName) {
        const clean = playerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `assets/players/${clean}.png`;
    }

    hideLoadingIndicator() {
        const ind = document.getElementById('loading-indicator');
        if (ind) {
            ind.classList.remove('active', 'loading-error');
            ind.hidden = true;
        }
    }

    showError(msg) {
        const ind = document.getElementById('loading-indicator');
        if (ind) {
            ind.hidden = false;
            ind.innerHTML = `<p class="error-msg">${escapeHTML(msg)}</p>`;
            ind.classList.add('active', 'loading-error');
        }
        const announcer = document.getElementById('featured-announcer');
        if (announcer) {
            announcer.textContent = msg;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.featuredPlayers = new FeaturedPlayersDashboard();
});

// Fallback global de imágenes – ignorar logos de equipo administrados
window.addEventListener('error', (e) => {
    const image = e.target;
    if (!(image instanceof HTMLImageElement)) return;
    if (image.dataset.logoManaged === 'team') return;
    const src = image.src || '';
    if (src.includes('default_logo.png')) return;
    if (src.includes('assets/logos/') || src.includes('assets/players/')) {
        image.dataset.fallbackApplied = 'true';
        image.src = 'assets/logos/default_logo.png';
        image.onerror = null;
    }
}, true);