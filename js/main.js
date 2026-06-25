// Global CSV parser (shared for reuse)
function parseCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];
    const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];
    const parseRow = (row) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (inQuotes) {
                if (char === '"' && row[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    current += char;
                }
            } else {
                if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
        }
        result.push(current.trim());
        return result;
    };

    const headers = parseRow(lines[0]).map(h => h.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseRow(lines[i]);
        const entry = {};
        headers.forEach((header, index) => {
            entry[header] = values[index] !== undefined ? values[index] : '';
        });
        data.push(entry);
    }
    return data;
}

function resolvePhaseId(phaseId) {
    const alias = {
        cuartos: 'cuartos',
        day1_qualifiers: 'cuartos',
        semifinal: 'semifinal',
        final: 'final'
    };
    return alias[phaseId] || phaseId || 'cuartos';
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

            loadedFiles.push({
                phase: resolvedPhaseId,
                path: path,
                fileName: path.split('/').pop(),
                rows: rows
            });
        } catch (error) {
            console.warn('[CSV] Error cargando archivo:', path, error);
        }
    }

    return loadedFiles;
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalize(value, maximum) {
    if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(100, (value / maximum) * 100));
}

// Natural sort for bracket names (e.g., Q1M1, Q1M2, Q1M10, SF1M1, F1M1, FM1)
function naturalSortBrackets(brackets) {
    return brackets.slice().sort((a, b) => {
        const parseParts = (name) => {
            const match = name.match(/^([A-Z]+)(\d+)(?:M(\d+))?/i);
            if (!match) return { prefix: name, num1: 0, num2: 0 };
            return {
                prefix: match[1].toUpperCase(),
                num1: parseInt(match[2], 10) || 0,
                num2: match[3] ? parseInt(match[3], 10) : 0
            };
        };
        const partsA = parseParts(a);
        const partsB = parseParts(b);
        if (partsA.prefix !== partsB.prefix) {
            const order = { 'Q': 1, 'SF': 2, 'S': 3, 'F': 4, 'FM': 5 };
            const oA = order[partsA.prefix] || 99;
            const oB = order[partsB.prefix] || 99;
            if (oA !== oB) return oA - oB;
            return partsA.prefix.localeCompare(partsB.prefix);
        }
        if (partsA.num1 !== partsB.num1) return partsA.num1 - partsB.num1;
        return partsA.num2 - partsB.num2;
    });
}

// ============================================================
// GLOBAL TEAM LOGO FALLBACK (used by onerror attributes)
// ============================================================
window.handleTeamLogoError = function(img, teamName) {
    if (window.dashboard && typeof window.dashboard.applyTeamLogoFallback === 'function') {
        window.dashboard.applyTeamLogoFallback(img, teamName);
    } else {
        // Fallback seguro si la instancia no está lista
        img.src = 'assets/logos/default_logo.png';
        img.onerror = null;
    }
};

class HonorOfKingsDashboard {
    constructor() {
        this.data = {
            cuartos: {},
            semifinal: {},
            final: {}
        };
        this.currentPhase = 'cuartos';
        this.currentBracket = 'all';
        this.currentFilters = {
            team: 'all',
            player: 'all'
        };
        this.charts = {};
        this.featuredPlayersByPhase = {};
        this.bestTeam = null;
        this.uniqueTeams = new Set();
        this.uniquePlayers = new Set();
        this.orderedTeams = []; // Stable sorted list for colors
        this.modalChartInstance = null;
        this.focusOrigins = {
            chart: null,
            presentation: null,
            detail: null,
            filters: null
        };
        this.chartListenersAttached = false;
        this.pendingModalCreation = null;
        // Focus trap
        this.focusTrapContainer = null;
        this.focusTrapElements = [];
        this.focusTrapIndex = 0;
        this.focusTrapHandlerBound = this.focusTrapHandler.bind(this);

        this.init();
    }

