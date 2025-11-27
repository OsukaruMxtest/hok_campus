// Featured Players Dashboard
class FeaturedPlayersDashboard {
    constructor() {
        this.data = {
            cuartos: {},
            semifinal: {},
            final: {}
        };
        this.topPlayersByPhase = {
            cuartos: [],
            semifinal: [],
            final: []
        };
        this.uniquePlayers = new Set();
        
        this.init();
    }

    // Initialize the dashboard
    init() {
        this.setupEventListeners();
        this.loadAllData()
            .then(() => {
                this.processPlayersData();
                this.calculateTopPlayersByPhase();
                this.updateFeaturedPlayersDisplay();
                this.updateStatsSummary();
                this.hideLoadingIndicator();
            })
            .catch(error => {
                console.error('Error loading data:', error);
                this.showError('Error al cargar los datos de jugadores');
                this.hideLoadingIndicator();
            });
    }

    // Setup event listeners
    setupEventListeners() {
        // Presentation mode
        document.getElementById('presentation-mode-toggle').addEventListener('click', () => {
            this.togglePresentationMode();
        });

        // Close presentation mode on click
        document.getElementById('presentation-overlay').addEventListener('click', () => {
            this.togglePresentationMode();
        });

        // Navigation toggle
        document.getElementById('nav-toggle').addEventListener('click', () => {
            this.toggleNavigation();
        });
    }

    // Toggle navigation menu
    toggleNavigation() {
        document.querySelector('.nav-menu').classList.toggle('active');
    }

    // Toggle presentation mode
    togglePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        overlay.classList.toggle('active');
        
