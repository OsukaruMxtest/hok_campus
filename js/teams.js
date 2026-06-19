// Teams and Players Page

function resolvePhaseId(phaseId) {
    const alias = {
        cuartos: 'cuartos',
        day1_qualifiers: 'cuartos',
        semifinal: 'semifinal',
        final: 'final'
    };
    return alias[phaseId] || phaseId || 'cuartos';
}

// Parser CSV robusto con soporte para comillas y saltos \r\n
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
    // Limpiar BOM del primer encabezado si existe
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

async function loadPhaseCsvFiles(phaseId) {
    const config = window.TOURNAMENT_CONFIG;
    const resolvedPhaseId = resolvePhaseId(phaseId);

    if (!config || !config.helpers || !config.helpers.getPhaseFilePaths) {
        console.warn('[CSV] TOURNAMENT_CONFIG no disponible.');
        return [];
    }

    const paths = config.helpers.getPhaseFilePaths(resolvedPhaseId);

    if (!paths.length) {
        console.warn('[CSV] No hay archivos configurados para la fase:', resolvedPhaseId);
        return [];
    }

    const loadedFiles = [];
    const loadedBaseNames = new Set();

    // Prioridad de variantes: SF > S, FM > F1M (y F? pero no usamos F solo)
    const getVariantPriority = (fileName) => {
        const base = fileName.replace(/\.csv$/i, '');
        if (base.startsWith('SF')) return 2;
        if (base.startsWith('S')) return 1;
        if (base.startsWith('FM')) return 2;
        if (base.startsWith('F1M')) return 1;
        // Para cuartos no hay variantes
        return 0;
    };

    // Obtener nombre base normalizado (sin prefijo S/SF, F1M/FM)
    const getBaseMatch = (fileName) => {
        const base = fileName.replace(/\.csv$/i, '');
        // Para semifinal: quitar prefijo S o SF y quedarse con el número de partida
        if (base.startsWith('SF') || base.startsWith('S')) {
            const match = base.match(/^(?:S|SF)(\d+M\d+)$/);
            if (match) return 'S' + match[1]; // normalizar a S1M1, etc.
        }
        // Para final: quitar FM o F1M
        if (base.startsWith('FM') || base.startsWith('F1M')) {
            const match = base.match(/^(?:FM|F1M)(\d+)$/);
            if (match) return 'F1M' + match[1]; // normalizar a F1M1, etc.
        }
        // Para cuartos: Q...
        if (base.startsWith('Q')) {
            const match = base.match(/^(Q\d+M\d+)$/);
            if (match) return match[1];
        }
        return base;
    };

    for (const path of paths) {
        try {
            const response = await fetch(path, { cache: 'no-store' });

            if (!response.ok) {
                console.warn('[CSV] Archivo no encontrado o no disponible:', path);
                continue;
            }

            const text = await response.text();

            if (!text || !text.trim()) {
                console.warn('[CSV] Archivo vacío:', path);
                continue;
            }

            const rows = parseCSV(text);
            const fileName = path.split('/').pop();
            const baseMatch = getBaseMatch(fileName);

            // Si ya tenemos una partida con mayor prioridad, saltamos este archivo
            if (baseMatch) {
                const existing = loadedFiles.find(f => getBaseMatch(f.fileName) === baseMatch);
                if (existing) {
                    const existingPriority = getVariantPriority(existing.fileName);
                    const currentPriority = getVariantPriority(fileName);
                    if (currentPriority <= existingPriority) {
                        continue; // saltar variante de menor prioridad
                    } else {
                        // reemplazar la existente con la de mayor prioridad
                        const idx = loadedFiles.indexOf(existing);
                        loadedFiles.splice(idx, 1);
                        // y luego lo agregaremos abajo
                    }
                }
            }

            loadedFiles.push({
                phase: resolvedPhaseId,
                path: path,
                fileName: fileName,
                rows: rows
            });

        } catch (error) {
            console.warn('[CSV] Error cargando archivo:', path, error);
        }
    }

    return loadedFiles;
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

function normalizeText(str) {
    if (!str) return '';
    return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

class TeamsPage {
    constructor() {
        this.data = {
            cuartos: {},
            semifinal: {},
            final: {}
        };
        this.allTeams = new Set();
        this.allPlayers = new Set();
        this.filteredTeams = [];
        this.filteredPlayers = [];
        this.teamNameMapping = {};
        this.playerNameMapping = {};
        this.currentPlayerChart = null;
        this.modalChart = null;
        this.isModalOpen = false;
        this.selectedTeam = null;
        this.selectedPlayer = null;
        this.modalTriggerElement = null;
        this.radarTimeoutId = null;
        this._keyboardNavSetup = false;

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleEscape = this.handleEscape.bind(this);
        this.handleModalClose = this.handleModalClose.bind(this);
        this.handleModalBackdrop = this.handleModalBackdrop.bind(this);

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

    // ================== HELPERS PARA OBTENER Y FORMATEAR MÉTRICAS ==================
    _getMetricValue(stats, metricKey, aggregation) {
        if (aggregation === 'sum') {
            const totalKey = 'total_' + metricKey;
            return (stats[totalKey] !== undefined && Number.isFinite(stats[totalKey])) ? stats[totalKey] : null;
        } else {
            const avgKey = 'avg' + metricKey.charAt(0).toUpperCase() + metricKey.slice(1);
            return (stats[avgKey] !== undefined && Number.isFinite(stats[avgKey])) ? stats[avgKey] : null;
        }
    }

    _formatMetricValue(value, format) {
        if (value === null || value === undefined || !Number.isFinite(value)) return '—';
        if (format === 'percentage') {
            return value.toFixed(1) + '%';
        } else {
            return this.formatNumber(Math.round(value));
        }
    }
    // ================================================================

    getNumericValue(row, fieldKey) {
        if (!row) return null;
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getNumericCsvValue) {
            return config.helpers.getNumericCsvValue(row, fieldKey);
        }
        return null;
    }

    getTextValue(row, fieldKey) {
        if (!row) return null;
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getCsvValue) {
            return config.helpers.getCsvValue(row, fieldKey);
        }
        const aliases = {
            team: ['EQUIPO', 'Equipo', 'Team'],
            player: ['JUGADOR', 'Jugador', 'Player'],
            winner: ['GANADOR', 'Ganador', 'Winner']
        };
        const candidates = aliases[fieldKey] || [];
        for (const candidate of candidates) {
            if (row[candidate] !== undefined && row[candidate] !== null && String(row[candidate]).trim() !== '') {
                return String(row[candidate]).trim();
            }
        }
        return null;
    }

    async init() {
        await this.loadAllData();
        this.processUniqueData();
        this.setupEventListeners();
        this.setupChartModal();
        this.displayAllTeams();
    }

    async loadAllData() {
        const phases = ['cuartos', 'semifinal', 'final'];
        for (const phase of phases) {
            try {
                await this.loadPhaseData(phase);
            } catch (error) {
                console.warn(`Could not load data for phase: ${phase}`, error);
            }
        }
    }

    async loadPhaseData(phase) {
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getPhaseFilePaths) {
            const files = await loadPhaseCsvFiles(phase);
            for (const file of files) {
                this.data[phase][file.fileName] = file.rows;
            }
            return;
        }

        // Fallback: obtener lista de nombres base según fase
        const baseNames = this.getBaseNamesForPhase(phase);
        const phasePath = `data/${phase}/`;

        for (const base of baseNames) {
            let loaded = false;
            // Generar variantes con prioridad: SF > S, FM > F1M
            const variants = this.getVariantsForBase(base, phase);
            for (const variant of variants) {
                const filePath = `${phasePath}${variant}.csv`;
                try {
                    const csvData = await this.loadCSV(filePath);
                    this.data[phase][variant + '.csv'] = this.parseCSV(csvData);
                    loaded = true;
                    break;
                } catch (error) {
                    // falla, intentar siguiente variante
                }
            }
            if (!loaded) {
                console.warn(`Could not load any variant for ${base}`);
            }
        }
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
            // base es SF..., intentar SF primero y luego S
            const alt = base.replace('SF', 'S');
            return [base, alt];
        } else if (phase === 'final') {
            // base es FM..., intentar FM primero y luego F1M
            const num = base.replace('FM', '');
            const alt = 'F1M' + num;
            return [base, alt];
        } else {
            return [base];
        }
    }

    // Mantener getFileNamesForPhase por compatibilidad (puede ser usado en otro lugar)
    getFileNamesForPhase(phase) {
        const baseNames = this.getBaseNamesForPhase(phase);
        const variants = [];
        for (const base of baseNames) {
            const v = this.getVariantsForBase(base, phase);
            for (const varName of v) {
                variants.push(varName + '.csv');
            }
        }
        return variants;
    }

    async loadCSV(filePath) {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`Failed to fetch CSV: ${filePath}`);
        return await response.text();
    }

    parseCSV(csvText) {
        return parseCSV(csvText);
    }

    formatNumber(n) {
        if (n === null || n === undefined || !isFinite(n)) return '0';
        return Number(n).toLocaleString('en-US');
    }

    processUniqueData() {
        this.allTeams.clear();
        this.allPlayers.clear();

        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(matchData => {
                matchData.forEach(row => {
                    const team = this.getTextValue(row, 'team');
                    const player = this.getTextValue(row, 'player');
                    if (team) this.allTeams.add(team);
                    if (player) this.allPlayers.add(player);
                });
            });
        });

        this.filteredTeams = Array.from(this.allTeams);
        this.filteredPlayers = Array.from(this.allPlayers);
    }

    setupEventListeners() {
        const teamSearch = document.getElementById('team-search');
        if (teamSearch) {
            teamSearch.addEventListener('input', (e) => this.filterTeamsAndPlayers(e.target.value));
            teamSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const firstCard = document.querySelector('.team-card, .player-result-item');
                    if (firstCard) {
                        firstCard.click();
                    }
                }
            });
        }

        const searchClear = document.getElementById('search-clear');
        if (searchClear) {
            searchClear.addEventListener('click', () => {
                const input = document.getElementById('team-search');
                if (input) {
                    input.value = '';
                    input.focus();
                    searchClear.classList.remove('visible');
                    this.filterTeamsAndPlayers('');
                }
            });
        }

        const presentationToggle = document.getElementById('presentation-mode-toggle');
        if (presentationToggle) {
            presentationToggle.addEventListener('click', () => this.togglePresentationMode());
        }

        const navToggle = document.getElementById('nav-toggle');
        if (navToggle) {
            navToggle.addEventListener('click', () => this.toggleNavigation());
        }

        const navMenu = document.getElementById('nav-menu');
        if (navMenu) {
            navMenu.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    if (navMenu.classList.contains('open')) {
                        navMenu.classList.remove('open');
                        if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
                    }
                });
            });
        }

        document.addEventListener('click', (e) => {
            const navContainer = document.querySelector('.nav-container');
            if (navContainer && !navContainer.contains(e.target) && navMenu && navMenu.classList.contains('open')) {
                navMenu.classList.remove('open');
                if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
            }
        });

        const presentationOverlay = document.getElementById('presentation-overlay');
        if (presentationOverlay) {
            presentationOverlay.addEventListener('click', (e) => {
                if (e.target === presentationOverlay) {
                    this.closePresentationMode();
                }
            });
        }

        document.addEventListener('keydown', this.handleEscape);

        const modal = document.getElementById('chart-modal');
        if (modal) {
            modal.addEventListener('click', this.handleModalBackdrop);
        }
    }

    handleEscape(e) {
        if (e.key === 'Escape') {
            if (this.isModalOpen) {
                this.closeChartModal();
            } else {
                const presentationOverlay = document.getElementById('presentation-overlay');
                if (presentationOverlay && presentationOverlay.classList.contains('active')) {
                    this.closePresentationMode();
                }
            }
        }
    }

    handleModalClose() {
        this.closeChartModal();
    }

    handleModalBackdrop(e) {
        if (e.target === e.currentTarget) {
            this.closeChartModal();
        }
    }

    handleKeyDown(e, callback) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            if (callback) callback(e);
        }
    }

    toggleNavigation() {
        const navMenu = document.getElementById('nav-menu');
        const navToggle = document.getElementById('nav-toggle');
        if (navMenu) {
            const isOpen = navMenu.classList.toggle('open');
            if (navToggle) {
                navToggle.setAttribute('aria-expanded', isOpen);
            }
        }
    }

    // --- MODO PRESENTACIÓN ---
    togglePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        const toggleBtn = document.getElementById('presentation-mode-toggle');
        if (!overlay) return;
        const isActive = overlay.classList.toggle('active');
        overlay.setAttribute('aria-hidden', !isActive);
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', isActive);
        }
        if (isActive) {
            document.body.classList.add('presentation-active');
            this.updatePresentationTeams();
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
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
        document.body.classList.remove('presentation-active');
        if (toggleBtn) toggleBtn.focus();
    }

    updatePresentationTeams() {
        const presentationTeams = document.getElementById('presentation-teams');
        if (!presentationTeams) return;

        const enabledMetrics = this.getEnabledMetrics();
        if (enabledMetrics.length === 0) {
            presentationTeams.innerHTML = '<p class="no-data-msg">No hay métricas habilitadas.</p>';
            return;
        }

        presentationTeams.classList.add('presentation-teams');

        const sortedTeams = Array.from(this.allTeams).sort((a, b) => {
            const winsA = this.getTeamWins(a);
            const winsB = this.getTeamWins(b);
            if (winsA !== winsB) return winsB - winsA;
            // Si modo_5v5, ordenar por KDA
            if (this.isMetricEnabled('kills') && this.isMetricEnabled('deaths') && this.isMetricEnabled('assists')) {
                const kdaA = parseFloat(this.calculateTeamKDA(a)) || 0;
                const kdaB = parseFloat(this.calculateTeamKDA(b)) || 0;
                return kdaB - kdaA;
            }
            // Si no, ordenar por primera métrica de suma
            const firstSum = enabledMetrics.find(m => m.aggregation === 'sum');
            if (firstSum) {
                const statsA = this.calculateTeamAccumulatedStats(a);
                const statsB = this.calculateTeamAccumulatedStats(b);
                const valA = this._getMetricValue(statsA, firstSum.key, 'sum') ?? 0;
                const valB = this._getMetricValue(statsB, firstSum.key, 'sum') ?? 0;
                return valB - valA;
            }
            return 0;
        });

        const topTeams = sortedTeams.slice(0, 6);
        if (topTeams.length === 0) {
            presentationTeams.innerHTML = '<p class="no-data-msg">No hay equipos para mostrar.</p>';
            return;
        }

        let html = '<div class="presentation-grid">';
        for (const team of topTeams) {
            const stats = this.calculateTeamAccumulatedStats(team);
            const wins = this.getTeamWins(team);
            let kda = '—';
            if (this.isMetricEnabled('kills') && this.isMetricEnabled('deaths') && this.isMetricEnabled('assists')) {
                kda = this.calculateTeamKDA(team);
            }

            let statsHtml = '';
            enabledMetrics.forEach(metric => {
                const val = this._getMetricValue(stats, metric.key, metric.aggregation);
                const display = this._formatMetricValue(val, metric.format);
                statsHtml += `
                    <div class="pres-team-stat">
                        <span class="pres-stat-label">${metric.label}</span>
                        <span class="pres-stat-value">${display}</span>
                    </div>
                `;
            });

            html += `
                <div class="presentation-card glass">
                    <div class="presentation-team-content">
                        <img src="${this.getTeamLogo(team)}" alt="${escapeHTML(team)}" class="presentation-team-logo" onerror="this.onerror=null; this.src='assets/logos/default_logo.png'">
                        <h3 class="presentation-team-name">${escapeHTML(team)}</h3>
                        <div class="presentation-team-stats-grid">
                            <div class="pres-team-stat">
                                <span class="pres-stat-icon">🏆</span>
                                <span class="pres-stat-value">${this.formatNumber(wins)}</span>
                                <span class="pres-stat-label">Victorias</span>
                            </div>
                            ${kda !== '—' ? `
                            <div class="pres-team-stat">
                                <span class="pres-stat-icon">📊</span>
                                <span class="pres-stat-value">${kda}</span>
                                <span class="pres-stat-label">KDA</span>
                            </div>` : ''}
                            ${statsHtml}
                        </div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        presentationTeams.innerHTML = html;
    }

    setupKeyboardNavigation(containerSelector, itemSelector, onSelect) {
        if (this._keyboardNavSetup) return;
        const container = document.querySelector(containerSelector);
        if (!container) return;
        container.addEventListener('keydown', (e) => {
            const items = container.querySelectorAll(itemSelector);
            const currentIndex = Array.from(items).findIndex(el => el === document.activeElement);
            if (currentIndex === -1) return;
            let newIndex = currentIndex;
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                newIndex = Math.min(currentIndex + 1, items.length - 1);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                newIndex = Math.max(currentIndex - 1, 0);
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (onSelect) onSelect(items[currentIndex]);
                return;
            }
            if (newIndex !== currentIndex && items[newIndex]) {
                items[newIndex].focus();
            }
        });
        this._keyboardNavSetup = true;
    }

    // --- FILTRO Y BÚSQUEDA ---
    filterTeamsAndPlayers(searchTerm) {
        const term = searchTerm ? normalizeText(searchTerm) : '';
        const announcer = document.getElementById('search-announcer');

        if (term === '') {
            this.filteredTeams = Array.from(this.allTeams);
            this.filteredPlayers = Array.from(this.allPlayers);
        } else {
            this.filteredTeams = Array.from(this.allTeams).filter(team =>
                normalizeText(team).includes(term)
            );
            this.filteredPlayers = Array.from(this.allPlayers).filter(player =>
                normalizeText(player).includes(term)
            );
        }

        this.displayFilteredResults();

        if (announcer) {
            const total = this.filteredTeams.length + this.filteredPlayers.length;
            announcer.textContent = `Se encontraron ${total} resultados: ${this.filteredTeams.length} equipos y ${this.filteredPlayers.length} jugadores.`;
        }

        const clearBtn = document.getElementById('search-clear');
        if (clearBtn) {
            if (searchTerm && searchTerm.trim().length > 0) {
                clearBtn.classList.add('visible');
            } else {
                clearBtn.classList.remove('visible');
            }
        }
    }

    // --- RENDERIZADO ---
    displayAllTeams() {
        const teamsGrid = document.getElementById('teams-grid');
        if (!teamsGrid) return;
        teamsGrid.innerHTML = '';
        const searchResults = document.getElementById('search-results');
        if (searchResults) searchResults.classList.remove('visible');

        const sortedTeams = Array.from(this.allTeams).sort((a, b) => a.localeCompare(b));
        for (const team of sortedTeams) {
            const teamCard = this.createTeamCard(team);
            teamsGrid.appendChild(teamCard);
        }

        this.setupKeyboardNavigation('#teams-grid', '.team-card-header', (el) => {
            const teamCard = el.closest('.team-card');
            if (teamCard) {
                const teamName = teamCard.dataset.team;
                if (teamName) this.showTeamDetail(teamName);
            }
        });
    }

    displayFilteredResults() {
        const teamsGrid = document.getElementById('teams-grid');
        const searchResults = document.getElementById('search-results');
        if (!teamsGrid) return;

        teamsGrid.innerHTML = '';
        if (searchResults) {
            searchResults.innerHTML = '';
            searchResults.classList.remove('visible');
        }

        const totalTeams = this.filteredTeams.length;
        const totalPlayers = this.filteredPlayers.length;

        if (totalTeams === 0 && totalPlayers === 0) {
            teamsGrid.innerHTML = '<p class="no-results">No se encontraron equipos o jugadores que coincidan con la búsqueda.</p>';
            return;
        }

        const sortedTeams = this.filteredTeams.sort((a, b) => a.localeCompare(b));
        for (const team of sortedTeams) {
            const teamCard = this.createTeamCard(team);
            teamsGrid.appendChild(teamCard);
        }

        const teamsSet = new Set(sortedTeams);
        const filteredPlayersList = this.filteredPlayers.filter(player => {
            const playerData = this.getPlayerData(player);
            const team = playerData ? this.getTextValue(playerData, 'team') : null;
            return !team || !teamsSet.has(team);
        });

        if (filteredPlayersList.length > 0 && searchResults) {
            searchResults.classList.add('visible');
            const label = document.createElement('div');
            label.className = 'result-label';
            label.textContent = `Jugadores (${filteredPlayersList.length})`;
            searchResults.appendChild(label);

            for (const player of filteredPlayersList.sort((a, b) => a.localeCompare(b))) {
                const item = this.createPlayerResultItem(player);
                searchResults.appendChild(item);
            }
        }
    }

    createPlayerResultItem(playerName) {
        const playerData = this.getPlayerData(playerName);
        const team = playerData ? this.getTextValue(playerData, 'team') || '' : '';
        const item = document.createElement('div');
        item.className = 'player-result-item';
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.dataset.player = playerName;
        const label = `Jugador ${playerName}${team ? ' del equipo ' + team : ''}`;
        item.setAttribute('aria-label', label);

        const avatar = document.createElement('div');
        avatar.className = 'pr-avatar';
        const img = document.createElement('img');
        img.src = this.getPlayerImage(playerName);
        img.alt = '';
        img.onerror = function() {
            this.onerror = null;
            this.style.display = 'none';
            const fallback = this.parentElement.querySelector('span');
            if (fallback) fallback.style.display = 'flex';
        };
        avatar.appendChild(img);
        const fallback = document.createElement('span');
        fallback.textContent = playerName.charAt(0).toUpperCase();
        fallback.style.display = 'none';
        avatar.appendChild(fallback);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'pr-name';
        nameSpan.textContent = playerName;

        const teamSpan = document.createElement('span');
        teamSpan.className = 'pr-team';
        teamSpan.textContent = team;

        item.appendChild(avatar);
        item.appendChild(nameSpan);
        item.appendChild(teamSpan);

        item.addEventListener('click', () => this.showPlayerDetail(playerName));
        item.addEventListener('keydown', (e) => {
            this.handleKeyDown(e, () => this.showPlayerDetail(playerName));
        });

        return item;
    }

    createTeamCard(teamName) {
        const teamPlayers = this.getPlayersByTeam(teamName);
        const teamStats = this.calculateTeamAccumulatedStats(teamName);
        const wins = this.getTeamWins(teamName);
        const kda = this.calculateTeamKDA(teamName);
        const damage = this.formatNumber(Math.round(teamStats.avgDamage || 0));
        const gold = this.formatNumber(Math.round(teamStats.avgGold || 0));
        const matches = teamStats.matches || 0;

        const teamCard = document.createElement('div');
        teamCard.className = 'team-card glass fade-in';
        teamCard.dataset.team = teamName;
        const isSelected = this.selectedTeam === teamName;
        if (isSelected) {
            teamCard.classList.add('selected');
        }

        const logo = this.getTeamLogo(teamName);
        const escapedTeam = escapeHTML(teamName);

        let playersHtml = '';
        if (teamPlayers.length === 0) {
            playersHtml = '<div class="no-players-msg">Sin jugadores</div>';
        } else {
            playersHtml = teamPlayers.map(player => {
                const pStats = this.getPlayerAccumulatedStats(player);
                const isPlayerSelected = this.selectedPlayer === player;
                return `
                    <div class="player-item ${isPlayerSelected ? 'player-active' : ''}" data-player="${escapeHTML(player)}" role="button" tabindex="0" aria-label="Ver detalles de ${escapeHTML(player)}" aria-pressed="${isPlayerSelected ? 'true' : 'false'}">
                        <div class="player-name">${escapeHTML(player)}</div>
                        <div class="player-stats">
                            <div class="player-stat">K: ${this.formatNumber(pStats.kills)}</div>
                            <div class="player-stat">D: ${this.formatNumber(pStats.deaths)}</div>
                            <div class="player-stat">A: ${this.formatNumber(pStats.assists)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Construir estadísticas dinámicas
        const enabledMetrics = this.getEnabledMetrics();
        let statsHtml = '';
        enabledMetrics.forEach(metric => {
            const val = this._getMetricValue(teamStats, metric.key, metric.aggregation);
            const display = this._formatMetricValue(val, metric.format);
            statsHtml += `
                <div class="team-stat">
                    <div class="team-stat-value">${display}</div>
                    <div class="team-stat-label">${metric.label}</div>
                </div>
            `;
        });

        teamCard.innerHTML = `
            <div class="team-card-header" role="button" tabindex="0" aria-label="Ver detalles del equipo ${escapedTeam}" aria-pressed="${isSelected ? 'true' : 'false'}">
                <img src="${logo}" alt="${escapedTeam}" class="team-card-logo" onerror="this.onerror=null; this.src='assets/logos/default_logo.png'">
                <h3 class="team-card-name">${escapedTeam}</h3>
            </div>
            <div class="team-card-stats">
                <div class="team-stat"><div class="team-stat-value">${this.formatNumber(wins)}</div><div class="team-stat-label">Victorias</div></div>
                <div class="team-stat"><div class="team-stat-value">${this.formatNumber(matches)}</div><div class="team-stat-label">Partidos</div></div>
                ${this.isMetricEnabled('kills') ? `<div class="team-stat"><div class="team-stat-value">${kda}</div><div class="team-stat-label">KDA</div></div>` : ''}
                ${this.isMetricEnabled('heroDamageDealt') ? `<div class="team-stat"><div class="team-stat-value">${damage}</div><div class="team-stat-label">Daño/Promedio</div></div>` : ''}
                ${this.isMetricEnabled('gold') ? `<div class="team-stat"><div class="team-stat-value">${gold}</div><div class="team-stat-label">Oro/Promedio</div></div>` : ''}
                ${statsHtml}
            </div>
            <div class="players-list">
                <h4>Jugadores (${this.formatNumber(teamPlayers.length)})</h4>
                ${playersHtml}
            </div>
        `;

        const header = teamCard.querySelector('.team-card-header');
        if (header) {
            header.addEventListener('click', () => this.showTeamDetail(teamName));
            header.addEventListener('keydown', (e) => {
                this.handleKeyDown(e, () => this.showTeamDetail(teamName));
            });
        }

        const playerItems = teamCard.querySelectorAll('.player-item');
        playerItems.forEach(item => {
            const player = item.dataset.player;
            if (!player) return;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showPlayerDetail(player);
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    this.showPlayerDetail(player);
                }
            });
        });

        return teamCard;
    }

    // --- DETALLE DE EQUIPO ---
    showTeamDetail(teamName) {
        const detailView = document.getElementById('player-detail-view');
        if (!detailView) return;

        this.selectedPlayer = null;
        if (this.currentPlayerChart) {
            this.currentPlayerChart.destroy();
            this.currentPlayerChart = null;
        }
        if (this.radarTimeoutId) {
            clearTimeout(this.radarTimeoutId);
            this.radarTimeoutId = null;
        }
        if (this.isModalOpen) {
            this.closeChartModal();
        }
        this.modalTriggerElement = null;

        this.selectedTeam = teamName;

        document.querySelectorAll('.team-card').forEach(card => {
            const isSelected = card.dataset.team === teamName;
            card.classList.toggle('selected', isSelected);
            const header = card.querySelector('.team-card-header');
            if (header) {
                header.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            }
        });

        document.querySelectorAll('.player-item').forEach(item => {
            item.classList.remove('player-active');
            item.setAttribute('aria-pressed', 'false');
        });

        const teamPlayers = this.getPlayersByTeam(teamName);
        const teamStats = this.calculateTeamAccumulatedStats(teamName);
        const wins = this.getTeamWins(teamName);
        const kda = this.calculateTeamKDA(teamName);
        const damage = this.formatNumber(Math.round(teamStats.avgDamage || 0));
        const gold = this.formatNumber(Math.round(teamStats.avgGold || 0));
        const participation = Math.round(teamStats.avgParticipation || 0);
        const matches = teamStats.matches || 0;

        const enabledMetrics = this.getEnabledMetrics();
        let statsGridHtml = '';
        if (enabledMetrics.length === 0) {
            statsGridHtml = '<div class="no-data-msg">No hay métricas habilitadas.</div>';
        } else {
            enabledMetrics.forEach(metric => {
                const val = this._getMetricValue(teamStats, metric.key, metric.aggregation);
                const display = this._formatMetricValue(val, metric.format);
                statsGridHtml += `
                    <div class="detail-stat">
                        <div class="detail-stat-value">${display}</div>
                        <div class="detail-stat-label">${metric.label}</div>
                    </div>
                `;
            });
        }

        let playersHtml = '';
        if (teamPlayers.length === 0) {
            playersHtml = '<p class="no-players-msg">No hay jugadores registrados para este equipo.</p>';
        } else {
            for (const player of teamPlayers) {
                const pStats = this.getPlayerAccumulatedStats(player);
                const playerKda = ((pStats.kills + pStats.assists) / Math.max(pStats.deaths, 1)).toFixed(2);
                const pDamage = this.formatNumber(Math.round(pStats.avgDamage || 0));
                const pGold = this.formatNumber(Math.round(pStats.avgGold || 0));
                const pParticipation = Math.round(pStats.avgParticipation || 0);
                const isSelected = this.selectedPlayer === player;
                playersHtml += `
                    <div class="team-player-row ${isSelected ? 'active' : ''}" data-player="${escapeHTML(player)}" tabindex="0" role="button" aria-label="Ver detalles de ${escapeHTML(player)}">
                        <div class="player-name">${escapeHTML(player)}</div>
                        <div class="player-stats-row">
                            <span>K/D/A: ${this.formatNumber(pStats.kills)}/${this.formatNumber(pStats.deaths)}/${this.formatNumber(pStats.assists)}</span>
                            ${this.isMetricEnabled('kills') ? `<span>KDA: ${playerKda}</span>` : ''}
                            ${this.isMetricEnabled('heroDamageDealt') ? `<span>Daño: ${pDamage}</span>` : ''}
                            ${this.isMetricEnabled('gold') ? `<span>Oro: ${pGold}</span>` : ''}
                            ${this.isMetricEnabled('participation') ? `<span>Part: ${pParticipation}%</span>` : ''}
                        </div>
                    </div>
                `;
            }
        }

        const content = `
            <div class="team-detail glass">
                <div class="team-detail-header">
                    <img src="${this.getTeamLogo(teamName)}" alt="${escapeHTML(teamName)}" class="team-detail-logo" onerror="this.onerror=null; this.src='assets/logos/default_logo.png'">
                    <div>
                        <h2 class="team-detail-name">${escapeHTML(teamName)}</h2>
                        <p>Victorias: ${this.formatNumber(wins)} | Partidos: ${this.formatNumber(matches)}</p>
                    </div>
                </div>
                <div class="team-detail-stats">
                    <div class="detail-stats-grid">
                        ${this.isMetricEnabled('kills') ? `<div class="detail-stat"><div class="detail-stat-value">${this.formatNumber(teamStats.kills)}</div><div class="detail-stat-label">Eliminaciones</div></div>` : ''}
                        ${this.isMetricEnabled('assists') ? `<div class="detail-stat"><div class="detail-stat-value">${this.formatNumber(teamStats.assists)}</div><div class="detail-stat-label">Asistencias</div></div>` : ''}
                        ${this.isMetricEnabled('kills') ? `<div class="detail-stat"><div class="detail-stat-value">${kda}</div><div class="detail-stat-label">KDA</div></div>` : ''}
                        ${this.isMetricEnabled('heroDamageDealt') ? `<div class="detail-stat"><div class="detail-stat-value">${damage}</div><div class="detail-stat-label">Daño Promedio</div></div>` : ''}
                        ${this.isMetricEnabled('gold') ? `<div class="detail-stat"><div class="detail-stat-value">${gold}</div><div class="detail-stat-label">Oro Promedio</div></div>` : ''}
                        ${this.isMetricEnabled('participation') ? `<div class="detail-stat"><div class="detail-stat-value">${participation}%</div><div class="detail-stat-label">Participación</div></div>` : ''}
                        ${statsGridHtml}
                    </div>
                </div>
                <div class="team-players-list">
                    <h3 class="team-players-title">Jugadores del Equipo</h3>
                    <div class="team-players-table">
                        ${playersHtml}
                    </div>
                </div>
            </div>
        `;

        detailView.innerHTML = content;

        detailView.querySelectorAll('.team-player-row').forEach(row => {
            const playerName = row.dataset.player;
            if (playerName) {
                row.addEventListener('click', () => {
                    this.showPlayerDetail(playerName);
                });
                row.addEventListener('keydown', (e) => {
                    this.handleKeyDown(e, () => this.showPlayerDetail(playerName));
                });
            }
        });

        detailView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // --- DETALLE DE JUGADOR ---
    showPlayerDetail(playerName) {
        const detailView = document.getElementById('player-detail-view');
        if (!detailView) return;

        if (this.radarTimeoutId) {
            clearTimeout(this.radarTimeoutId);
            this.radarTimeoutId = null;
        }

        if (this.isModalOpen) {
            this.closeChartModal();
        }

        if (this.currentPlayerChart) {
            this.currentPlayerChart.destroy();
            this.currentPlayerChart = null;
        }
        this.modalTriggerElement = null;

        this.selectedPlayer = playerName;

        const playerData = this.getPlayerData(playerName);
        if (playerData) {
            const team = this.getTextValue(playerData, 'team') || playerData.EQUIPO || null;
            if (team) {
                this.selectedTeam = team;
            }
        }

        document.querySelectorAll('.team-card').forEach(card => {
            const isSelected = card.dataset.team === this.selectedTeam;
            card.classList.toggle('selected', isSelected);
            const header = card.querySelector('.team-card-header');
            if (header) {
                header.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            }
        });

        document.querySelectorAll('.player-item').forEach(item => {
            const isSelected = item.dataset.player === playerName;
            item.classList.toggle('player-active', isSelected);
            item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        });

        document.querySelectorAll('.team-player-row').forEach(row => {
            const isSelected = row.dataset.player === playerName;
            row.classList.toggle('active', isSelected);
        });

        if (!playerData) {
            detailView.innerHTML = `
                <div class="glass placeholder-message">
                    <h3>Jugador no encontrado</h3>
                    <p>No se encontraron datos para ${escapeHTML(playerName)}.</p>
                </div>
            `;
            return;
        }

        const playerStats = this.getPlayerAccumulatedStats(playerName);
        const team = this.getTextValue(playerData, 'team') || playerData.EQUIPO || 'Sin equipo';
        const kda = ((playerStats.kills + playerStats.assists) / Math.max(playerStats.deaths, 1)).toFixed(2);
        const damage = this.formatNumber(Math.round(playerStats.avgDamage || 0));
        const gold = this.formatNumber(Math.round(playerStats.avgGold || 0));
        const participation = Math.round(playerStats.avgParticipation || 0);
        const matches = playerStats.matches || 0;

        const enabledMetrics = this.getEnabledMetrics();
        let statsGridHtml = '';
        if (enabledMetrics.length === 0) {
            statsGridHtml = '<div class="no-data-msg">No hay métricas habilitadas.</div>';
        } else {
            enabledMetrics.forEach(metric => {
                const val = this._getMetricValue(playerStats, metric.key, metric.aggregation);
                const display = this._formatMetricValue(val, metric.format);
                statsGridHtml += `
                    <div class="detail-stat">
                        <div class="detail-stat-value">${display}</div>
                        <div class="detail-stat-label">${metric.label}</div>
                    </div>
                `;
            });
        }

        // Construir la parte de radar solo si hay al menos 3 métricas habilitadas
        const radarMetrics = enabledMetrics.filter(m => m.key !== 'deaths');
        const showRadar = radarMetrics.length >= 3;

        const content = `
            <div class="player-detail glass">
                <div class="player-detail-header">
                    <img src="${this.getPlayerImage(playerName)}" alt="${escapeHTML(playerName)}" class="player-detail-image" onerror="this.onerror=null; this.src='assets/logos/default_logo.png'">
                    <div>
                        <h2 class="player-detail-name">${escapeHTML(playerName)}</h2>
                        <p>Equipo: ${escapeHTML(team)} | Partidos: ${this.formatNumber(matches)}</p>
                    </div>
                </div>
                <div class="player-detail-content" style="display:grid;grid-template-columns:${showRadar ? 'minmax(0,0.85fr) minmax(0,1.15fr)' : '1fr'};gap:1.5rem;align-items:start;margin-top:1.25rem;">
                    <div class="player-detail-stats" style="min-width:0;overflow:hidden;">
                        <div class="detail-stats-grid">
                            ${this.isMetricEnabled('kills') ? `<div class="detail-stat"><div class="detail-stat-value">${this.formatNumber(playerStats.kills)}</div><div class="detail-stat-label">Eliminaciones</div></div>` : ''}
                            ${this.isMetricEnabled('deaths') ? `<div class="detail-stat"><div class="detail-stat-value">${this.formatNumber(playerStats.deaths)}</div><div class="detail-stat-label">Muertes</div></div>` : ''}
                            ${this.isMetricEnabled('assists') ? `<div class="detail-stat"><div class="detail-stat-value">${this.formatNumber(playerStats.assists)}</div><div class="detail-stat-label">Asistencias</div></div>` : ''}
                            ${this.isMetricEnabled('kills') ? `<div class="detail-stat"><div class="detail-stat-value">${kda}</div><div class="detail-stat-label">KDA Ratio</div></div>` : ''}
                            ${this.isMetricEnabled('heroDamageDealt') ? `<div class="detail-stat"><div class="detail-stat-value">${damage}</div><div class="detail-stat-label">Daño Promedio</div></div>` : ''}
                            ${this.isMetricEnabled('gold') ? `<div class="detail-stat"><div class="detail-stat-value">${gold}</div><div class="detail-stat-label">Oro Promedio</div></div>` : ''}
                            ${this.isMetricEnabled('participation') ? `<div class="detail-stat"><div class="detail-stat-value">${participation}%</div><div class="detail-stat-label">Participación</div></div>` : ''}
                            ${statsGridHtml}
                        </div>
                    </div>
                    ${showRadar ? `
                    <div class="chart-container player-radar-container is-chart-expandable" style="min-width:0;overflow:hidden;width:100%;height:400px;position:relative;margin:0;padding:0.25rem;">
                        <div class="chart-title" style="display:none;">Estadísticas Radar</div>
                        <div class="chart-wrap" id="chart-wrap" style="width:100%;height:100%;min-height:0;">
                            <canvas id="player-radar-chart" style="width:100% !important;height:100% !important;min-height:0;max-height:none;"></canvas>
                            <div class="chart-empty-state" hidden>No hay datos suficientes para la gráfica</div>
                        </div>
                        <div class="chart-expand-hint" style="position:absolute;bottom:8px;right:12px;font-size:0.7rem;color:rgba(255,255,255,0.3);display:flex;align-items:center;gap:4px;pointer-events:none;">📊 Haz clic para ampliar</div>
                    </div>` : `
                    <div class="no-radar-msg" style="display:flex;align-items:center;justify-content:center;height:100%;min-height:200px;color:rgba(255,255,255,0.6);font-size:0.9rem;text-align:center;padding:1rem;">
                        No hay suficientes métricas habilitadas para generar la gráfica radar.
                    </div>`}
                </div>
            </div>
        `;

        detailView.innerHTML = content;
        this.setupChartExpand();

        if (showRadar) {
            this.radarTimeoutId = setTimeout(() => {
                if (this.selectedPlayer === playerName) {
                    this.updatePlayerRadarChart(playerName);
                }
                this.radarTimeoutId = null;
            }, 100);
        } else {
            if (this.currentPlayerChart) {
                this.currentPlayerChart.destroy();
                this.currentPlayerChart = null;
            }
        }

        detailView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // --- CONFIGURAR EXPANSIÓN DE GRÁFICA ---
    setupChartExpand() {
        const chartWrap = document.getElementById('chart-wrap');
        if (!chartWrap) return;
        const expandHandler = (e) => {
            e.stopPropagation();
            const canvas = document.getElementById('player-radar-chart');
            if (canvas && this.currentPlayerChart && typeof Chart !== 'undefined') {
                this.modalTriggerElement = chartWrap;
                this.openChartModal(canvas, this.selectedPlayer || 'Jugador');
            }
        };

        chartWrap.addEventListener('click', expandHandler);
        chartWrap.addEventListener('keydown', (e) => {
            this.handleKeyDown(e, expandHandler);
        });
        chartWrap.setAttribute('tabindex', '0');
        chartWrap.setAttribute('role', 'button');
        chartWrap.setAttribute('aria-label', 'Ampliar gráfica');

        const hint = document.querySelector('.chart-expand-hint');
        if (hint) {
            hint.addEventListener('click', expandHandler);
        }
    }

    // --- MODAL DE GRÁFICA ---
    setupChartModal() {
        const modal = document.getElementById('chart-modal');
        if (modal) {
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    openChartModal(sourceCanvas, title) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js no disponible');
            return;
        }
        const modal = document.getElementById('chart-modal');
        const titleEl = document.getElementById('chart-modal-title');
        const modalCanvas = document.getElementById('chart-modal-canvas');
        if (!modal || !modalCanvas || !sourceCanvas) return;

        if (this.modalChart) {
            this.modalChart.destroy();
            this.modalChart = null;
        }

        const chart = this.currentPlayerChart;
        if (!chart) return;

        if (titleEl) {
            titleEl.textContent = title ? `Estadísticas de ${title}` : 'Estadísticas del Jugador';
        }

        const currentPlayer = this.selectedPlayer;

        const config = chart.config;
        const targetModalData = config.data.datasets[0].data.slice();
        const initialModalData = targetModalData.map(() => 0);

        const data = {
            labels: config.data.labels.slice(),
            datasets: [{
                label: config.data.datasets[0].label,
                data: initialModalData,
                backgroundColor: config.data.datasets[0].backgroundColor,
                borderColor: config.data.datasets[0].borderColor,
                borderWidth: config.data.datasets[0].borderWidth || 2,
                pointBackgroundColor: config.data.datasets[0].pointBackgroundColor,
                pointBorderColor: config.data.datasets[0].pointBorderColor,
                pointHoverBackgroundColor: config.data.datasets[0].pointHoverBackgroundColor,
                pointHoverBorderColor: config.data.datasets[0].pointHoverBorderColor,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20,
                        color: 'rgba(255,255,255,0.8)',
                        backdropColor: 'transparent',
                        font: { size: 13, family: 'Poppins' }
                    },
                    grid: { color: 'rgba(255,255,255,0.15)' },
                    angleLines: { color: 'rgba(255,255,255,0.15)' },
                    pointLabels: {
                        color: 'white',
                        font: { size: 14, weight: 'bold', family: 'Poppins' }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'white',
                        font: { size: 14, weight: 'bold', family: 'Poppins' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#E372F2',
                    borderWidth: 1,
                    titleFont: { size: 14, family: 'Poppins' },
                    bodyFont: { size: 13, family: 'Poppins' },
                    callbacks: {
                        label: function(ctx) {
                            const stat = ctx.label;
                            const value = ctx.parsed.r.toFixed(1);
                            let realValue = '';
                            const idx = config.data.labels.indexOf(stat);
                            if (idx !== -1) {
                                const statMap = {
                                    'Eliminaciones': 'kills',
                                    'Daño': 'damage',
                                    'Oro': 'gold',
                                    'Participación': 'participation',
                                    'Control de Masas': 'crowdControl',
                                    'Daño a Torres': 'towerDamage',
                                    'Daño Recibido': 'heroDamageTaken',
                                    '% Oro': 'goldPercentage',
                                    'Presencia en Peleas': 'teamFightPresence'
                                };
                                const key = statMap[stat];
                                if (key) {
                                    const playerStats = this.getPlayerAccumulatedStats(currentPlayer);
                                    if (playerStats) {
                                        const val = this._getMetricValue(playerStats, key, 'average'); // for these metrics, average is used
                                        if (val !== null && Number.isFinite(val)) {
                                            if (key === 'participation' || key === 'goldPercentage' || key === 'teamFightPresence') {
                                                realValue = val.toFixed(1) + '%';
                                            } else {
                                                realValue = this.formatNumber(Math.round(val));
                                            }
                                        }
                                    }
                                }
                            }
                            return `${stat}: ${value}% ${realValue ? '('+realValue+')' : ''}`;
                        }.bind(this)
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        };

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        this.isModalOpen = true;
        document.body.classList.add('modal-open');

        requestAnimationFrame(() => {
            if (!modal.classList.contains('active') || !this.currentPlayerChart || this.selectedPlayer !== currentPlayer) {
                return;
            }
            const ctx = modalCanvas.getContext('2d');
            this.modalChart = new Chart(ctx, {
                type: 'radar',
                data: data,
                options: options
            });

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this.modalChart && this.selectedPlayer === currentPlayer) {
                        this.modalChart.data.datasets[0].data = targetModalData;
                        this.modalChart.update();
                    }
                });
            });
        });

        modal.focus();
    }

    closeChartModal() {
        const modal = document.getElementById('chart-modal');
        if (!modal) return;

        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        this.isModalOpen = false;

        document.body.classList.remove('modal-open');

        if (this.modalChart) {
            this.modalChart.destroy();
            this.modalChart = null;
        }

        const trigger = this.modalTriggerElement;
        this.modalTriggerElement = null;

        if (trigger && trigger.isConnected) {
            trigger.focus();
        } else {
            const wrap = document.getElementById('chart-wrap');
            if (wrap) wrap.focus();
        }
    }

    // --- GRÁFICA RADIAL ---
    updatePlayerRadarChart(playerName) {
        const canvas = document.getElementById('player-radar-chart');
        const emptyState = document.querySelector('.chart-empty-state');
        if (!canvas) return;

        if (typeof Chart === 'undefined') {
            canvas.hidden = true;
            if (emptyState) {
                emptyState.hidden = false;
                emptyState.textContent = 'Chart.js no está disponible.';
            }
            return;
        }

        if (this.currentPlayerChart) {
            this.currentPlayerChart.destroy();
            this.currentPlayerChart = null;
        }

        const playerStats = this.getPlayerAccumulatedStats(playerName);
        if (!playerStats || playerStats.matches === 0) {
            canvas.hidden = true;
            if (emptyState) {
                emptyState.hidden = false;
                emptyState.textContent = 'No hay datos suficientes para la gráfica.';
            }
            return;
        }

        const enabledMetrics = this.getEnabledMetrics();
        // Filtramos métricas para radar: excluimos 'deaths' porque es inversa, pero podemos incluirla invertida
        const radarMetrics = enabledMetrics.filter(m => m.key !== 'deaths');
        if (radarMetrics.length < 3) {
            canvas.hidden = true;
            if (emptyState) {
                emptyState.hidden = false;
                emptyState.textContent = 'No hay suficientes métricas habilitadas para la gráfica radar (mínimo 3).';
            }
            return;
        }

        canvas.hidden = false;
        if (emptyState) emptyState.hidden = true;

        const maxValues = this.calculateMaxAverages();

        const normalize = (value, max) => {
            if (!max || max === 0 || !isFinite(value)) return 0;
            return Math.min(Math.max((value / max) * 100, 0), 100);
        };

        const labels = [];
        const targetData = [];
        const statMap = {
            'kills': { label: 'Eliminaciones', key: 'avgKills', max: 'maxKills' },
            'heroDamageDealt': { label: 'Daño', key: 'avgDamage', max: 'maxDamage' },
            'gold': { label: 'Oro', key: 'avgGold', max: 'maxGold' },
            'participation': { label: 'Participación', key: 'avgParticipation', max: 'maxParticipation' },
            'crowdControl': { label: 'Control de Masas', key: 'avgCrowdControl', max: 'maxCrowdControl' },
            'towerDamage': { label: 'Daño a Torres', key: 'avgTowerDamage', max: 'maxTowerDamage' },
            'heroDamageTaken': { label: 'Daño Recibido', key: 'avgHeroDamageTaken', max: 'maxHeroDamageTaken' },
            'goldPercentage': { label: '% Oro', key: 'avgGoldPercentage', max: 'maxGoldPercentage' },
            'teamFightPresence': { label: 'Presencia en Peleas', key: 'avgTeamFightPresence', max: 'maxTeamFightPresence' }
        };

        radarMetrics.forEach(metric => {
            const map = statMap[metric.key];
            if (!map) return;
            const avgKey = map.key;
            const maxKey = map.max;
            let val = playerStats[avgKey] || 0;
            if (metric.key === 'deaths') {
                val = 100 - normalize(val, maxValues[maxKey] || 1);
                labels.push('Supervivencia (invertida)');
                targetData.push(val);
            } else {
                labels.push(map.label);
                targetData.push(normalize(val, maxValues[maxKey] || 1));
            }
        });

        if (targetData.length < 3) {
            canvas.hidden = true;
            if (emptyState) {
                emptyState.hidden = false;
                emptyState.textContent = 'No hay suficientes métricas para la gráfica radar (mínimo 3).';
            }
            return;
        }

        const cleanTargetData = targetData.map(v => (isFinite(v) && !isNaN(v)) ? v : 0);
        const initialData = cleanTargetData.map(() => 0);

        const ctx = canvas.getContext('2d');
        this.currentPlayerChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: playerName,
                    data: initialData,
                    backgroundColor: 'rgba(227, 114, 242, 0.2)',
                    borderColor: 'rgba(227, 114, 242, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(227, 114, 242, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(227, 114, 242, 1)',
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            color: 'rgba(255,255,255,0.7)',
                            backdropColor: 'transparent',
                            font: { size: 11, family: 'Poppins' }
                        },
                        grid: { color: 'rgba(255,255,255,0.12)' },
                        angleLines: { color: 'rgba(255,255,255,0.12)' },
                        pointLabels: {
                            color: 'white',
                            font: { size: 12, weight: 'bold', family: 'Poppins' }
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'white',
                            font: { size: 11, weight: 'bold', family: 'Poppins' }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#E372F2',
                        borderWidth: 1,
                        titleFont: { size: 12, family: 'Poppins' },
                        bodyFont: { size: 11, family: 'Poppins' },
                        callbacks: {
                            label: (ctx) => {
                                const stat = ctx.label;
                                const value = ctx.parsed.r.toFixed(1);
                                let realValue = '';
                                const metric = enabledMetrics.find(m => {
                                    const map = statMap[m.key];
                                    return map && map.label === stat;
                                });
                                if (metric) {
                                    const map = statMap[metric.key];
                                    const avgKey = map.key;
                                    const val = playerStats[avgKey] || 0;
                                    if (metric.key === 'deaths') {
                                        realValue = `${val} muertes (invertido)`;
                                    } else {
                                        if (metric.format === 'percentage') realValue = val.toFixed(1) + '%';
                                        else realValue = this.formatNumber(Math.round(val));
                                    }
                                }
                                return `${stat}: ${value}% ${realValue ? '('+realValue+')' : ''}`;
                            }
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (this.currentPlayerChart && this.selectedPlayer === playerName) {
                    this.currentPlayerChart.data.datasets[0].data = cleanTargetData;
                    this.currentPlayerChart.update();
                }
            });
        });
    }

    // Calcular máximos de promedios por jugador
    calculateMaxAverages() {
        let maxKills = 0, maxDamage = 0, maxGold = 0, maxCrowdControl = 0, maxTowerDamage = 0;
        let maxHeroDamageTaken = 0, maxGoldPercentage = 0, maxTeamFightPresence = 0, maxParticipation = 0;
        const allPlayers = Array.from(this.allPlayers);
        for (const player of allPlayers) {
            const stats = this.getPlayerAccumulatedStats(player);
            if (stats && stats.matches > 0) {
                if (stats.avgKills > maxKills) maxKills = stats.avgKills;
                if (stats.avgDamage > maxDamage) maxDamage = stats.avgDamage;
                if (stats.avgGold > maxGold) maxGold = stats.avgGold;
                if (stats.avgCrowdControl > maxCrowdControl) maxCrowdControl = stats.avgCrowdControl;
                if (stats.avgTowerDamage > maxTowerDamage) maxTowerDamage = stats.avgTowerDamage;
                if (stats.avgHeroDamageTaken > maxHeroDamageTaken) maxHeroDamageTaken = stats.avgHeroDamageTaken;
                if (stats.avgGoldPercentage > maxGoldPercentage) maxGoldPercentage = stats.avgGoldPercentage;
                if (stats.avgTeamFightPresence > maxTeamFightPresence) maxTeamFightPresence = stats.avgTeamFightPresence;
                if (stats.avgParticipation > maxParticipation) maxParticipation = stats.avgParticipation;
            }
        }
        return {
            maxKills: maxKills || 1,
            maxDamage: maxDamage || 1,
            maxGold: maxGold || 1,
            maxCrowdControl: maxCrowdControl || 1,
            maxTowerDamage: maxTowerDamage || 1,
            maxHeroDamageTaken: maxHeroDamageTaken || 1,
            maxGoldPercentage: maxGoldPercentage || 1,
            maxTeamFightPresence: maxTeamFightPresence || 1,
            maxParticipation: maxParticipation || 1
        };
    }

    // --- MÉTODOS AUXILIARES ---
    getTeamData(teamName) {
        for (const phase of Object.values(this.data)) {
            for (const match of Object.values(phase)) {
                for (const row of match) {
                    if (this.getTextValue(row, 'team') === teamName) return row;
                }
            }
        }
        return null;
    }

    getPlayerData(playerName) {
        for (const phase of Object.values(this.data)) {
            for (const match of Object.values(phase)) {
                for (const row of match) {
                    if (this.getTextValue(row, 'player') === playerName) return row;
                }
            }
        }
        return null;
    }

    getPlayersByTeam(teamName) {
        const players = new Set();
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                match.forEach(row => {
                    if (this.getTextValue(row, 'team') === teamName) {
                        const player = this.getTextValue(row, 'player');
                        if (player) players.add(player);
                    }
                });
            });
        });
        return Array.from(players);
    }

    getTeamLogo(teamName) {
        const cleanName = teamName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `assets/logos/${cleanName}.png`;
    }

    getPlayerImage(playerName) {
        const cleanName = playerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `assets/players/${cleanName}.png`;
    }

    getTeamWins(teamName) {
        let wins = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                const matchWinner = this.determineMatchWinner(match);
                if (matchWinner === teamName) wins++;
            });
        });
        return wins;
    }

    determineMatchWinner(matchData) {
        if (!Array.isArray(matchData) || matchData.length === 0) return null;
        const winners = [];
        for (const row of matchData) {
            const winner = this.getTextValue(row, 'winner');
            if (winner) winners.push(winner);
        }
        if (winners.length === 0) return null;
        const winnerCount = {};
        winners.forEach(w => winnerCount[w] = (winnerCount[w] || 0) + 1);
        let maxCount = 0;
        let matchWinner = null;
        let tie = false;
        for (const [team, count] of Object.entries(winnerCount)) {
            if (count > maxCount) {
                maxCount = count;
                matchWinner = team;
                tie = false;
            } else if (count === maxCount) {
                tie = true;
            }
        }
        return tie ? null : matchWinner;
    }

    // ================== CÁLCULOS CON TODAS LAS MÉTRICAS ==================
    calculateTeamAccumulatedStats(teamName) {
        let matches = 0, kills = 0, deaths = 0, assists = 0, totalHeroDamageDealt = 0, totalGold = 0, totalParticipation = 0;
        let totalHeroDamageTaken = 0, totalGoldPercentage = 0, totalTeamFightPresence = 0, totalCrowdControl = 0, totalTowerDamage = 0;
        let hasHeroDamageTaken = false, hasGoldPercentage = false, hasTeamFightPresence = false, hasCrowdControl = false, hasTowerDamage = false;

        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                let teamInMatch = false;
                let matchKills = 0, matchDeaths = 0, matchAssists = 0, matchDamage = 0, matchGold = 0, matchParticipation = 0;
                let matchHeroDamageTaken = 0, matchGoldPercentage = 0, matchTeamFightPresence = 0, matchCrowdControl = 0, matchTowerDamage = 0;
                let playerCount = 0;
                match.forEach(row => {
                    if (this.getTextValue(row, 'team') === teamName) {
                        const k = this.getNumericValue(row, 'kills');
                        if (k !== null) matchKills += k;
                        const d = this.getNumericValue(row, 'deaths');
                        if (d !== null) matchDeaths += d;
                        const a = this.getNumericValue(row, 'assists');
                        if (a !== null) matchAssists += a;
                        const dmg = this.getNumericValue(row, 'heroDamageDealt');
                        if (dmg !== null) matchDamage += dmg;
                        const g = this.getNumericValue(row, 'gold');
                        if (g !== null) matchGold += g;
                        const part = this.getNumericValue(row, 'participation');
                        if (part !== null) matchParticipation += part;
                        const hdt = this.getNumericValue(row, 'heroDamageTaken');
                        if (hdt !== null) { matchHeroDamageTaken += hdt; hasHeroDamageTaken = true; }
                        const gp = this.getNumericValue(row, 'goldPercentage');
                        if (gp !== null) { matchGoldPercentage += gp; hasGoldPercentage = true; }
                        const tfp = this.getNumericValue(row, 'teamFightPresence');
                        if (tfp !== null) { matchTeamFightPresence += tfp; hasTeamFightPresence = true; }
                        const cc = this.getNumericValue(row, 'crowdControl');
                        if (cc !== null) { matchCrowdControl += cc; hasCrowdControl = true; }
                        const td = this.getNumericValue(row, 'towerDamage');
                        if (td !== null) { matchTowerDamage += td; hasTowerDamage = true; }
                        teamInMatch = true;
                        playerCount++;
                    }
                });
                if (teamInMatch && playerCount > 0) {
                    matches++;
                    kills += matchKills;
                    deaths += matchDeaths;
                    assists += matchAssists;
                    totalHeroDamageDealt += matchDamage;
                    totalGold += matchGold;
                    totalParticipation += matchParticipation / playerCount;
                    totalHeroDamageTaken += matchHeroDamageTaken;
                    totalGoldPercentage += matchGoldPercentage;
                    totalTeamFightPresence += matchTeamFightPresence;
                    totalCrowdControl += matchCrowdControl;
                    totalTowerDamage += matchTowerDamage;
                }
            });
        });

        if (matches === 0) {
            return {
                matches: 0, kills: 0, deaths: 0, assists: 0,
                avgKills: 0, avgDamage: 0, avgGold: 0, avgParticipation: 0,
                avgHeroDamageTaken: 0, avgGoldPercentage: 0, avgTeamFightPresence: 0,
                avgCrowdControl: 0, avgTowerDamage: 0,
                totalHeroDamageDealt: 0, totalHeroDamageTaken: 0, totalGoldPercentage: 0,
                totalTeamFightPresence: 0, totalCrowdControl: 0, totalTowerDamage: 0,
                hasHeroDamageTaken: false, hasGoldPercentage: false,
                hasTeamFightPresence: false, hasCrowdControl: false, hasTowerDamage: false
            };
        }
        return {
            matches, kills, deaths, assists,
            avgKills: kills / matches,
            avgDamage: totalHeroDamageDealt / matches,
            avgGold: totalGold / matches,
            avgParticipation: totalParticipation / matches,
            avgHeroDamageTaken: totalHeroDamageTaken / matches,
            avgGoldPercentage: totalGoldPercentage / matches,
            avgTeamFightPresence: totalTeamFightPresence / matches,
            avgCrowdControl: totalCrowdControl / matches,
            avgTowerDamage: totalTowerDamage / matches,
            // Totales (suma)
            total_kills: kills,
            total_deaths: deaths,
            total_assists: assists,
            total_gold: totalGold,
            total_heroDamageDealt: totalHeroDamageDealt,
            total_heroDamageTaken: totalHeroDamageTaken,
            total_goldPercentage: totalGoldPercentage,
            total_teamFightPresence: totalTeamFightPresence,
            total_crowdControl: totalCrowdControl,
            total_towerDamage: totalTowerDamage,
            total_participation: totalParticipation,
            hasHeroDamageTaken, hasGoldPercentage, hasTeamFightPresence,
            hasCrowdControl, hasTowerDamage
        };
    }

    getPlayerAccumulatedStats(playerName) {
        let matches = 0, kills = 0, deaths = 0, assists = 0, totalHeroDamageDealt = 0, totalGold = 0, totalParticipation = 0;
        let totalHeroDamageTaken = 0, totalGoldPercentage = 0, totalTeamFightPresence = 0, totalCrowdControl = 0, totalTowerDamage = 0;
        let hasHeroDamageTaken = false, hasGoldPercentage = false, hasTeamFightPresence = false, hasCrowdControl = false, hasTowerDamage = false;

        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                let playerInMatch = false;
                match.forEach(row => {
                    if (this.getTextValue(row, 'player') === playerName) {
                        const k = this.getNumericValue(row, 'kills');
                        if (k !== null) kills += k;
                        const d = this.getNumericValue(row, 'deaths');
                        if (d !== null) deaths += d;
                        const a = this.getNumericValue(row, 'assists');
                        if (a !== null) assists += a;
                        const dmg = this.getNumericValue(row, 'heroDamageDealt');
                        if (dmg !== null) totalHeroDamageDealt += dmg;
                        const g = this.getNumericValue(row, 'gold');
                        if (g !== null) totalGold += g;
                        const part = this.getNumericValue(row, 'participation');
                        if (part !== null) totalParticipation += part;
                        const hdt = this.getNumericValue(row, 'heroDamageTaken');
                        if (hdt !== null) { totalHeroDamageTaken += hdt; hasHeroDamageTaken = true; }
                        const gp = this.getNumericValue(row, 'goldPercentage');
                        if (gp !== null) { totalGoldPercentage += gp; hasGoldPercentage = true; }
                        const tfp = this.getNumericValue(row, 'teamFightPresence');
                        if (tfp !== null) { totalTeamFightPresence += tfp; hasTeamFightPresence = true; }
                        const cc = this.getNumericValue(row, 'crowdControl');
                        if (cc !== null) { totalCrowdControl += cc; hasCrowdControl = true; }
                        const td = this.getNumericValue(row, 'towerDamage');
                        if (td !== null) { totalTowerDamage += td; hasTowerDamage = true; }
                        playerInMatch = true;
                    }
                });
                if (playerInMatch) matches++;
            });
        });

        if (matches === 0) {
            return {
                matches: 0, kills: 0, deaths: 0, assists: 0,
                avgKills: 0, avgDamage: 0, avgGold: 0, avgParticipation: 0,
                avgHeroDamageTaken: 0, avgGoldPercentage: 0, avgTeamFightPresence: 0,
                avgCrowdControl: 0, avgTowerDamage: 0,
                totalHeroDamageDealt: 0, totalHeroDamageTaken: 0, totalGoldPercentage: 0,
                totalTeamFightPresence: 0, totalCrowdControl: 0, totalTowerDamage: 0,
                hasHeroDamageTaken: false, hasGoldPercentage: false,
                hasTeamFightPresence: false, hasCrowdControl: false, hasTowerDamage: false
            };
        }
        return {
            matches, kills, deaths, assists,
            avgKills: kills / matches,
            avgDamage: totalHeroDamageDealt / matches,
            avgGold: totalGold / matches,
            avgParticipation: totalParticipation / matches,
            avgHeroDamageTaken: totalHeroDamageTaken / matches,
            avgGoldPercentage: totalGoldPercentage / matches,
            avgTeamFightPresence: totalTeamFightPresence / matches,
            avgCrowdControl: totalCrowdControl / matches,
            avgTowerDamage: totalTowerDamage / matches,
            // Totales (suma)
            total_kills: kills,
            total_deaths: deaths,
            total_assists: assists,
            total_gold: totalGold,
            total_heroDamageDealt: totalHeroDamageDealt,
            total_heroDamageTaken: totalHeroDamageTaken,
            total_goldPercentage: totalGoldPercentage,
            total_teamFightPresence: totalTeamFightPresence,
            total_crowdControl: totalCrowdControl,
            total_towerDamage: totalTowerDamage,
            total_participation: totalParticipation,
            hasHeroDamageTaken, hasGoldPercentage, hasTeamFightPresence,
            hasCrowdControl, hasTowerDamage
        };
    }

    calculateTeamKDA(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        if (stats.matches === 0) return '0.00';
        return ((stats.kills + stats.assists) / Math.max(stats.deaths, 1)).toFixed(2);
    }

    calculateTeamDamage(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        if (stats.matches === 0) return '0';
        return this.formatNumber(Math.round(stats.avgDamage));
    }

    calculateTeamGold(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        if (stats.matches === 0) return '0';
        return this.formatNumber(Math.round(stats.avgGold));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.teamsPage = new TeamsPage();
});

window.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG') {
        const src = e.target.src || '';
        if (src.includes('default_logo.png')) return;
        if (src.includes('assets/logos/') || src.includes('assets/players/')) {
            e.target.onerror = null;
            e.target.src = 'assets/logos/default_logo.png';
        }
    }
}, true);