    // ============================================================
    //  METRIC HELPERS (new)
    // ============================================================
    getEnabledMetrics() {
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getEnabledStatMetrics) {
            return config.helpers.getEnabledStatMetrics();
        }
        return [];
    }

    isMetricEnabled(metricKey) {
        return this.getEnabledMetrics().some(m => m.key === metricKey);
    }

    getMetricStatValue(stats, metric) {
        if (!stats || !metric) return 0;

        const propertyMap = {
            kills: 'total_kills',
            deaths: 'total_deaths',
            assists: 'total_assists',
            gold: 'total_gold',
            towerDamage: 'total_towerDamage',
            heroDamageDealt: 'total_heroDamageDealt',
            heroDamageTaken: 'total_heroDamageTaken',
            participation: 'avg_participation',
            crowdControl: 'avg_crowdControl',
            goldPercentage: 'avg_goldPercentage',
            teamFightPresence: 'avg_teamFightPresence'
        };

        const property = propertyMap[metric.key];
        const value = property ? Number(stats[property]) : 0;

        return Number.isFinite(value) ? value : 0;
    }

    // ============================================================
    //  CHART.JS AVAILABILITY
    // ============================================================
    isChartJsAvailable() {
        return typeof Chart !== 'undefined' && typeof Chart.getChart === 'function';
    }

    getNumericValue(row, fieldKey) {
        if (!row || typeof row !== 'object') return null;
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getNumericCsvValue) {
            return config.helpers.getNumericCsvValue(row, fieldKey);
        }
        const aliases = {
            kills: ['Eliminaciones', 'eliminaciones', 'Kills'],
            deaths: ['Muertes', 'muertes', 'Deaths'],
            assists: ['Asistencias', 'Asistencia', 'asistencia', 'Assists'],
            gold: ['Oro', 'oro', 'Oro total', 'Gold'],
            heroDamageDealt: ['Daño infligido a héroes', 'DÑO infligido', 'Daño infligido', 'Dano infligido', 'Damage Dealt'],
            heroDamageTaken: ['Daño recibido de héroes', 'DÑO recibido', 'Daño recibido', 'Dano recibido', 'Damage Taken'],
            goldPercentage: ['Porcentaje de oro', '% de oro', 'Gold Percentage'],
            teamFightPresence: ['Presencia en peleas en equipo', 'Team Fight Presence'],
            participation: ['Participación', 'Participacion', 'Participation'],
            crowdControl: ['Control de masas', 'Control de Masas', 'Crowd Control'],
            towerDamage: ['DÑO a las torres', 'Daño a las torres', 'Dano a las torres', 'Tower Damage']
        };
        const candidates = aliases[fieldKey] || [];
        for (const candidate of candidates) {
            if (row[candidate] !== undefined && row[candidate] !== null && String(row[candidate]).trim() !== '') {
                const num = Number(String(row[candidate]).replace(/,/g, '').replace('%', '').trim());
                if (!isNaN(num)) return num;
            }
        }
        return null;
    }

    getTextValue(row, fieldKey) {
        if (!row || typeof row !== 'object') return null;
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

    init() {
        this.setupEventListeners();
        this.setupChartModal();
        this.setupKeyboardNavigation();
        this.loadAllData()
            .then(() => {
                this.processUniqueData();
                this.determineBestTeam();
                this.determineFeaturedPlayersByPhase();
                this.updateBracket();
                this.updateFiltersForScope();
                this.updateContent();
                this.updateCharts();
                this.updateCurrentPhaseDisplay();
                this.attachChartCardListeners();
            })
            .catch(error => {
                console.error('Error loading data:', error);
                this.showError('Error al cargar los datos del torneo');
            });
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
        try {
            const files = await loadPhaseCsvFiles(phase);
            for (const file of files) {
                this.data[phase][file.fileName] = file.rows;
            }
        } catch (error) {
            console.warn(`Could not load phase: ${phase}`, error);
        }
    }

    formatNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number.toLocaleString('en-US') : '0';
    }

    getPhaseDisplayName(phase) {
        const phaseNames = {
            cuartos: 'Clasificatorias Día 1',
            semifinal: 'Semifinales',
            final: 'Final'
        };
        return phaseNames[phase] || phase;
    }

    // ------------------------ TEAM COLOR HELPERS ------------------------
    getOrderedTeams() {
        if (this.orderedTeams.length === 0) {
            this.orderedTeams = Array.from(this.uniqueTeams).sort((a, b) => a.localeCompare(b));
        }
        return this.orderedTeams;
    }

    getTeamColor(teamName, alpha = 1) {
        const config = window.TOURNAMENT_CONFIG;
        let palette = [];
        if (config && config.ui && Array.isArray(config.ui.teamColors)) {
            palette = config.ui.teamColors;
        }
        if (palette.length === 0) {
            palette = [
                '#E63946', '#3A86FF', '#2EC4B6', '#FFBE0B',
                '#8338EC', '#FB5607', '#06D6A0', '#FF70A6'
            ];
        }

        const ordered = this.getOrderedTeams();
        let index = ordered.indexOf(teamName);
        if (index === -1) {
            let hash = 0;
            for (let i = 0; i < teamName.length; i++) {
                hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
            }
            index = Math.abs(hash) % palette.length;
        }
        const color = palette[index % palette.length];
        if (alpha === 1) return color;
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    // ----------------------------------------------------------------

    processUniqueData() {
        this.uniqueTeams.clear();
        this.uniquePlayers.clear();

        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(matchData => {
                matchData.forEach(row => {
                    const team = this.getTextValue(row, 'team');
                    const player = this.getTextValue(row, 'player');
                    if (team) this.uniqueTeams.add(team);
                    if (player) this.uniquePlayers.add(player);
                });
            });
        });
        this.orderedTeams = Array.from(this.uniqueTeams).sort((a, b) => a.localeCompare(b));
    }

    updateCurrentPhaseDisplay() {
        const phaseDisplay = document.getElementById('current-phase-display');
        if (phaseDisplay) {
            phaseDisplay.textContent = this.getPhaseDisplayName(this.currentPhase);
        }
    }

    updateBodyScrollLock() {
        const locked =
            document.querySelector('.chart-modal.active') ||
            document.querySelector('.presentation-overlay.active') ||
            document.querySelector('.detail-panel.active') ||
            document.querySelector('.filters-panel.active');
        document.body.classList.toggle('modal-open', Boolean(locked));
        document.body.style.overflow = locked ? 'hidden' : '';
    }

    // ============================================================
    // SCOPE HELPERS
    // ============================================================
    getRowsInCurrentScope() {
        const phaseData = this.data[this.currentPhase] || {};
        if (this.currentBracket && this.currentBracket !== 'all' && phaseData[this.currentBracket]) {
            return phaseData[this.currentBracket] || [];
        }
        return Object.values(phaseData).flat();
    }

    getTeamsInCurrentScope() {
        const teams = new Set();
        this.getRowsInCurrentScope().forEach(row => {
            const team = this.getTextValue(row, 'team');
            if (team) teams.add(team);
        });
        return Array.from(teams);
    }

    getPlayersInCurrentScope() {
        const players = new Set();
        this.getRowsInCurrentScope().forEach(row => {
            const player = this.getTextValue(row, 'player');
            if (player) players.add(player);
        });
        return Array.from(players);
    }

    getPlayerTeamInCurrentScope(playerName) {
        const row = this.getRowsInCurrentScope().find(item => {
            return this.getTextValue(item, 'player') === playerName;
        });
        return row ? this.getTextValue(row, 'team') : null;
    }

    // ============================================================
    // GLOBAL STATS (for best team, etc.)
    // ============================================================
    getGlobalTeamStats(teamName) {
        let matches = 0, kills = 0, deaths = 0, assists = 0, totalDamage = 0, totalParticipation = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                let teamInMatch = false;
                let teamRows = 0;
                let matchParticipation = 0;
                match.forEach(row => {
                    if (this.getTextValue(row, 'team') !== teamName) return;
                    teamInMatch = true;
                    teamRows++;
                    kills += this.getNumericValue(row, 'kills') || 0;
                    deaths += this.getNumericValue(row, 'deaths') || 0;
                    assists += this.getNumericValue(row, 'assists') || 0;
                    totalDamage += this.getNumericValue(row, 'heroDamageDealt') || 0;
                    matchParticipation += this.getNumericValue(row, 'participation') || 0;
                });
                if (teamInMatch) {
                    matches++;
                    totalParticipation += teamRows > 0 ? matchParticipation / teamRows : 0;
                }
            });
        });
        return {
            matches,
            kills,
            deaths,
            assists,
            avgKills: matches > 0 ? kills / matches : 0,
            avgDamage: matches > 0 ? totalDamage / matches : 0,
            avgParticipation: matches > 0 ? totalParticipation / matches : 0
        };
    }

    getGlobalTeamWins(teamName) {
        let wins = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                if (this.determineMatchWinner(match) === teamName) wins++;
            });
        });
        return wins;
    }

    // ============================================================
    // SCOPE-AWARE STATS (accumulate all metrics)
    // ============================================================
    calculateTeamAccumulatedStats(teamName) {
        const phaseData = this.data[this.currentPhase] || {};
        const matchKeys = this.currentBracket && this.currentBracket !== 'all' 
            ? [this.currentBracket] 
            : Object.keys(phaseData);

        let matches = 0, kills = 0, deaths = 0, assists = 0, totalDamage = 0, totalGold = 0, totalParticipation = 0;
        let totalHeroDamageTaken = 0, totalGoldPercentage = 0, totalTeamFightPresence = 0, totalCrowdControl = 0, totalTowerDamage = 0;
        let hasHeroDamageTaken = false, hasGoldPercentage = false, hasTeamFightPresence = false, hasCrowdControl = false, hasTowerDamage = false;

        for (const key of matchKeys) {
            const match = phaseData[key] || [];
            let teamPlayerRows = 0;
            let matchKills = 0, matchDamage = 0, matchGold = 0, matchParticipation = 0;
            let matchHeroDamageTaken = 0, matchGoldPercentage = 0, matchTeamFightPresence = 0, matchCrowdControl = 0, matchTowerDamage = 0;
            for (const row of match) {
                const team = this.getTextValue(row, 'team');
                if (team === teamName) {
                    teamPlayerRows++;
                    const killsVal = this.getNumericValue(row, 'kills');
                    if (killsVal !== null) matchKills += killsVal;
                    const deathsVal = this.getNumericValue(row, 'deaths');
                    if (deathsVal !== null) deaths += deathsVal;
                    const assistsVal = this.getNumericValue(row, 'assists');
                    if (assistsVal !== null) assists += assistsVal;
                    const damageVal = this.getNumericValue(row, 'heroDamageDealt');
                    if (damageVal !== null) matchDamage += damageVal;
                    const goldVal = this.getNumericValue(row, 'gold');
                    if (goldVal !== null) matchGold += goldVal;
                    const partVal = this.getNumericValue(row, 'participation');
                    if (partVal !== null) matchParticipation += partVal;
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
                }
            }
            if (teamPlayerRows > 0) {
                matches++;
                kills += matchKills;
                totalDamage += matchDamage;
                totalGold += matchGold;
                totalParticipation += teamPlayerRows > 0 ? matchParticipation / teamPlayerRows : 0;
                totalHeroDamageTaken += teamPlayerRows > 0 ? matchHeroDamageTaken / teamPlayerRows : 0;
                totalGoldPercentage += teamPlayerRows > 0 ? matchGoldPercentage / teamPlayerRows : 0;
                totalTeamFightPresence += teamPlayerRows > 0 ? matchTeamFightPresence / teamPlayerRows : 0;
                totalCrowdControl += teamPlayerRows > 0 ? matchCrowdControl / teamPlayerRows : 0;
                totalTowerDamage += teamPlayerRows > 0 ? matchTowerDamage / teamPlayerRows : 0;
            }
        }

        if (matches === 0) {
            return {
                matches: 0, kills: 0, deaths: 0, assists: 0, avgKills: 0, avgDamage: 0, avgGold: 0, avgParticipation: 0,
                avgHeroDamageTaken: 0, avgGoldPercentage: 0, avgTeamFightPresence: 0, avgCrowdControl: 0, avgTowerDamage: 0,
                hasHeroDamageTaken: false, hasGoldPercentage: false, hasTeamFightPresence: false, hasCrowdControl: false, hasTowerDamage: false,
                // For compatibility with getMetricStatValue:
                total_kills: 0,
                total_deaths: 0,
                total_assists: 0,
                total_gold: 0,
                total_towerDamage: 0,
                total_heroDamageDealt: 0,
                total_heroDamageTaken: 0,
                avg_participation: 0,
                avg_crowdControl: 0,
                avg_goldPercentage: 0,
                avg_teamFightPresence: 0
            };
        }
        return {
            matches: matches, kills: kills, deaths: deaths, assists: assists,
            avgKills: kills / matches, avgDamage: totalDamage / matches, avgGold: totalGold / matches, avgParticipation: totalParticipation / matches,
            avgHeroDamageTaken: totalHeroDamageTaken / matches, avgGoldPercentage: totalGoldPercentage / matches,
            avgTeamFightPresence: totalTeamFightPresence / matches, avgCrowdControl: totalCrowdControl / matches, avgTowerDamage: totalTowerDamage / matches,
            hasHeroDamageTaken: hasHeroDamageTaken, hasGoldPercentage: hasGoldPercentage, hasTeamFightPresence: hasTeamFightPresence,
            hasCrowdControl: hasCrowdControl, hasTowerDamage: hasTowerDamage,
            // For compatibility with getMetricStatValue:
            total_kills: kills,
            total_deaths: deaths,
            total_assists: assists,
            total_gold: totalGold,
            total_towerDamage: totalTowerDamage,
            total_heroDamageDealt: totalDamage,
            total_heroDamageTaken: totalHeroDamageTaken,
            avg_participation: totalParticipation / matches,
            avg_crowdControl: totalCrowdControl / matches,
            avg_goldPercentage: totalGoldPercentage / matches,
            avg_teamFightPresence: totalTeamFightPresence / matches
        };
    }

    getPlayerAccumulatedStats(playerName) {
        const phaseData = this.data[this.currentPhase] || {};
        const matchKeys = this.currentBracket && this.currentBracket !== 'all' 
            ? [this.currentBracket] 
            : Object.keys(phaseData);

        let matches = 0, kills = 0, deaths = 0, assists = 0, totalDamage = 0, totalGold = 0, totalParticipation = 0;
        let totalHeroDamageTaken = 0, totalGoldPercentage = 0, totalTeamFightPresence = 0, totalCrowdControl = 0, totalTowerDamage = 0;
        let hasHeroDamageTaken = false, hasGoldPercentage = false, hasTeamFightPresence = false, hasCrowdControl = false, hasTowerDamage = false;

        for (const key of matchKeys) {
            const match = phaseData[key] || [];
            let playerInMatch = false;
            for (const row of match) {
                const player = this.getTextValue(row, 'player');
                if (player === playerName) {
                    const killsVal = this.getNumericValue(row, 'kills');
                    if (killsVal !== null) kills += killsVal;
                    const deathsVal = this.getNumericValue(row, 'deaths');
                    if (deathsVal !== null) deaths += deathsVal;
                    const assistsVal = this.getNumericValue(row, 'assists');
                    if (assistsVal !== null) assists += assistsVal;
                    const damageVal = this.getNumericValue(row, 'heroDamageDealt');
                    if (damageVal !== null) totalDamage += damageVal;
                    const goldVal = this.getNumericValue(row, 'gold');
                    if (goldVal !== null) totalGold += goldVal;
                    const partVal = this.getNumericValue(row, 'participation');
                    if (partVal !== null) totalParticipation += partVal;
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
            }
            if (playerInMatch) matches++;
        }

        if (matches === 0) {
            return {
                matches: 0, kills: 0, deaths: 0, assists: 0, avgKills: 0, avgDamage: 0, avgGold: 0, avgParticipation: 0,
                avgHeroDamageTaken: 0, avgGoldPercentage: 0, avgTeamFightPresence: 0, avgCrowdControl: 0, avgTowerDamage: 0,
                hasHeroDamageTaken: false, hasGoldPercentage: false, hasTeamFightPresence: false, hasCrowdControl: false, hasTowerDamage: false,
                total_kills: 0,
                total_deaths: 0,
                total_assists: 0,
                total_gold: 0,
                total_towerDamage: 0,
                total_heroDamageDealt: 0,
                total_heroDamageTaken: 0,
                avg_participation: 0,
                avg_crowdControl: 0,
                avg_goldPercentage: 0,
                avg_teamFightPresence: 0
            };
        }
        return {
            matches: matches, kills: kills, deaths: deaths, assists: assists,
            avgKills: kills / matches, avgDamage: totalDamage / matches, avgGold: totalGold / matches, avgParticipation: totalParticipation / matches,
            avgHeroDamageTaken: totalHeroDamageTaken / matches, avgGoldPercentage: totalGoldPercentage / matches,
            avgTeamFightPresence: totalTeamFightPresence / matches, avgCrowdControl: totalCrowdControl / matches, avgTowerDamage: totalTowerDamage / matches,
            hasHeroDamageTaken: hasHeroDamageTaken, hasGoldPercentage: hasGoldPercentage, hasTeamFightPresence: hasTeamFightPresence,
            hasCrowdControl: hasCrowdControl, hasTowerDamage: hasTowerDamage,
            total_kills: kills,
            total_deaths: deaths,
            total_assists: assists,
            total_gold: totalGold,
            total_towerDamage: totalTowerDamage,
            total_heroDamageDealt: totalDamage,
            total_heroDamageTaken: totalHeroDamageTaken,
            avg_participation: totalParticipation / matches,
            avg_crowdControl: totalCrowdControl / matches,
            avg_goldPercentage: totalGoldPercentage / matches,
            avg_teamFightPresence: totalTeamFightPresence / matches
        };
    }

    getPlayersByTeamInCurrentScope(teamName) {
        const players = new Set();
        const rows = this.getRowsInCurrentScope();
        rows.forEach(row => {
            const team = this.getTextValue(row, 'team');
            const player = this.getTextValue(row, 'player');
            if (team === teamName && player) {
                players.add(player);
            }
        });
        return Array.from(players);
    }

    // ============================================================
    // FILTERS & SCOPE UPDATE
    // ============================================================
    updateFiltersForScope() {
        this.populateTeamFilter();
        this.populatePlayerFilter();

        const teamSelect = document.getElementById('team-select');
        const playerSelect = document.getElementById('player-select');

        const validTeams = this.getTeamsInCurrentScope();
        if (this.currentFilters.team !== 'all' && !validTeams.includes(this.currentFilters.team)) {
            this.currentFilters.team = 'all';
        }
        if (teamSelect) teamSelect.value = this.currentFilters.team;

        this.updatePlayerFilter();

        const validPlayers = this.getPlayersInCurrentScope();
        if (this.currentFilters.player !== 'all' && !validPlayers.includes(this.currentFilters.player)) {
            this.currentFilters.player = 'all';
        }
        if (playerSelect) playerSelect.value = this.currentFilters.player;
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    setupEventListeners() {
        const phaseSelect = document.getElementById('phase-select');
        if (phaseSelect) {
            phaseSelect.addEventListener('change', (e) => {
                this.currentPhase = e.target.value;
                this.currentBracket = 'all';
                this.currentFilters = { team: 'all', player: 'all' };
                this.updateBracket();
                this.updateFiltersForScope();
                this.updateContent();
                this.updateCharts();
                this.updateCurrentPhaseDisplay();
            });
        }

        const bracketSelect = document.getElementById('bracket-select');
        if (bracketSelect) {
            bracketSelect.addEventListener('change', (e) => {
                this.currentBracket = e.target.value;
                this.updateFiltersForScope();
                this.updateContent();
                this.updateCharts();
                this.highlightActiveBracket();
            });
        }

        const teamSelect = document.getElementById('team-select');
        if (teamSelect) {
            teamSelect.addEventListener('change', (e) => {
                this.currentFilters.team = e.target.value;
                this.updatePlayerFilter();
            });
        }

        const playerSelect = document.getElementById('player-select');
        if (playerSelect) {
            playerSelect.addEventListener('change', (e) => {
                this.currentFilters.player = e.target.value;
            });
        }

        const applyFilters = document.getElementById('apply-filters');
        if (applyFilters) {
            applyFilters.addEventListener('click', () => {
                this.updateContent();
                this.updateCharts();
                this.closeFilters();
            });
        }

        const resetFilters = document.getElementById('reset-filters');
        if (resetFilters) {
            resetFilters.addEventListener('click', () => {
                this.resetFilters();
            });
        }

        const toggleFilters = document.getElementById('toggle-filters');
        if (toggleFilters) {
            toggleFilters.addEventListener('click', () => {
                this.toggleFilters();
            });
        }

        const closeFilters = document.getElementById('close-filters');
        if (closeFilters) {
            closeFilters.addEventListener('click', () => {
                this.closeFilters();
            });
        }

        const toggleSidebar = document.getElementById('toggle-sidebar');
        if (toggleSidebar) {
            toggleSidebar.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        const presentationToggle = document.getElementById('presentation-mode-toggle');
        if (presentationToggle) {
            presentationToggle.addEventListener('click', () => {
                this.togglePresentationMode();
            });
        }

        const presentationOverlay = document.getElementById('presentation-overlay');
        if (presentationOverlay) {
            presentationOverlay.addEventListener('click', (e) => {
                if (e.target === presentationOverlay) {
                    this.togglePresentationMode();
                }
            });
        }

        const presentationCloseBtn = document.getElementById('presentation-close-btn');
        if (presentationCloseBtn) {
            presentationCloseBtn.addEventListener('click', () => {
                this.togglePresentationMode();
            });
        }

        const navToggle = document.getElementById('nav-toggle');
        if (navToggle) {
            navToggle.addEventListener('click', () => {
                this.toggleNavigation();
            });
        }

        const closeDetail = document.getElementById('close-detail');
        if (closeDetail) {
            closeDetail.addEventListener('click', () => {
                this.closeDetailPanel();
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;

            const chartModal = document.getElementById('chart-modal');
            const presentationOverlay = document.getElementById('presentation-overlay');
            const detailPanel = document.getElementById('detail-panel');
            const filtersPanel = document.getElementById('filters-panel');

            if (chartModal?.classList.contains('active')) {
                this.closeChartModal();
            } else if (presentationOverlay?.classList.contains('active')) {
                this.togglePresentationMode();
            } else if (detailPanel?.classList.contains('active')) {
                this.closeDetailPanel();
            } else if (filtersPanel?.classList.contains('active')) {
                this.closeFilters();
            }
        });

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (this.modalChartInstance) {
                    this.modalChartInstance.resize();
                }
            }, 200);
        });
    }

    setupKeyboardNavigation() {
        if (!this.isChartJsAvailable()) return;
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const target = event.target.closest('.is-chart-expandable');
            if (!target) return;
            event.preventDefault();
            const canvas = target.querySelector('canvas');
            if (canvas) {
                const chart = Chart.getChart(canvas);
                if (chart) {
                    const title = target.dataset.chartTitle || 'Gráfica';
                    this.openChartModal(chart, title);
                }
            }
        });
    }

    toggleNavigation() {
        const navMenu = document.querySelector('.nav-menu');
        const navToggle = document.getElementById('nav-toggle');
        if (navMenu) {
            const isOpen = navMenu.classList.toggle('active');
            if (navToggle) {
                navToggle.setAttribute('aria-expanded', isOpen);
            }
        }
    }

    toggleFilters() {
        const filtersPanel = document.getElementById('filters-panel');
        const toggleBtn = document.getElementById('toggle-filters');
        if (filtersPanel) {
            const isOpen = filtersPanel.classList.toggle('active');
            if (toggleBtn) {
                toggleBtn.textContent = isOpen ? 'Ocultar Filtros' : 'Mostrar Filtros';
                toggleBtn.setAttribute('aria-expanded', isOpen);
            }
            filtersPanel.setAttribute('aria-hidden', !isOpen);
            if (isOpen) {
                this.focusOrigins.filters = document.activeElement;
                this.trapFocus(filtersPanel);
            } else {
                this.releaseFocusTrap();
                const origin = this.focusOrigins.filters;
                this.focusOrigins.filters = null;
                const hasUnderlying = this.restoreUnderlyingFocusTrap();
                if (!hasUnderlying && origin && origin.isConnected && origin.offsetParent !== null) {
                    origin.focus();
                }
            }
            this.updateBodyScrollLock();
        }
    }

    closeFilters() {
        const filtersPanel = document.getElementById('filters-panel');
        const toggleBtn = document.getElementById('toggle-filters');
        if (filtersPanel) {
            this.releaseFocusTrap();
            filtersPanel.classList.remove('active');
            filtersPanel.setAttribute('aria-hidden', 'true');
            if (toggleBtn) {
                toggleBtn.textContent = 'Mostrar Filtros';
                toggleBtn.setAttribute('aria-expanded', 'false');
            }
            this.updateBodyScrollLock();
            const origin = this.focusOrigins.filters;
            this.focusOrigins.filters = null;
            const hasUnderlying = this.restoreUnderlyingFocusTrap();
            if (!hasUnderlying && origin && origin.isConnected && origin.offsetParent !== null) {
                origin.focus();
            }
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('toggle-sidebar');
        if (sidebar && toggleBtn) {
            const isHidden = sidebar.classList.toggle('sidebar-hidden');
            toggleBtn.textContent = isHidden ? 'Mostrar Bracket' : 'Ocultar Bracket';
            toggleBtn.setAttribute('aria-expanded', !isHidden);
            sidebar.setAttribute('aria-hidden', isHidden);
            sidebar.hidden = isHidden;
        }
    }

    togglePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        if (overlay) {
            const isActive = overlay.classList.toggle('active');
            overlay.setAttribute('aria-hidden', !isActive);
            document.body.classList.toggle('presentation-active', isActive);
            if (isActive) {
                this.focusOrigins.presentation = document.activeElement;
                this.updatePresentationStats();
                const closeBtn = document.getElementById('presentation-close-btn');
                if (closeBtn) setTimeout(() => closeBtn.focus(), 100);
                this.trapFocus(overlay);
            } else {
                this.releaseFocusTrap();
                const origin = this.focusOrigins.presentation;
                this.focusOrigins.presentation = null;
                const hasUnderlying = this.restoreUnderlyingFocusTrap();
                if (!hasUnderlying && origin && origin.isConnected && origin.offsetParent !== null) {
                    origin.focus();
                }
            }
            this.updateBodyScrollLock();
        }
    }

    showDetailPanel(content, title = 'Detalles') {
        const detailTitle = document.getElementById('detail-title');
        const detailContent = document.getElementById('detail-content');
        const detailPanel = document.getElementById('detail-panel');
        if (detailTitle) detailTitle.textContent = title;
        if (detailContent) detailContent.innerHTML = content;
        if (detailPanel) {
            detailPanel.classList.add('active');
            detailPanel.setAttribute('aria-hidden', 'false');
            this.focusOrigins.detail = document.activeElement;
            const closeBtn = document.getElementById('close-detail');
            if (closeBtn) setTimeout(() => closeBtn.focus(), 100);
            this.trapFocus(detailPanel);
            this.updateBodyScrollLock();
        }
    }

    closeDetailPanel() {
        if (this.charts.playerRadar) {
            this.charts.playerRadar.destroy();
            this.charts.playerRadar = null;
        }
        const detailPanel = document.getElementById('detail-panel');
        if (detailPanel) {
            this.releaseFocusTrap();
            detailPanel.classList.remove('active');
            detailPanel.setAttribute('aria-hidden', 'true');
            this.updateBodyScrollLock();
            const origin = this.focusOrigins.detail;
            this.focusOrigins.detail = null;
            const hasUnderlying = this.restoreUnderlyingFocusTrap();
            if (!hasUnderlying && origin && origin.isConnected && origin.offsetParent !== null) {
                origin.focus();
            }
        }
    }

    // Focus trap management
    trapFocus(container) {
        if (!container) return;
        this.releaseFocusTrap();

        const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) {
            this.focusTrapContainer = container;
            this.focusTrapElements = focusable;
            this.focusTrapIndex = 0;
            container.addEventListener('keydown', this.focusTrapHandlerBound);
            if (!container.contains(document.activeElement)) {
                focusable[0].focus();
            }
        }
    }

    releaseFocusTrap() {
        if (this.focusTrapContainer) {
            this.focusTrapContainer.removeEventListener('keydown', this.focusTrapHandlerBound);
            this.focusTrapContainer = null;
            this.focusTrapElements = [];
            this.focusTrapIndex = 0;
        }
    }

    focusTrapHandler(e) {
        if (e.key !== 'Tab') return;
        const focusable = this.focusTrapElements;
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    restoreUnderlyingFocusTrap() {
        const layers = [
            { id: 'chart-modal', activeClass: 'active' },
            { id: 'presentation-overlay', activeClass: 'active' },
            { id: 'detail-panel', activeClass: 'active' },
            { id: 'filters-panel', activeClass: 'active' }
        ];
        for (const layer of layers) {
            const el = document.getElementById(layer.id);
            if (el && el.classList.contains(layer.activeClass)) {
                this.trapFocus(el);
                return true;
            }
        }
        return false;
    }

    // ============================================================
    // POPULATE FILTERS
    // ============================================================
    populateFilters() {
        this.populateBracketFilter();
        this.populateTeamFilter();
        this.populatePlayerFilter();
    }

    resetFilterSelections() {
        const teamSelect = document.getElementById('team-select');
        if (teamSelect) teamSelect.value = 'all';
        const playerSelect = document.getElementById('player-select');
        if (playerSelect) playerSelect.value = 'all';
        this.currentFilters = { team: 'all', player: 'all' };
        this.updatePlayerFilter();
    }

    populateBracketFilter() {
        const bracketSelect = document.getElementById('bracket-select');
        if (!bracketSelect) return;

        bracketSelect.innerHTML = '<option value="all">Todas las partidas</option>';
        const brackets = Object.keys(this.data[this.currentPhase] || {});
        const sorted = naturalSortBrackets(brackets);

        sorted.forEach(bracket => {
            const option = document.createElement('option');
            option.value = bracket;
            option.textContent = this.formatBracketName(bracket);
            bracketSelect.appendChild(option);
        });

        const validValues = new Set(['all', ...sorted]);
        if (!validValues.has(this.currentBracket)) {
            this.currentBracket = 'all';
        }
        bracketSelect.value = this.currentBracket;
    }

    populateTeamFilter() {
        const teamSelect = document.getElementById('team-select');
        if (!teamSelect) return;
        teamSelect.innerHTML = '<option value="all">Todos los equipos</option>';
        const teams = this.getTeamsInCurrentScope();
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            teamSelect.appendChild(option);
        });
        if (teamSelect.value !== this.currentFilters.team) {
            if (!teams.includes(this.currentFilters.team) && this.currentFilters.team !== 'all') {
                this.currentFilters.team = 'all';
            }
            teamSelect.value = this.currentFilters.team;
        }
    }

    populatePlayerFilter() {
        const playerSelect = document.getElementById('player-select');
        if (!playerSelect) return;
        playerSelect.innerHTML = '<option value="all">Todos los jugadores</option>';
        const players = this.getPlayersInCurrentScope();
        players.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            option.textContent = player;
            playerSelect.appendChild(option);
        });
        if (playerSelect.value !== this.currentFilters.player) {
            if (!players.includes(this.currentFilters.player) && this.currentFilters.player !== 'all') {
                this.currentFilters.player = 'all';
            }
            playerSelect.value = this.currentFilters.player;
        }
    }

    updatePlayerFilter() {
        const playerSelect = document.getElementById('player-select');
        if (!playerSelect) return;
        playerSelect.innerHTML = '<option value="all">Todos los jugadores</option>';
        let players = [];
        if (this.currentFilters.team === 'all') {
            players = this.getPlayersInCurrentScope();
        } else {
            players = this.getPlayersByTeamInCurrentScope(this.currentFilters.team);
        }
        players.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            option.textContent = player;
            playerSelect.appendChild(option);
        });
        if (!players.includes(this.currentFilters.player) && this.currentFilters.player !== 'all') {
            this.currentFilters.player = 'all';
        }
        playerSelect.value = this.currentFilters.player;
    }

    resetFilters() {
        this.currentFilters = { team: 'all', player: 'all' };
        const teamSelect = document.getElementById('team-select');
        if (teamSelect) teamSelect.value = 'all';
        const playerSelect = document.getElementById('player-select');
        if (playerSelect) playerSelect.value = 'all';
        this.updatePlayerFilter();
        this.updateContent();
        this.updateCharts();
    }

    // ============================================================
    // BRACKET
    // ============================================================
    groupBrackets() {
        const brackets = Object.keys(this.data[this.currentPhase]);
        const groups = {};
        brackets.forEach(bracket => {
            let groupKey;
            if (/^Q\d+M\d+/.test(bracket)) {
                const match = bracket.match(/^Q(\d+)/);
                groupKey = `Q${match[1]}`;
            } else if (/^SF\d+M\d+/.test(bracket) || /^S\d+M\d+/.test(bracket)) {
                const match = bracket.match(/^(?:SF|S)(\d+)/);
                groupKey = `SF${match[1]}`;
            } else if (/^F\d+M\d+/.test(bracket) || /^FM\d+/.test(bracket)) {
                groupKey = 'F';
            } else {
                groupKey = bracket;
            }
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(bracket);
        });
        const order = { 'Q': 1, 'SF': 2, 'S': 3, 'F': 4, 'FM': 5 };
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const prefixA = a.match(/^[A-Z]+/)?.[0] || '';
            const prefixB = b.match(/^[A-Z]+/)?.[0] || '';
            const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
            const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
            const orderA = order[prefixA] || 99;
            const orderB = order[prefixB] || 99;
            if (orderA !== orderB) return orderA - orderB;
            if (numA !== numB) return numA - numB;
            return a.localeCompare(b);
        });
        const result = {};
        sortedKeys.forEach(key => {
            result[key] = naturalSortBrackets(groups[key]);
        });
        return result;
    }

    updateBracket() {
        const bracketContainer = document.getElementById('bracket');
        if (!bracketContainer) return;
        bracketContainer.innerHTML = '';
        const groups = this.groupBrackets();
        if (Object.keys(groups).length === 0) {
            bracketContainer.innerHTML = '<p>No hay datos disponibles para esta fase.</p>';
            return;
        }
        Object.entries(groups).forEach(([groupKey, brackets]) => {
            const groupElement = this.createBracketContainerForGroup(groupKey, brackets);
            bracketContainer.appendChild(groupElement);
        });
        this.populateBracketFilter();
        this.highlightActiveBracket();
    }

    createBracketContainerForGroup(groupKey, brackets) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'bracket-group glass';
        const groupHeader = document.createElement('div');
        groupHeader.className = 'bracket-group-header';
        groupHeader.tabIndex = 0;
        groupHeader.setAttribute('role', 'button');
        groupHeader.setAttribute('aria-expanded', 'false');
        groupHeader.setAttribute('aria-label', `Expandir grupo ${this.formatGroupName(groupKey)}`);
        const groupTitle = document.createElement('h3');
        groupTitle.className = 'bracket-group-title';
        groupTitle.textContent = this.formatGroupName(groupKey);
        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.textContent = '+';
        groupHeader.appendChild(groupTitle);
        groupHeader.appendChild(expandIcon);
        const matchesContainer = document.createElement('div');
        matchesContainer.className = 'bracket-matches-container';
        matchesContainer.style.display = 'none';
        brackets.forEach(bracket => {
            const matchElement = this.createMatchElement(bracket);
            matchesContainer.appendChild(matchElement);
        });
        groupHeader.addEventListener('click', () => {
            const isExpanded = matchesContainer.style.display === 'block';
            matchesContainer.style.display = isExpanded ? 'none' : 'block';
            expandIcon.textContent = isExpanded ? '+' : '−';
            groupDiv.classList.toggle('expanded', !isExpanded);
            groupHeader.setAttribute('aria-expanded', !isExpanded);
        });
        groupHeader.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                groupHeader.click();
            }
        });
        groupDiv.appendChild(groupHeader);
        groupDiv.appendChild(matchesContainer);
        return groupDiv;
    }

    createMatchElement(bracketName) {
        const bracketData = this.data[this.currentPhase][bracketName] || [];
        const matchDiv = document.createElement('div');
        matchDiv.className = 'bracket-match-item';
        matchDiv.tabIndex = 0;
        matchDiv.setAttribute('role', 'button');
        matchDiv.setAttribute('aria-label', `Ver partida ${this.formatBracketName(bracketName)}`);
        if (this.currentBracket === bracketName) {
            matchDiv.classList.add('active');
        }
        matchDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.currentBracket = bracketName;
            const bracketSelect = document.getElementById('bracket-select');
            if (bracketSelect) bracketSelect.value = bracketName;
            this.updateFiltersForScope();
            this.updateContent();
            this.updateCharts();
            this.highlightActiveBracket();
        });
        matchDiv.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                matchDiv.click();
            }
        });
        const winner = this.determineMatchWinner(bracketData);
        const teams = [...new Set(bracketData.map(row => this.getTextValue(row, 'team')).filter(Boolean))];
        let matchInfo = '';
        if (teams.length >= 1) {
            matchInfo = `
                <div class="match-teams">
                    ${teams.map(team => `
                        <div class="team ${team === winner ? 'winner' : ''}">
                            <img src="${this.getTeamLogo(team)}" alt="${escapeHTML(team)}" class="team-logo" 
                                 data-logo-managed="team" data-logo-retry-index="1"
                                 onerror="window.handleTeamLogoError(this, '${escapeHTML(team)}')">
                            <span class="team-name">${escapeHTML(team)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="match-info">
                    ${escapeHTML(this.formatBracketName(bracketName))}
                </div>
            `;
        } else {
            matchInfo = `
                <div class="match-info">
                    ${escapeHTML(this.formatBracketName(bracketName))}
                </div>
            `;
        }
        matchDiv.innerHTML = matchInfo;
        return matchDiv;
    }

    formatGroupName(groupKey) {
        const groupNames = {
            'Q1': 'Clasificatoria 1',
            'Q2': 'Clasificatoria 2',
            'Q3': 'Clasificatoria 3',
            'Q4': 'Clasificatoria 4',
            'SF1': 'Semifinal 1',
            'SF2': 'Semifinal 2',
            'F': 'Final'
        };
        return groupNames[groupKey] || groupKey;
    }

    highlightActiveBracket() {
        const bracketMatches = document.querySelectorAll('.bracket-match-item');
        bracketMatches.forEach(match => {
            match.classList.remove('active');
        });
        if (this.currentBracket) {
            const activeMatch = Array.from(bracketMatches).find(match => {
                const info = match.querySelector('.match-info');
                return info && info.textContent === this.formatBracketName(this.currentBracket);
            });
            if (activeMatch) {
                activeMatch.classList.add('active');
            }
        }
    }

    // ============================================================
    // CONTENT UPDATE
    // ============================================================
    updateContent() {
        this.updateBreadcrumb();
        this.updateFeaturedPlayersByPhase();
        this.updateStatsCards();
        this.updateTeamsDisplay();
    }

    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        if (!breadcrumb) return;
        let breadcrumbText = 'Inicio';
        if (this.currentPhase) {
            breadcrumbText += ` > ${this.getPhaseDisplayName(this.currentPhase)}`;
            if (this.currentBracket && this.currentBracket !== 'all') {
                breadcrumbText += ` > ${this.formatBracketName(this.currentBracket)}`;
            }
        }
        breadcrumb.textContent = breadcrumbText;
    }

    updateFeaturedPlayersByPhase() {
        const container = document.getElementById('featured-players-container');
        if (!container) return;
        if (Object.keys(this.featuredPlayersByPhase).length === 0) {
            container.innerHTML = '<p>No hay jugadores destacados disponibles.</p>';
            return;
        }
        let html = '';
        Object.entries(this.featuredPlayersByPhase).forEach(([phase, playerData]) => {
            if (playerData) {
                html += `
                    <div class="featured-phase-player glass fade-in">
                        <img src="${this.getPlayerImage(playerData.name)}" alt="${escapeHTML(playerData.name)}" class="featured-phase-player-image" onerror="this.onerror=null;this.src='assets/logos/default_logo.png'">
                        <div class="featured-phase-player-info">
                            <h3 class="featured-phase-player-name">${escapeHTML(playerData.name)}</h3>
                            <div class="featured-phase-player-phase">${escapeHTML(this.getPhaseDisplayName(phase))}</div>
                            <div class="featured-phase-player-stats">
                                <div class="featured-phase-stat">
                                    <div class="featured-phase-stat-value">${this.formatNumber(playerData.stats.kills)}</div>
                                    <div class="featured-phase-stat-label">Eliminaciones</div>
                                </div>
                                <div class="featured-phase-stat">
                                    <div class="featured-phase-stat-value">${this.formatNumber(Math.round(playerData.stats.damage))}</div>
                                    <div class="featured-phase-stat-label">Daño Infligido</div>
                                </div>
                                <div class="featured-phase-stat">
                                    <div class="featured-phase-stat-value">${Math.round(playerData.stats.participation)}%</div>
                                    <div class="featured-phase-stat-label">Participación</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        container.innerHTML = html;
    }

    // --- Stats cards with scope (dynamic) ---
    calculateCurrentScopeStats() {
        let rows = this.getRowsInCurrentScope();

        if (this.currentFilters.team !== 'all') {
            rows = rows.filter(row => this.getTextValue(row, 'team') === this.currentFilters.team);
        }

        if (this.currentFilters.player !== 'all') {
            rows = rows.filter(row => this.getTextValue(row, 'player') === this.currentFilters.player);
        }

        const phaseData = this.data[this.currentPhase] || {};
        let matchKeys = this.currentBracket && this.currentBracket !== 'all' 
            ? [this.currentBracket] 
            : Object.keys(phaseData);

        const filteredMatches = matchKeys.filter(key => {
            const match = phaseData[key] || [];
            return match.some(row => {
                let include = true;
                if (this.currentFilters.team !== 'all') {
                    include = include && (this.getTextValue(row, 'team') === this.currentFilters.team);
                }
                if (this.currentFilters.player !== 'all') {
                    include = include && (this.getTextValue(row, 'player') === this.currentFilters.player);
                }
                return include;
            });
        });

        const totalMatches = filteredMatches.length;

        const teamsSet = new Set();
        const playersSet = new Set();
        rows.forEach(row => {
            const team = this.getTextValue(row, 'team');
            const player = this.getTextValue(row, 'player');
            if (team) teamsSet.add(team);
            if (player) playersSet.add(player);
        });

        // Compute aggregates for each enabled metric
        const enabledMetrics = this.getEnabledMetrics();
        const metricAggregates = {};
        enabledMetrics.forEach(metric => {
            let sum = 0;
            let count = 0;
            let hasData = false;
            rows.forEach(row => {
                const val = this.getNumericValue(row, metric.key);
                if (val !== null && !isNaN(val)) {
                    sum += val;
                    count++;
                    hasData = true;
                }
            });
            if (hasData) {
                if (metric.aggregation === 'sum') {
                    metricAggregates[metric.key] = sum;
                } else { // average
                    metricAggregates[metric.key] = count > 0 ? sum / count : 0;
                }
            } else {
                metricAggregates[metric.key] = 0;
            }
        });

        return {
            totalMatches: totalMatches,
            totalTeams: teamsSet.size,
            totalPlayers: playersSet.size,
            metricAggregates: metricAggregates
        };
    }

    updateStatsCards() {
        const statsContainer = document.getElementById('stats-cards');
        if (!statsContainer) return;

        const stats = this.calculateCurrentScopeStats();
        const enabledMetrics = this.getEnabledMetrics();

        if (enabledMetrics.length === 0) {
            statsContainer.innerHTML = `
                <div class="stat-card glass fade-in" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                    <p style="color: var(--text-light);">No hay grupos de métricas habilitados</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="stat-card glass fade-in">
                <div class="stat-value">${this.formatNumber(stats.totalMatches)}</div>
                <div class="stat-label">Partidos Jugados</div>
            </div>
            <div class="stat-card glass fade-in">
                <div class="stat-value">${this.formatNumber(stats.totalTeams)}</div>
                <div class="stat-label">Equipos</div>
            </div>
            <div class="stat-card glass fade-in">
                <div class="stat-value">${this.formatNumber(stats.totalPlayers)}</div>
                <div class="stat-label">Jugadores</div>
            </div>
        `;

        // Add cards for each enabled metric
        enabledMetrics.forEach(metric => {
            const value = stats.metricAggregates[metric.key] ?? 0;
            let displayValue;
            if (metric.format === 'percentage') {
                displayValue = value.toFixed(1) + '%';
            } else {
                displayValue = this.formatNumber(Math.round(value));
            }
            html += `
                <div class="stat-card glass fade-in">
                    <div class="stat-value">${displayValue}</div>
                    <div class="stat-label">${metric.label}</div>
                </div>
            `;
        });

        statsContainer.innerHTML = html;
    }

    updateTeamsDisplay() {
        const teamsContainer = document.getElementById('teams-container');
        if (!teamsContainer) return;
        const teams = this.getFilteredTeams();
        if (teams.length === 0) {
            teamsContainer.innerHTML = '<p>No hay equipos que coincidan con los filtros seleccionados.</p>';
            return;
        }
        teamsContainer.innerHTML = '';
        teams.forEach(team => {
            const teamCard = this.createTeamCard(team);
            teamsContainer.appendChild(teamCard);
        });
    }

    createTeamCard(teamName) {
        const teamPlayers = this.getPlayersByTeamInCurrentScope(teamName);
        const teamCard = document.createElement('div');
        teamCard.className = 'team-card glass fade-in';
        teamCard.tabIndex = 0;
        teamCard.setAttribute('role', 'button');
        teamCard.setAttribute('aria-label', `Ver detalles de ${teamName}`);
        teamCard.addEventListener('click', () => {
            this.showTeamDetail(teamName);
        });
        teamCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                teamCard.click();
            }
        });

        // Build stats preview based on enabled metrics
        const teamStats = this.calculateTeamAccumulatedStats(teamName);
        const enabledMetrics = this.getEnabledMetrics();
        let statsHtml = '';
        enabledMetrics.forEach(metric => {
            const value = this.getMetricStatValue(teamStats, metric);
            let displayValue;
            if (metric.format === 'percentage') {
                displayValue = value.toFixed(1) + '%';
            } else {
                displayValue = this.formatNumber(Math.round(value));
            }
            statsHtml += `
                <div class="team-stat">
                    <div class="team-stat-value">${displayValue}</div>
                    <div class="team-stat-label">${metric.label}</div>
                </div>
            `;
        });

        // Also show wins
        const wins = this.getTeamWins(teamName);

        teamCard.innerHTML = `
            <div class="team-card-header">
                <img src="${this.getTeamLogo(teamName)}" alt="${escapeHTML(teamName)}" class="team-card-logo" 
                     data-logo-managed="team" data-logo-retry-index="1"
                     onerror="window.handleTeamLogoError(this, '${escapeHTML(teamName)}')">
                <h3 class="team-card-name">${escapeHTML(teamName)}</h3>
            </div>
            <div class="team-card-stats">
                <div class="team-stat">
                    <div class="team-stat-value">${wins}</div>
                    <div class="team-stat-label">Victorias</div>
                </div>
                ${statsHtml}
            </div>
            <div class="players-list">
                <h4>Jugadores</h4>
                ${teamPlayers.map(player => this.createPlayerItem(player)).join('')}
            </div>
        `;
        teamCard.querySelectorAll('.player-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerName = item.dataset.player;
                this.showPlayerDetail(playerName);
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    item.click();
                }
            });
        });
        return teamCard;
    }

    createPlayerItem(playerName) {
        const stats = this.getPlayerAccumulatedStats(playerName);
        return `
            <div class="player-item" data-player="${escapeHTML(playerName)}" tabindex="0" role="button" aria-label="Ver detalles de ${escapeHTML(playerName)}">
                <div class="player-name">${escapeHTML(playerName)}</div>
                <div class="player-stats">
                    <div class="player-stat">K: ${this.formatNumber(stats.kills)}</div>
                    <div class="player-stat">D: ${this.formatNumber(stats.deaths)}</div>
                    <div class="player-stat">A: ${this.formatNumber(stats.assists)}</div>
                </div>
            </div>
        `;
    }

    showTeamDetail(teamName) {
        const teamPlayers = this.getPlayersByTeamInCurrentScope(teamName);
        const teamStats = this.calculateTeamAccumulatedStats(teamName);
        const enabledMetrics = this.getEnabledMetrics();

        let statsGridHtml = '';
        enabledMetrics.forEach(metric => {
            const value = this.getMetricStatValue(teamStats, metric);
            let displayValue;
            if (metric.format === 'percentage') {
                displayValue = value.toFixed(1) + '%';
            } else {
                displayValue = this.formatNumber(Math.round(value));
            }
            statsGridHtml += `
                <div class="detail-stat">
                    <div class="detail-stat-value">${displayValue}</div>
                    <div class="detail-stat-label">${metric.label}</div>
                </div>
            `;
        });

        let content = `
            <div class="team-detail glass">
                <div class="team-detail-header">
                    <img src="${this.getTeamLogo(teamName)}" alt="${escapeHTML(teamName)}" class="team-detail-logo" 
                         data-logo-managed="team" data-logo-retry-index="1"
                         onerror="window.handleTeamLogoError(this, '${escapeHTML(teamName)}')">
                    <div>
                        <h3 class="team-detail-name">${escapeHTML(teamName)}</h3>
                        <p>Victorias: ${this.getTeamWins(teamName)}</p>
                    </div>
                </div>
                <div class="team-detail-stats">
                    <div class="detail-stats-grid">
                        <div class="detail-stat">
                            <div class="detail-stat-value">${this.formatNumber(teamStats.matches)}</div>
                            <div class="detail-stat-label">Partidos</div>
                        </div>
                        ${statsGridHtml}
                    </div>
                </div>
                <div class="team-players-list">
                    <h4 class="team-players-title">Jugadores del Equipo</h4>
                    ${teamPlayers.map(player => {
                        const pStats = this.getPlayerAccumulatedStats(player);
                        return `
                        <div class="player-item" data-player="${escapeHTML(player)}" tabindex="0" role="button" aria-label="Ver detalles de ${escapeHTML(player)}">
                            <div class="player-name">${escapeHTML(player)}</div>
                            <div class="player-stats">
                                <div class="player-stat">K: ${this.formatNumber(pStats.kills)}</div>
                                <div class="player-stat">D: ${this.formatNumber(pStats.deaths)}</div>
                                <div class="player-stat">A: ${this.formatNumber(pStats.assists)}</div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        this.showDetailPanel(content, `Equipo: ${teamName}`);
        document.querySelectorAll('#detail-content .player-item').forEach(item => {
            item.addEventListener('click', () => {
                const playerName = item.dataset.player;
                this.showPlayerDetail(playerName);
            });
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    item.click();
                }
            });
        });
    }

    showPlayerDetail(playerName) {
        const playerData = this.getPlayerData(playerName);
        if (!playerData) return;
        const playerStats = this.getPlayerAccumulatedStats(playerName);
        const teamName = this.getPlayerTeamInCurrentScope(playerName) || this.getTextValue(playerData, 'team') || playerData.EQUIPO || 'Desconocido';
        const enabledMetrics = this.getEnabledMetrics();

        let statsGridHtml = '';
        enabledMetrics.forEach(metric => {
            const value = this.getMetricStatValue(playerStats, metric);
            let displayValue;
            if (metric.format === 'percentage') {
                displayValue = value.toFixed(1) + '%';
            } else {
                displayValue = this.formatNumber(Math.round(value));
            }
            statsGridHtml += `
                <div class="detail-stat">
                    <div class="detail-stat-value">${displayValue}</div>
                    <div class="detail-stat-label">${metric.label}</div>
                </div>
            `;
        });

        let content = `
            <div class="player-detail glass">
                <div class="player-detail-header">
                    <img src="${this.getPlayerImage(playerName)}" alt="${escapeHTML(playerName)}" class="player-detail-image" onerror="this.onerror=null;this.src='assets/logos/default_logo.png'">
                    <div>
                        <h3 class="player-detail-name">${escapeHTML(playerName)}</h3>
                        <p>Equipo: ${escapeHTML(teamName)}</p>
                    </div>
                </div>
                <div class="player-detail-stats">
                    <div class="detail-stats-grid">
                        <div class="detail-stat">
                            <div class="detail-stat-value">${this.formatNumber(playerStats.matches)}</div>
                            <div class="detail-stat-label">Partidos</div>
                        </div>
                        ${statsGridHtml}
                    </div>
                </div>
                <div class="chart-container player-radar-container is-chart-expandable" data-chart-title="Radar de ${escapeHTML(playerName)}" tabindex="0" role="button" aria-label="Ampliar gráfica radar de ${escapeHTML(playerName)}">
                    <canvas id="player-radar-chart"></canvas>
                    <div class="chart-expand-hint" aria-hidden="true">🔍 Ampliar</div>
                </div>
            </div>
        `;
        this.showDetailPanel(content, `Jugador: ${playerName}`);
        setTimeout(() => {
            this.updatePlayerRadarChart(playerName);
        }, 100);
    }

    updatePlayerRadarChart(playerName) {
        if (!this.isChartJsAvailable()) {
            console.warn('Chart.js no disponible para radar de jugador.');
            this.showEmptyState('player-radar-chart', 'Chart.js no disponible');
            return;
        }
        const canvas = document.getElementById('player-radar-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.charts.playerRadar) {
            this.charts.playerRadar.destroy();
            this.charts.playerRadar = null;
        }

        const playerStats = this.getPlayerAccumulatedStats(playerName);
        if (!playerStats || playerStats.matches === 0) {
            this.showEmptyState('player-radar-chart', 'Jugador sin datos');
            return;
        }

        const enabledMetrics = this.getEnabledMetrics();
        if (enabledMetrics.length === 0) {
            this.showEmptyState('player-radar-chart', 'No hay métricas habilitadas');
            return;
        }

        const allPlayers = this.getPlayersInCurrentScope();
        const allStats = allPlayers.map(p => this.getPlayerAccumulatedStats(p));

        const labels = [];
        const data = [];
        const maxValues = {};

        // For each enabled metric, compute its max across all players using the helper
        enabledMetrics.forEach(metric => {
            let maxVal = 1;
            const allVals = allStats.map(s => this.getMetricStatValue(s, metric));
            maxVal = allVals.reduce((a, b) => Math.max(a, b), 1);
            maxValues[metric.key] = Math.max(maxVal, 1);
            labels.push(metric.label);
            // Compute player's normalized value
            const playerVal = this.getMetricStatValue(playerStats, metric);
            data.push(normalize(playerVal, maxValues[metric.key]));
        });

        this.hideEmptyState('player-radar-chart');
        this.charts.playerRadar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: playerName,
                    data: data,
                    backgroundColor: 'rgba(227, 114, 242, 0.2)',
                    borderColor: 'rgba(227, 114, 242, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(227, 114, 242, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(227, 114, 242, 1)',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)', lineWidth: 1 },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: 'white', font: { family: 'Poppins', size: 13 }, padding: 10 },
                        ticks: { color: 'rgba(255, 255, 255, 0.7)', backdropColor: 'transparent', showLabelBackdrop: false, stepSize: 25, callback: (value) => `${value}%` }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const statName = context.label;
                                const rawValue = context.parsed.r;
                                let realValue;
                                // Find the metric key by label
                                const metric = enabledMetrics.find(m => m.label === statName);
                                if (!metric) return `${statName}: ${rawValue.toFixed(1)}%`;
                                const playerVal = this.getMetricStatValue(playerStats, metric);
                                const maxVal = maxValues[metric.key];
                                if (metric.format === 'percentage') {
                                    realValue = playerVal.toFixed(1) + '%';
                                } else {
                                    realValue = this.formatNumber(Math.round(playerVal));
                                }
                                return `${statName}: ${realValue} (máx: ${metric.format === 'percentage' ? maxVal.toFixed(1) + '%' : this.formatNumber(Math.round(maxVal))})`;
                            }
                        },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(227, 114, 242, 1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        titleFont: { size: 14, family: 'Poppins' },
                        bodyFont: { size: 13, family: 'Poppins' }
                    }
                },
                animation: { duration: 1000, easing: 'easeOutQuart' }
            }
        });
    }

    // ============================================================
    // CHART MODAL SYSTEM
    // ============================================================
    setupChartModal() {
        const modal = document.getElementById('chart-modal');
        const closeBtn = document.getElementById('chart-modal-close');
        if (!modal) return;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeChartModal();
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeChartModal();
            });
        }
    }

    attachChartCardListeners() {
        if (this.chartListenersAttached) return;
        this.chartListenersAttached = true;

        if (!this.isChartJsAvailable()) {
            console.warn('Chart.js no disponible, no se adjuntan listeners de gráficas.');
            return;
        }

        document.addEventListener('click', (e) => {
            const card = e.target.closest('.is-chart-expandable');
            if (!card) return;
            if (e.target.closest('#radar-team-toggles')) return;
            if (card.closest('.chart-modal')) return;
            const canvas = card.querySelector('canvas');
            if (canvas) {
                const chart = Chart.getChart(canvas);
                if (chart) {
                    const title = card.dataset.chartTitle || 'Gráfica';
                    this.openChartModal(chart, title);
                }
            }
        });
    }

    openChartModal(originalChart, title) {
        if (!originalChart) return;
        if (!this.isChartJsAvailable()) {
            console.warn('Chart.js no disponible.');
            return;
        }

        const modal = document.getElementById('chart-modal');
        const modalTitle = document.getElementById('chart-modal-title');
        const modalCanvas = document.getElementById('chart-modal-canvas');

        if (!modal || !modalCanvas) return;

        if (modal.classList.contains('active')) {
            this.closeChartModal();
        }

        this.focusOrigins.chart = document.activeElement;

        if (modalTitle) modalTitle.textContent = title || 'Gráfica';

        if (this.modalChartInstance) {
            this.modalChartInstance.destroy();
            this.modalChartInstance = null;
        }

        const config = this.cloneChartConfig(originalChart);
        if (!config) return;

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        this.updateBodyScrollLock();
        this.trapFocus(modal);

        const closeBtn = document.getElementById('chart-modal-close');
        if (closeBtn) setTimeout(() => closeBtn.focus(), 100);

        if (this.pendingModalCreation) {
            cancelAnimationFrame(this.pendingModalCreation);
            this.pendingModalCreation = null;
        }

        this.pendingModalCreation = requestAnimationFrame(() => {
            this.pendingModalCreation = null;
            if (!modal.classList.contains('active')) return;

            const ctx = modalCanvas.getContext('2d');
            this.modalChartInstance = new Chart(ctx, {
                type: config.type,
                data: config.data,
                options: config.options
            });
            setTimeout(() => {
                if (this.modalChartInstance) {
                    this.modalChartInstance.resize();
                }
            }, 100);
        });
    }

    closeChartModal() {
        const modal = document.getElementById('chart-modal');
        if (!modal) return;

        if (this.pendingModalCreation) {
            cancelAnimationFrame(this.pendingModalCreation);
            this.pendingModalCreation = null;
        }

        this.releaseFocusTrap();

        if (this.modalChartInstance) {
            this.modalChartInstance.destroy();
            this.modalChartInstance = null;
        }

        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        this.updateBodyScrollLock();

        const modalCanvas = document.getElementById('chart-modal-canvas');
        if (modalCanvas) {
            const ctx = modalCanvas.getContext('2d');
            ctx.clearRect(0, 0, modalCanvas.width, modalCanvas.height);
        }

        const origin = this.focusOrigins.chart;
        this.focusOrigins.chart = null;

        const hasUnderlying = this.restoreUnderlyingFocusTrap();
        if (!hasUnderlying && origin && origin.isConnected && origin.offsetParent !== null) {
            origin.focus();
        }
    }

    cloneChartConfig(originalChart) {
        if (!originalChart || !originalChart.config) return null;

        const config = originalChart.config;
        const type = config.type;
        let data = JSON.parse(JSON.stringify(config.data));
        let options = JSON.parse(JSON.stringify(config.options));

        if (config.options?.plugins?.tooltip?.callbacks) {
            if (!options.plugins) options.plugins = {};
            if (!options.plugins.tooltip) options.plugins.tooltip = {};
            options.plugins.tooltip.callbacks = config.options.plugins.tooltip.callbacks;
        }

        if (config.options?.scales) {
            for (const scaleKey of Object.keys(config.options.scales)) {
                const scale = config.options.scales[scaleKey];
                if (scale.ticks?.callback) {
                    if (!options.scales) options.scales = {};
                    if (!options.scales[scaleKey]) options.scales[scaleKey] = {};
                    if (!options.scales[scaleKey].ticks) options.scales[scaleKey].ticks = {};
                    options.scales[scaleKey].ticks.callback = scale.ticks.callback;
                }
                if (scale.title?.display && scale.title.text) {
                    if (!options.scales) options.scales = {};
                    if (!options.scales[scaleKey]) options.scales[scaleKey] = {};
                    if (!options.scales[scaleKey].title) options.scales[scaleKey].title = {};
                    options.scales[scaleKey].title.display = scale.title.display;
                    options.scales[scaleKey].title.text = scale.title.text;
                    options.scales[scaleKey].title.color = scale.title.color;
                }
            }
        }

        if (options.plugins?.legend?.labels) {
            options.plugins.legend.labels.font = { size: 16, family: 'Poppins' };
        }
        if (options.scales) {
            for (const scaleKey of Object.keys(options.scales)) {
                const scale = options.scales[scaleKey];
                if (scale.ticks) {
                    if (!scale.ticks.font) scale.ticks.font = {};
                    scale.ticks.font.size = 14;
                    scale.ticks.font.family = 'Poppins';
                }
                if (scale.pointLabels) {
                    if (!scale.pointLabels.font) scale.pointLabels.font = {};
                    scale.pointLabels.font.size = 14;
                    scale.pointLabels.font.family = 'Poppins';
                }
                if (scale.title) {
                    if (!scale.title.font) scale.title.font = {};
                    scale.title.font.size = 16;
                    scale.title.font.family = 'Poppins';
                }
            }
        }
        if (options.plugins?.tooltip) {
            options.plugins.tooltip.titleFont = { size: 16, family: 'Poppins' };
            options.plugins.tooltip.bodyFont = { size: 14, family: 'Poppins' };
            options.plugins.tooltip.padding = 12;
        }

        return { type, data, options };
    }

    // ============================================================
    // CHART UPDATE METHODS
    // ============================================================
    updateCharts() {
        if (!this.isChartJsAvailable()) {
            console.warn('Chart.js no disponible, no se pueden actualizar gráficas.');
            ['radar-chart', 'bar-chart', 'pie-chart'].forEach(id => {
                this.showEmptyState(id, 'Chart.js no disponible');
            });
            return;
        }
        const enabledMetrics = this.getEnabledMetrics();
        if (enabledMetrics.length === 0) {
            // Destroy any existing charts and show message
            this.destroyChart('radar');
            this.destroyChart('bar');
            this.destroyChart('pie');
            ['radar-chart', 'bar-chart', 'pie-chart'].forEach(id => {
                this.showEmptyState(id, 'No hay grupos de métricas habilitados');
            });
            return;
        }
        this.updateRadarChart();
        this.updateBarChart();
        this.updatePieChart();
    }

    destroyChart(chartKey) {
        if (this.charts[chartKey]) {
            this.charts[chartKey].destroy();
            this.charts[chartKey] = null;
        }
        const canvas = document.getElementById(chartKey + '-chart') || document.getElementById(chartKey);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    showEmptyState(containerId, message) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const parent = container.closest('.chart-card, .chart-container');
        if (parent) {
            let emptyDiv = parent.querySelector('.chart-empty-state');
            if (!emptyDiv) {
                emptyDiv = document.createElement('div');
                emptyDiv.className = 'chart-empty-state';
                parent.appendChild(emptyDiv);
            }
            emptyDiv.textContent = message || 'No hay datos disponibles';
            emptyDiv.hidden = false;
            parent.classList.add('chart-has-empty-state');
            container.hidden = true;
        }
    }

    hideEmptyState(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const parent = container.closest('.chart-card, .chart-container');
        if (parent) {
            const emptyDiv = parent.querySelector('.chart-empty-state');
            if (emptyDiv) {
                emptyDiv.remove();
            }
            parent.classList.remove('chart-has-empty-state');
            container.hidden = false;
        }
    }

    // --- Radar Chart (teams) ---
    updateRadarChart() {
        const canvas = document.getElementById('radar-chart');
        if (!canvas) return;

        this.destroyChart('radar');

        if (!this.isChartJsAvailable()) {
            this.showEmptyState('radar-chart', 'Chart.js no disponible');
            return;
        }

        const enabledMetrics = this.getEnabledMetrics();
        if (enabledMetrics.length === 0) {
            this.showEmptyState('radar-chart', 'No hay métricas habilitadas');
            return;
        }

        const ctx = canvas.getContext('2d');

        const allTeamsInScope = this.getTeamsInCurrentScope();
        if (allTeamsInScope.length === 0) {
            this.showEmptyState('radar-chart', 'No hay equipos en esta fase');
            return;
        }

        // Compute max for each metric across all teams using the helper
        const allTeamStats = allTeamsInScope.map(team => this.calculateTeamAccumulatedStats(team));
        const maxValues = {};
        enabledMetrics.forEach(metric => {
            const allVals = allTeamStats.map(s => this.getMetricStatValue(s, metric));
            const maxVal = allVals.reduce((a, b) => Math.max(a, b), 1);
            maxValues[metric.key] = Math.max(maxVal, 1);
        });

        let teams = this.getFilteredTeams();
        if (teams.length === 0) {
            this.showEmptyState('radar-chart', 'No hay equipos con los filtros seleccionados');
            return;
        }

        const teamWins = teams.map(team => ({ team, wins: this.getTeamWins(team) }));
        teamWins.sort((a, b) => b.wins - a.wins);
        const topTeams = teamWins.slice(0, 8).map(item => item.team);

        // Build datasets for radar
        const labels = enabledMetrics.map(m => m.label);
        const teamStatsForDisplay = topTeams.map(team => {
            const stats = this.calculateTeamAccumulatedStats(team);
            const data = enabledMetrics.map(metric => {
                const val = this.getMetricStatValue(stats, metric);
                return normalize(val, maxValues[metric.key]);
            });
            const color = this.getTeamColor(team, 1);
            const bgColor = this.getTeamColor(team, 0.15);
            return {
                label: team,
                data: data,
                borderColor: color,
                backgroundColor: bgColor,
                borderWidth: 2,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6,
                hidden: false
            };
        });

        this.hideEmptyState('radar-chart');
        this.charts.radar = new Chart(ctx, {
            type: 'radar',
            data: { labels: labels, datasets: teamStatsForDisplay },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: 'white', font: { family: 'Poppins', size: 13 } },
                        ticks: { color: 'rgba(255, 255, 255, 0.7)', backdropColor: 'transparent', showLabelBackdrop: false, stepSize: 25, callback: (value) => `${value}%` }
                    }
                },
                plugins: {
                    legend: { labels: { color: 'white', font: { family: 'Poppins', size: 13 }, padding: 15, usePointStyle: true, pointStyle: 'circle' }, position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const teamName = context.dataset.label;
                                const statLabel = context.label;
                                const metric = enabledMetrics.find(m => m.label === statLabel);
                                if (!metric) return `${teamName}: ${context.parsed.r.toFixed(1)}%`;
                                const stats = this.calculateTeamAccumulatedStats(teamName);
                                const realValue = this.getMetricStatValue(stats, metric);
                                const maxVal = maxValues[metric.key];
                                let displayReal, displayMax;
                                if (metric.format === 'percentage') {
                                    displayReal = realValue.toFixed(1) + '%';
                                    displayMax = maxVal.toFixed(1) + '%';
                                } else {
                                    displayReal = this.formatNumber(Math.round(realValue));
                                    displayMax = this.formatNumber(Math.round(maxVal));
                                }
                                return `${teamName} - ${statLabel}: ${displayReal} (máx: ${displayMax})`;
                            }
                        },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        titleFont: { size: 14, family: 'Poppins' },
                        bodyFont: { size: 13, family: 'Poppins' }
                    }
                },
                animation: { duration: 1000, easing: 'easeOutQuart' }
            }
        });

        // Checkboxes for radar
        const togglesContainer = document.getElementById('radar-team-toggles');
        if (!togglesContainer) return;
        togglesContainer.innerHTML = '';
        topTeams.forEach(team => {
            const color = this.getTeamColor(team, 1);
            const checkboxId = `radar-toggle-${team.replace(/[^a-zA-Z0-9]/g, '')}`;
            const label = document.createElement('label');
            label.className = 'radar-toggle-label';
            label.style.display = 'inline-flex';
            label.style.alignItems = 'center';
            label.style.marginRight = '0.75rem';
            label.style.cursor = 'pointer';
            label.style.color = 'white';
            label.style.fontSize = '0.85rem';
            label.style.gap = '0.3rem';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = checkboxId;
            checkbox.checked = true;
            checkbox.style.accentColor = color;
            checkbox.style.width = '16px';
            checkbox.style.height = '16px';
            checkbox.style.cursor = 'pointer';

            const swatch = document.createElement('span');
            swatch.style.display = 'inline-block';
            swatch.style.width = '14px';
            swatch.style.height = '14px';
            swatch.style.borderRadius = '3px';
            swatch.style.backgroundColor = color;
            swatch.style.marginRight = '0.2rem';
            swatch.style.border = '1px solid rgba(255,255,255,0.3)';
            swatch.setAttribute('aria-hidden', 'true');

            const text = document.createTextNode(team);

            label.appendChild(checkbox);
            label.appendChild(swatch);
            label.appendChild(text);

            label.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const chart = this.charts.radar;
                if (!chart) return;
                const datasetIndex = chart.data.datasets.findIndex(ds => ds.label === team);
                if (datasetIndex === -1) return;
                const isChecked = checkbox.checked;
                chart.data.datasets[datasetIndex].hidden = !isChecked;
                chart.update();
            });

            togglesContainer.appendChild(label);
        });
    }

    // --- Bar Chart (players) with dynamic datasets and axes ---
    updateBarChart() {
        const canvas = document.getElementById('bar-chart');
        if (!canvas) return;

        this.destroyChart('bar');

        if (!this.isChartJsAvailable()) {
            this.showEmptyState('bar-chart', 'Chart.js no disponible');
            return;
        }

        const enabledMetrics = this.getEnabledMetrics();
        if (enabledMetrics.length === 0) {
            this.showEmptyState('bar-chart', 'No hay métricas habilitadas');
            return;
        }

        const ctx = canvas.getContext('2d');
        let players = this.getFilteredPlayers();
        if (players.length === 0) {
            this.showEmptyState('bar-chart', 'No hay jugadores con los filtros seleccionados');
            return;
        }

        // For each player, get aggregate for each metric using the helper
        const playerStats = players.map(player => {
            const stats = this.getPlayerAccumulatedStats(player);
            const data = {};
            enabledMetrics.forEach(metric => {
                data[metric.key] = this.getMetricStatValue(stats, metric);
            });
            return { name: player, data: data };
        });

        // Sort by the first metric (prefer kills if enabled)
        const sortMetric = enabledMetrics.find(m => m.key === 'kills') || enabledMetrics[0];
        playerStats.sort((a, b) => (b.data[sortMetric.key] || 0) - (a.data[sortMetric.key] || 0));
        const topPlayers = playerStats.slice(0, 10);

        // Split metrics into percentage and non-percentage
        const numberMetrics = enabledMetrics.filter(m => m.format !== 'percentage');
        const percentMetrics = enabledMetrics.filter(m => m.format === 'percentage');

        const datasets = [];
        const scales = {};

        // Numeric metrics go to left axis (y)
        if (numberMetrics.length > 0) {
            scales.y = {
                type: 'linear',
                position: 'left',
                beginAtZero: true,
                grid: { color: 'rgba(255,255,255,0.08)' },
                ticks: {
                    color: 'white',
                    font: { size: 10, family: 'Poppins' },
                    callback: (v) => this.formatNumber(v)
                },
                title: {
                    display: true,
                    text: 'Valores Numéricos',
                    color: 'white',
                    font: { size: 11, family: 'Poppins' }
                }
            };
        }

        // Percentage metrics go to right axis (y1)
        if (percentMetrics.length > 0) {
            scales.y1 = {
                type: 'linear',
                position: 'right',
                beginAtZero: true,
                max: 100,
                grid: { drawOnChartArea: false },
                ticks: {
                    color: 'white',
                    font: { size: 10, family: 'Poppins' },
                    callback: (v) => v + '%'
                },
                title: {
                    display: true,
                    text: 'Porcentajes',
                    color: 'white',
                    font: { size: 11, family: 'Poppins' }
                }
            };
        }

        // Color palette for datasets
        const colors = [
            'rgba(227, 114, 242, 0.7)',
            'rgba(119, 185, 242, 0.7)',
            'rgba(46, 196, 182, 0.7)',
            'rgba(255, 190, 11, 0.7)',
            'rgba(131, 56, 236, 0.7)',
            'rgba(251, 86, 7, 0.7)',
            'rgba(6, 214, 160, 0.7)',
            'rgba(255, 112, 166, 0.7)'
        ];

        // Add each metric as a dataset
        enabledMetrics.forEach((metric, idx) => {
            const isPercent = metric.format === 'percentage';
            const yAxis = isPercent ? 'y1' : 'y';
            const color = colors[idx % colors.length];
            datasets.push({
                label: metric.label,
                data: topPlayers.map(p => p.data[metric.key] || 0),
                yAxisID: yAxis,
                backgroundColor: color,
                borderColor: color.replace('0.7', '1'),
                borderWidth: 1,
                borderRadius: 3,
                barPercentage: 0.7,
                categoryPercentage: 0.6,
                order: idx
            });
        });

        if (datasets.length === 0) {
            this.showEmptyState('bar-chart', 'No hay datos para mostrar');
            return;
        }

        this.hideEmptyState('bar-chart');
        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topPlayers.map(p => p.name),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: scales,
                plugins: {
                    legend: {
                        labels: {
                            color: 'white',
                            font: { size: 11, family: 'Poppins' }
                        },
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const val = context.parsed.y;
                                const metric = enabledMetrics.find(m => m.label === label);
                                if (metric && metric.format === 'percentage') {
                                    return `${label}: ${val.toFixed(1)}%`;
                                }
                                return `${label}: ${this.formatNumber(val)}`;
                            }
                        },
                        titleFont: { size: 14, family: 'Poppins' },
                        bodyFont: { size: 13, family: 'Poppins' }
                    }
                }
            }
        });
    }

    // --- Pie Chart: Distribution of Participation or Team Fight Presence ---
    updatePieChart() {
        const canvas = document.getElementById('pie-chart');
        if (!canvas) return;

        this.destroyChart('pie');

        if (!this.isChartJsAvailable()) {
            this.showEmptyState('pie-chart', 'Chart.js no disponible');
            return;
        }

        // Determine which metric to use for pie
        const fiveEnabled = window.isModo5v5Enabled ? window.isModo5v5Enabled() : false;
        const chaosEnabled = window.isModoChaosEnabled ? window.isModoChaosEnabled() : false;

        let pieMetricKey = null;
        if (fiveEnabled) {
            pieMetricKey = 'participation';
        } else if (chaosEnabled) {
            pieMetricKey = 'teamFightPresence';
        } else {
            this.showEmptyState('pie-chart', 'No hay métricas de participación habilitadas');
            return;
        }

        // Check if the metric is actually enabled (it should be if the mode is on)
        if (!this.isMetricEnabled(pieMetricKey)) {
            this.showEmptyState('pie-chart', 'Métrica de participación no habilitada');
            return;
        }

        const ctx = canvas.getContext('2d');
        let teams = this.getFilteredTeams();
        if (teams.length === 0) {
            this.showEmptyState('pie-chart', 'No hay equipos con los filtros seleccionados');
            return;
        }

        // For each team, get the average of the chosen metric
        const teamValues = teams.map(team => {
            const stats = this.calculateTeamAccumulatedStats(team);
            let val;
            if (pieMetricKey === 'participation') {
                val = stats.avgParticipation || 0;
            } else if (pieMetricKey === 'teamFightPresence') {
                val = stats.avgTeamFightPresence || 0;
            } else {
                val = 0;
            }
            return { team, value: val };
        });

        const total = teamValues.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) {
            this.showEmptyState('pie-chart', 'No hay datos de participación');
            return;
        }

        const percentages = teamValues.map(item => ({
            label: item.team,
            data: (item.value / total) * 100
        }));

        const colors = percentages.map(item => this.getTeamColor(item.label, 0.8));

        this.hideEmptyState('pie-chart');
        this.charts.pie = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: percentages.map(p => p.label),
                datasets: [{
                    data: percentages.map(p => p.data),
                    backgroundColor: colors,
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: 'white', font: { family: 'Poppins', size: 13 } } },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return `${label}: ${value.toFixed(1)}%`;
                            }
                        },
                        titleFont: { size: 14, family: 'Poppins' },
                        bodyFont: { size: 13, family: 'Poppins' }
                    }
                }
            }
        });
    }

    // ============================================================
    // FILTERED HELPERS (using scope-aware data)
    // ============================================================
    getFilteredTeams() {
        let teams = this.getTeamsInCurrentScope();

        if (this.currentFilters.team !== 'all') {
            teams = teams.filter(team => team === this.currentFilters.team);
        }

        if (this.currentFilters.player !== 'all') {
            const playerTeam = this.getPlayerTeamInCurrentScope(this.currentFilters.player);
            teams = playerTeam ? teams.filter(team => team === playerTeam) : [];
        }

        return teams;
    }

    getFilteredPlayers() {
        let players = this.getPlayersInCurrentScope();

        if (this.currentFilters.team !== 'all') {
            players = players.filter(player => {
                return this.getPlayerTeamInCurrentScope(player) === this.currentFilters.team;
            });
        }

        if (this.currentFilters.player !== 'all') {
            players = players.filter(player => player === this.currentFilters.player);
        }

        return players;
    }

    // ============================================================
    // GLOBAL HELPERS
    // ============================================================
    getTeamData(teamName) {
        for (const phase of Object.values(this.data)) {
            for (const match of Object.values(phase)) {
                for (const row of match) {
                    const team = this.getTextValue(row, 'team');
                    if (team === teamName) return row;
                }
            }
        }
        return null;
    }

    getPlayerData(playerName) {
        for (const phase of Object.values(this.data)) {
            for (const match of Object.values(phase)) {
                for (const row of match) {
                    const player = this.getTextValue(row, 'player');
                    if (player === playerName) return row;
                }
            }
        }
        return null;
    }

    // ============================================================
    // TEAM LOGO - Centralized using TOURNAMENT_CONFIG
    // ============================================================
    getTeamLogo(teamName) {
        const config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && config.helpers.getTeamLogoCandidates) {
            const candidates = config.helpers.getTeamLogoCandidates(teamName);
            if (candidates && candidates.length > 0) {
                return candidates[0]; // primer candidato (extensión preferida)
            }
        }
        return 'assets/logos/default_logo.png';
    }

    // Fallback controlado por extensiones (llamado desde window.handleTeamLogoError)
    applyTeamLogoFallback(imgElement, teamName) {
        if (!imgElement) return;

        const config = window.TOURNAMENT_CONFIG;
        if (!config || !config.helpers || !config.helpers.getTeamLogoCandidates) {
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

        // Leer índice actual; si no existe, empezar en 1 (porque el primer candidato ya se usó en src)
        let currentIndex = parseInt(imgElement.dataset.logoRetryIndex);
        if (isNaN(currentIndex) || currentIndex < 1) {
            currentIndex = 1;
        }

        // Si ya se probaron todos los candidatos, usar default
        if (currentIndex >= candidates.length) {
            imgElement.src = 'assets/logos/default_logo.png';
            imgElement.onerror = null;
            imgElement.dataset.logoRetryIndex = candidates.length + 1;
            return;
        }

        // Probar el siguiente candidato
        imgElement.src = candidates[currentIndex];
        imgElement.dataset.logoRetryIndex = currentIndex + 1;
        // El onerror ya está configurado para llamar a esta función de nuevo
    }

    // ------------------------------------------------------------

    getPlayerImage(playerName) {
        const cleanName = playerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `assets/players/${cleanName}.png`;
    }

    calculateTournamentStats() {
        let totalMatches = 0;
        Object.values(this.data).forEach(phase => { totalMatches += Object.keys(phase).length; });
        const teams = this.getAllTeams();
        const players = this.getAllPlayers();
        let totalKills = 0, totalDamage = 0, highestKills = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                match.forEach(row => {
                    const kills = this.getNumericValue(row, 'kills') || 0;
                    const damage = this.getNumericValue(row, 'heroDamageDealt') || 0;
                    totalKills += kills;
                    totalDamage += damage;
                    if (kills > highestKills) highestKills = kills;
                });
            });
        });
        return {
            totalMatches: totalMatches,
            totalTeams: teams.length,
            totalPlayers: players.length,
            avgKills: totalMatches ? Math.round(totalKills / totalMatches) : 0,
            avgDamage: totalMatches ? Math.round(totalDamage / totalMatches) : 0,
            highestKills: highestKills
        };
    }

    // ---- Stats that use scope ----
    getTeamWins(teamName) {
        let wins = 0;
        const phaseData = this.data[this.currentPhase] || {};
        const matchKeys = this.currentBracket && this.currentBracket !== 'all' 
            ? [this.currentBracket] 
            : Object.keys(phaseData);
        for (const key of matchKeys) {
            const match = phaseData[key] || [];
            const winner = this.determineMatchWinner(match);
            if (winner === teamName) wins++;
        }
        return wins;
    }

    calculateTeamKDA(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        if (stats.matches === 0) return '0.00';
        const kda = (stats.kills + stats.assists) / Math.max(stats.deaths, 1);
        return kda.toFixed(2);
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

    calculateTeamParticipation(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        return stats.avgParticipation;
    }

    determineBestTeam() {
        const teams = this.getAllTeams();
        let bestTeam = null;
        let bestScore = -Infinity;

        teams.forEach(team => {
            const wins = this.getGlobalTeamWins(team);
            const stats = this.getGlobalTeamStats(team);
            const score = wins * 10 + stats.avgKills + stats.avgDamage / 1000;
            if (score > bestScore) {
                bestScore = score;
                bestTeam = {
                    name: team,
                    wins: wins,
                    score: score,
                    stats: stats
                };
            }
        });
        this.bestTeam = bestTeam;
    }

    determineFeaturedPlayersByPhase() {
        this.featuredPlayersByPhase = {};
        const phases = ['cuartos', 'semifinal', 'final'];
        phases.forEach(phase => {
            let bestPlayer = null;
            let bestScore = 0;
            const playersInPhase = this.getPlayersInPhase(phase);
            playersInPhase.forEach(player => {
                const playerStats = this.getPlayerStatsInPhase(player, phase);
                if (playerStats) {
                    const score = this.calculatePlayerScore(playerStats);
                    if (score > bestScore) {
                        bestScore = score;
                        bestPlayer = { name: player, stats: playerStats };
                    }
                }
            });
            this.featuredPlayersByPhase[phase] = bestPlayer;
        });
    }

    getPlayersInPhase(phase) {
        const players = new Set();
        Object.values(this.data[phase]).forEach(match => {
            match.forEach(row => {
                const player = this.getTextValue(row, 'player');
                if (player) players.add(player);
            });
        });
        return Array.from(players);
    }

    getPlayerStatsInPhase(playerName, phase) {
        let totalKills = 0, totalDamage = 0, totalParticipation = 0, matchCount = 0;
        Object.values(this.data[phase]).forEach(match => {
            let playerInMatch = false;
            match.forEach(row => {
                const player = this.getTextValue(row, 'player');
                if (player === playerName) {
                    totalKills += this.getNumericValue(row, 'kills') || 0;
                    totalDamage += this.getNumericValue(row, 'heroDamageDealt') || 0;
                    totalParticipation += this.getNumericValue(row, 'participation') || 0;
                    playerInMatch = true;
                }
            });
            if (playerInMatch) matchCount++;
        });
        if (matchCount === 0) return null;
        return {
            kills: totalKills,
            damage: totalDamage / matchCount,
            participation: totalParticipation / matchCount,
            matches: matchCount
        };
    }

    calculatePlayerScore(stats) {
        return (stats.kills * 2) + (stats.damage / 1000) + (stats.participation * 0.5);
    }

    formatBracketName(bracketFileName) {
        const cleanName = bracketFileName.replace('.csv', '');
        const qMatch = cleanName.match(/^Q(\d+)M(\d+)$/);
        if (qMatch) return `Clasificatoria ${qMatch[1]} - Partida ${qMatch[2]}`;
        const sfMatch = cleanName.match(/^SF(\d+)M(\d+)$/i);
        if (sfMatch) return `Semifinal ${sfMatch[1]} - Partida ${sfMatch[2]}`;
        const sMatch = cleanName.match(/^S(\d+)M(\d+)$/);
        if (sMatch) return `Semifinal ${sMatch[1]} - Partida ${sMatch[2]}`;
        const finalSeriesMatch = cleanName.match(/^F(\d+)M(\d+)$/i);
        if (finalSeriesMatch) return `Final ${finalSeriesMatch[1]} - Partida ${finalSeriesMatch[2]}`;
        const finalMatch = cleanName.match(/^FM(\d+)$/i);
        if (finalMatch) return `Final - Partida ${finalMatch[1]}`;
        return cleanName;
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
        winners.forEach(winner => { winnerCount[winner] = (winnerCount[winner] || 0) + 1; });
        const sorted = Object.entries(winnerCount).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
            return null;
        }
        return sorted[0]?.[0] || null;
    }

    // ---- Presentation update ----
    updatePresentationStats() {
        const presentationStatsDiv = document.getElementById('presentation-stats');
        const bestTeamContainer = document.getElementById('best-team-presentation');
        const featuredSummary = document.getElementById('presentation-featured-summary');
        
        let totalKills = 0;
        let totalDamage = 0;
        let totalMatches = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                totalMatches++;
                match.forEach(row => {
                    const kills = this.getNumericValue(row, 'kills') || 0;
                    const damage = this.getNumericValue(row, 'heroDamageDealt') || 0;
                    totalKills += kills;
                    totalDamage += damage;
                });
            });
        });

        const stats = this.calculateTournamentStats();
        if (presentationStatsDiv) {
            presentationStatsDiv.innerHTML = `
                <div class="presentation-grid">
                    <div class="presentation-card glass">
                        <div class="presentation-stat">${this.formatNumber(stats.totalMatches)}</div>
                        <div class="presentation-stat-label">Partidos</div>
                    </div>
                    <div class="presentation-card glass">
                        <div class="presentation-stat">${this.formatNumber(stats.totalTeams)}</div>
                        <div class="presentation-stat-label">Equipos</div>
                    </div>
                    <div class="presentation-card glass">
                        <div class="presentation-stat">${this.formatNumber(stats.totalPlayers)}</div>
                        <div class="presentation-stat-label">Jugadores</div>
                    </div>
                    <div class="presentation-card glass">
                        <div class="presentation-stat">${this.formatNumber(totalKills)}</div>
                        <div class="presentation-stat-label">Eliminaciones Totales</div>
                    </div>
                    <div class="presentation-card glass">
                        <div class="presentation-stat">${this.formatNumber(Math.round(totalDamage))}</div>
                        <div class="presentation-stat-label">Daño Total</div>
                    </div>
                </div>
            `;
        }

        if (this.bestTeam && bestTeamContainer) {
            const teamStats = this.bestTeam.stats || this.getGlobalTeamStats(this.bestTeam.name);
            bestTeamContainer.innerHTML = `
                <div class="presentation-card glass best-team">
                    <h2 class="best-team-title" style="color: var(--primary-yellow); margin-bottom: 1rem;">🏆 Mejor Equipo del Torneo 🏆</h2>
                    <div class="presentation-team">
                        <img src="${this.getTeamLogo(this.bestTeam.name)}" alt="${escapeHTML(this.bestTeam.name)}" class="presentation-team-logo" 
                             data-logo-managed="team" data-logo-retry-index="1"
                             onerror="window.handleTeamLogoError(this, '${escapeHTML(this.bestTeam.name)}')">
                        <h3>${escapeHTML(this.bestTeam.name)}</h3>
                        <p>Victorias: ${this.bestTeam.wins}</p>
                        <div class="presentation-team-stats">
                            <span>🗡️ ${this.formatNumber(teamStats.kills)} elim.</span>
                            <span>⚔️ ${this.formatNumber(Math.round(teamStats.avgDamage))} daño</span>
                            <span>🤝 ${Math.round(teamStats.avgParticipation)}% part.</span>
                        </div>
                    </div>
                </div>
            `;
        }

        if (featuredSummary) {
            const phases = ['cuartos', 'semifinal', 'final'];
            let html = `<div class="presentation-featured-players"><h2 style="color: var(--primary-yellow); text-align: center; margin-bottom: 2rem;">🌟 Jugadores Destacados por Fase 🌟</h2><div class="presentation-grid">`;
            for (const phase of phases) {
                const playerData = this.featuredPlayersByPhase[phase];
                if (playerData) {
                    html += `
                        <div class="presentation-card glass">
                            <h3 class="presentation-phase-title" style="color: var(--primary-yellow); margin-bottom: 1rem;">${escapeHTML(this.getPhaseDisplayName(phase))}</h3>
                            <div class="presentation-player">
                                <div class="presentation-player-rank" style="font-size: 2rem;">⭐</div>
                                <div class="presentation-player-name" style="font-size: 1.2rem; font-weight: bold;">${escapeHTML(playerData.name)}</div>
                                <div class="presentation-player-stats" style="margin-top: 0.5rem;">
                                    <span class="presentation-stat">🗡️ ${this.formatNumber(playerData.stats.kills)} elim.</span>
                                    <span class="presentation-stat">⚔️ ${this.formatNumber(Math.round(playerData.stats.damage))} daño</span>
                                    <span class="presentation-stat">🤝 ${Math.round(playerData.stats.participation)}% part.</span>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="presentation-card glass">
                            <h3 class="presentation-phase-title" style="color: var(--primary-yellow);">${escapeHTML(this.getPhaseDisplayName(phase))}</h3>
                            <p>Sin datos destacados</p>
                        </div>
                    `;
                }
            }
            html += `</div></div>`;
            featuredSummary.innerHTML = html;
        }
    }

    getAllTeams() { return Array.from(this.uniqueTeams); }
    getAllPlayers() { return Array.from(this.uniquePlayers); }

    showError(message) { alert(message); }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new HonorOfKingsDashboard();
});

// Global image fallback handler – modificado para ignorar logos de equipo manejados por el nuevo sistema
window.addEventListener('error', (e) => {
    const image = e.target;
    if (!(image instanceof HTMLImageElement)) return;
    const src = image.src || '';
    if (src.includes('default_logo.png')) return;
    // Si es un logo de equipo administrado, no intervenir (ya lo maneja nuestro fallback)
    if (image.dataset.logoManaged === 'team') {
        return;
    }
    if (src.includes('assets/logos/') || src.includes('assets/players/')) {
        image.dataset.fallbackApplied = 'true';
        image.src = 'assets/logos/default_logo.png';
        image.onerror = null;
    }
}, true);

window.HOK_CSV_LOADER = { resolvePhaseId: resolvePhaseId, loadPhaseCsvFiles: loadPhaseCsvFiles };