        if (overlay.classList.contains('active')) {
            this.updatePresentationFeaturedPlayers();
        }
    }

    // Load data from CSV files
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

    // Load data for a specific phase
    async loadPhaseData(phase) {
        const phasePath = `/data/${phase}/`;
        
        try {
            const fileNames = await this.getCSVFileNames(phase);
            
            for (const fileName of fileNames) {
                try {
                    const filePath = `${phasePath}${fileName}`;
                    const csvData = await this.loadCSV(filePath);
                    this.data[phase][fileName] = this.parseCSV(csvData);
                } catch (error) {
                    console.warn(`Could not load file: ${fileName}`, error);
                }
            }
        } catch (error) {
            console.warn(`Could not load phase: ${phase}`, error);
        }
    }

    // Get CSV file names for a phase
    async getCSVFileNames(phase) {
        // Predefined list based on the phase
        const fileMap = {
            cuartos: ['Q1M1.csv', 'Q1M2.csv', 'Q2M1.csv', 'Q2M2.csv', 'Q3M1.csv', 'Q3M2.csv', 'Q4M1.csv', 'Q4M2.csv'],
            semifinal: ['S1M1.csv', 'S1M2.csv', 'S2M1.csv', 'S2M2.csv'],
            final: ['FM1.csv', 'FM2.csv', 'FM3.csv', 'FM4.csv', 'FM5.csv']
        };
        
        return fileMap[phase] || [];
    }

    // Load CSV file
    async loadCSV(filePath) {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Failed to fetch CSV: ${filePath}`);
        }
        return await response.text();
    }

    // Parse CSV data
    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(header => header.trim());
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(value => value.trim());
            const entry = {};
            
            headers.forEach((header, index) => {
                entry[header] = values[index] || '';
            });
            
            data.push(entry);
        }
        
        return data;
    }

    // Process players data
    processPlayersData() {
        this.uniquePlayers.clear();
        
        // Collect all unique players
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(matchData => {
                matchData.forEach(row => {
                    if (row.JUGADOR) {
                        this.uniquePlayers.add(row.JUGADOR);
                    }
                });
            });
        });
    }

    // Calculate top 10 players by phase using criteria: eliminations > damage > assists
    calculateTopPlayersByPhase() {
        const phases = ['cuartos', 'semifinal', 'final'];
        
        phases.forEach(phase => {
            const playerStats = [];
            const playersInPhase = this.getPlayersInPhase(phase);
            
            playersInPhase.forEach(player => {
                const stats = this.getPlayerStatsInPhase(player, phase);
                if (stats && stats.matches > 0) {
                    playerStats.push({
                        name: player,
                        stats: stats
                    });
                }
            });
            
            // Sort by criteria: eliminations > damage > assists
            playerStats.sort((a, b) => {
                // Primary: Eliminations
                if (b.stats.kills !== a.stats.kills) {
                    return b.stats.kills - a.stats.kills;
                }
                // Secondary: Damage
                if (b.stats.damage !== a.stats.damage) {
                    return b.stats.damage - a.stats.damage;
                }
                // Tertiary: Assists
                return b.stats.assists - a.stats.assists;
            });
            
            this.topPlayersByPhase[phase] = playerStats.slice(0, 10);
        });
    }

    // Get players in a specific phase
    getPlayersInPhase(phase) {
        const players = new Set();
        
        Object.values(this.data[phase]).forEach(match => {
            match.forEach(row => {
                if (row.JUGADOR) {
                    players.add(row.JUGADOR);
                }
            });
        });
        
        return Array.from(players);
    }

    // Get player stats in a specific phase
    getPlayerStatsInPhase(playerName, phase) {
        let totalKills = 0;
        let totalDeaths = 0;
        let totalAssists = 0;
        let totalDamage = 0;
        let totalGold = 0;
        let totalParticipation = 0;
        let totalCrowdControl = 0;
        let totalTowerDamage = 0;
        let matchCount = 0;
        
        Object.values(this.data[phase]).forEach(match => {
            let playerInMatch = false;
            
            match.forEach(row => {
                if (row.JUGADOR === playerName) {
                    totalKills += parseInt(row.Eliminaciones) || 0;
                    totalDeaths += parseInt(row.Muertes) || 0;
                    totalAssists += parseInt(row.Asistencias) || 0;
                    totalDamage += parseInt(row['DÑO infligido']) || 0;
                    totalGold += parseInt(row['Oro total']) || 0;
                    totalParticipation += parseInt(row.Participación) || 0;
                    totalCrowdControl += parseInt(row['Control de masas']) || 0;
                    totalTowerDamage += parseInt(row['DÑO a las torres']) || 0;
                    playerInMatch = true;
                }
            });
            
            if (playerInMatch) matchCount++;
        });
        
        if (matchCount === 0) return null;
        
        return {
            kills: totalKills,
            deaths: totalDeaths,
            assists: totalAssists,
            damage: totalDamage / matchCount, // Average damage per match
            gold: totalGold / matchCount,
            participation: totalParticipation / matchCount,
            crowdControl: totalCrowdControl / matchCount,
            towerDamage: totalTowerDamage / matchCount,
            matches: matchCount,
            kda: this.calculateKDA(totalKills, totalDeaths, totalAssists)
        };
    }

    // Calculate KDA ratio
    calculateKDA(kills, deaths, assists) {
        if (deaths === 0) return (kills + assists).toFixed(2);
        return ((kills + assists) / deaths).toFixed(2);
    }

    // Update featured players display
    updateFeaturedPlayersDisplay() {
        this.updatePhasePlayers('cuartos');
        this.updatePhasePlayers('semifinal');
        this.updatePhasePlayers('final');
    }

    // Update players for a specific phase
    updatePhasePlayers(phase) {
        const container = document.getElementById(`${phase}-players`);
        const players = this.topPlayersByPhase[phase];
        
        if (players.length === 0) {
            container.innerHTML = '<p class="no-players">No hay datos disponibles para esta fase.</p>';
            return;
        }
        
        let html = '';
        players.forEach((player, index) => {
            const rank = index + 1;
            const rankClass = this.getRankClass(rank);
            
            html += `
                <div class="featured-player-card glass fade-in">
                    <div class="player-rank ${rankClass}">#${rank}</div>
                    <div class="player-image-container">
                        <img src="${this.getPlayerImage(player.name)}" alt="${player.name}" class="player-image" onerror="this.src='/assets/logos/default_logo.png'">
                    </div>
                    <div class="player-info">
                        <h3 class="player-name">${player.name}</h3>
                        <div class="player-criteria">
                            <span class="criteria-badge elimination-badge">${player.stats.kills} Eliminaciones</span>
                            <span class="criteria-badge damage-badge">${Math.round(player.stats.damage).toLocaleString()} Daño</span>
                            <span class="criteria-badge assist-badge">${player.stats.assists} Asistencias</span>
                        </div>
                        <div class="player-stats-grid">
                            <div class="player-stat">
                                <div class="player-stat-value">${player.stats.kills}</div>
                                <div class="player-stat-label">Eliminaciones</div>
                            </div>
                            <div class="player-stat">
                                <div class="player-stat-value">${Math.round(player.stats.damage).toLocaleString()}</div>
                                <div class="player-stat-label">Daño/Promedio</div>
                            </div>
                            <div class="player-stat">
                                <div class="player-stat-value">${player.stats.assists}</div>
                                <div class="player-stat-label">Asistencias</div>
                            </div>
                            <div class="player-stat">
                                <div class="player-stat-value">${player.stats.kda}</div>
                                <div class="player-stat-label">KDA</div>
                            </div>
                        </div>
                        <div class="player-additional-stats">
                            <span class="additional-stat">Partidos: ${player.stats.matches}</span>
                            <span class="additional-stat">Participación: ${Math.round(player.stats.participation)}%</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    // Get rank class for styling
    getRankClass(rank) {
        if (rank === 1) return 'rank-gold';
        if (rank === 2) return 'rank-silver';
        if (rank === 3) return 'rank-bronze';
        return 'rank-other';
    }

    // Update stats summary
    updateStatsSummary() {
        const summaryContainer = document.getElementById('stats-summary');
        const stats = this.calculateOverallStats();
        
        summaryContainer.innerHTML = `
            <div class="summary-stat">
                <div class="summary-stat-value">${stats.totalPlayers}</div>
                <div class="summary-stat-label">Jugadores Totales</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value">${stats.totalMatches}</div>
                <div class="summary-stat-label">Partidos Analizados</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value">${stats.topEliminations}</div>
                <div class="summary-stat-label">Mayor Eliminaciones</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value">${Math.round(stats.topDamage).toLocaleString()}</div>
                <div class="summary-stat-label">Mayor Daño/Promedio</div>
            </div>
            <div class="summary-stat">
                <div class="summary-stat-value">${stats.topAssists}</div>
                <div class="summary-stat-label">Mayor Asistencias</div>
            </div>
        `;
    }

    // Calculate overall statistics
    calculateOverallStats() {
        let totalMatches = 0;
        Object.values(this.data).forEach(phase => {
            totalMatches += Object.keys(phase).length;
        });
        
        const totalPlayers = this.uniquePlayers.size;
        
        // Find top stats across all phases
        let topEliminations = 0;
        let topDamage = 0;
        let topAssists = 0;
        
        Object.values(this.topPlayersByPhase).forEach(phasePlayers => {
            if (phasePlayers.length > 0) {
                // First player in each phase is already sorted by criteria
                const topPlayer = phasePlayers[0];
                if (topPlayer.stats.kills > topEliminations) {
                    topEliminations = topPlayer.stats.kills;
                }
                if (topPlayer.stats.damage > topDamage) {
                    topDamage = topPlayer.stats.damage;
                }
                if (topPlayer.stats.assists > topAssists) {
                    topAssists = topPlayer.stats.assists;
                }
            }
        });
        
        return {
            totalPlayers: totalPlayers,
            totalMatches: totalMatches,
            topEliminations: topEliminations,
            topDamage: topDamage,
            topAssists: topAssists
        };
    }

    // Update presentation featured players
    updatePresentationFeaturedPlayers() {
        const container = document.getElementById('presentation-featured-players');
        let html = '';
        
        // Show top 3 from each phase
        const phases = ['cuartos', 'semifinal', 'final'];
        const phaseNames = {
            cuartos: 'Cuartos de Final',
            semifinal: 'Semifinal',
            final: 'Final'
        };
        
        phases.forEach(phase => {
            const topPlayers = this.topPlayersByPhase[phase].slice(0, 3);
            
            if (topPlayers.length > 0) {
                html += `
                    <div class="presentation-phase">
                        <h3 class="presentation-phase-title">${phaseNames[phase]}</h3>
                        <div class="presentation-players">
                `;
                
                topPlayers.forEach((player, index) => {
                    const rank = index + 1;
                    html += `
                        <div class="presentation-player ${this.getRankClass(rank)}">
                            <div class="presentation-player-rank">#${rank}</div>
                            <div class="presentation-player-info">
                                <div class="presentation-player-name">${player.name}</div>
                                <div class="presentation-player-stats">
                                    <span class="presentation-stat">${player.stats.kills} Elim</span>
                                    <span class="presentation-stat">${Math.round(player.stats.damage).toLocaleString()} Daño</span>
                                    <span class="presentation-stat">${player.stats.assists} Asist</span>
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
        });
        
        container.innerHTML = html;
    }

    // Get player image path
    getPlayerImage(playerName) {
        // Player images should be stored in /assets/players/
        const cleanName = playerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `/assets/players/${cleanName}.png`;
    }

    // Hide loading indicator
    hideLoadingIndicator() {
        document.getElementById('loading-indicator').style.display = 'none';
    }

    // Show error message
    showError(message) {
        // Simple error display
        alert(message);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FeaturedPlayersDashboard();
});

// Fallback for missing player images
window.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.src.includes('/assets/players/')) {
        e.target.src = '/assets/logos/default_logo.png';
    }
}, true);