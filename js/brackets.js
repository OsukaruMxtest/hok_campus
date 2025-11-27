// Brackets Page
class BracketsPage {
    constructor() {
        this.data = {
            cuartos: {},
            semifinal: {},
            final: {}
        };
        this.currentPhase = 'all';
        this.zoomLevel = 1;
        this.uniqueTeams = new Set();
        
        this.init();
    }

    async init() {
        await this.loadAllData();
        this.processUniqueData();
        this.setupEventListeners();
        this.renderBracket();
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
        const phasePath = `data/${phase}/`;
        const fileNames = this.getFileNamesForPhase(phase);
        
        for (const fileName of fileNames) {
            try {
                const filePath = `${phasePath}${fileName}`;
                const csvData = await this.loadCSV(filePath);
                this.data[phase][fileName] = this.parseCSV(csvData);
            } catch (error) {
                console.warn(`Could not load file: ${fileName}`, error);
            }
        }
    }

    getFileNamesForPhase(phase) {
        const fileMap = {
            cuartos: ['Q1M1.csv', 'Q1M2.csv', 'Q2M1.csv', 'Q2M2.csv', 'Q3M1.csv', 'Q3M2.csv', 'Q4M1.csv', 'Q4M2.csv'],
            semifinal: ['S1M1.csv', 'S1M2.csv', 'S2M1.csv', 'S2M2.csv'],
            final: ['FM1.csv', 'FM2.csv', 'FM3.csv', 'FM4.csv', 'FM5.csv']
        };
        return fileMap[phase] || [];
    }

    async loadCSV(filePath) {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Failed to fetch CSV: ${filePath}`);
        }
        return await response.text();
    }

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

    // Process unique teams
    processUniqueData() {
        this.uniqueTeams.clear();
        
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(matchData => {
                matchData.forEach(row => {
                    if (row.EQUIPO) this.uniqueTeams.add(row.EQUIPO);
                });
            });
        });
    }

    setupEventListeners() {
        // Phase buttons
        document.querySelectorAll('.phase-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setActivePhase(e.target.dataset.phase);
            });
        });

        // Zoom controls
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoomOut();
        });

        document.getElementById('reset-view').addEventListener('click', () => {
            this.resetView();
        });

        // Presentation mode
        document.getElementById('presentation-mode-toggle').addEventListener('click', () => {
            this.togglePresentationMode();
        });

        // Navigation toggle
        document.getElementById('nav-toggle').addEventListener('click', () => {
            this.toggleNavigation();
        });

        // Close match details
        document.getElementById('close-match-details').addEventListener('click', () => {
            this.closeMatchDetails();
        });

        // Close presentation mode on click
        document.getElementById('presentation-overlay').addEventListener('click', () => {
            this.togglePresentationMode();
        });
    }

    toggleNavigation() {
        document.querySelector('.nav-menu').classList.toggle('active');
    }

    setActivePhase(phase) {
        this.currentPhase = phase;
        
        // Update active button
        document.querySelectorAll('.phase-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`.phase-btn[data-phase="${phase}"]`).classList.add('active');
        
        this.renderBracket();
    }

    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2);
        this.updateZoom();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.5);
        this.updateZoom();
    }

    resetView() {
        this.zoomLevel = 1;
        this.updateZoom();
    }

    updateZoom() {
        const bracket = document.getElementById('bracket-visualization');
        bracket.style.transform = `scale(${this.zoomLevel})`;
    }

    togglePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        overlay.classList.toggle('active');
        
        if (overlay.classList.contains('active')) {
            this.updatePresentationBracket();
        }
    }

    closeMatchDetails() {
        document.getElementById('match-details-panel').classList.remove('active');
    }

    renderBracket() {
        const bracketContainer = document.getElementById('bracket-visualization');
        bracketContainer.innerHTML = '';
        
        if (this.currentPhase === 'all') {
            this.renderAllPhases();
        } else {
            this.renderSinglePhase(this.currentPhase);
        }
    }

    renderAllPhases() {
        const bracketContainer = document.getElementById('bracket-visualization');
        
        const phases = [
            { name: 'cuartos', title: 'Cuartos de Final' },
            { name: 'semifinal', title: 'Semifinal' },
            { name: 'final', title: 'Final' }
        ];
        
        phases.forEach(phase => {
            const phaseSection = this.createPhaseSection(phase.name, phase.title);
            bracketContainer.appendChild(phaseSection);
        });
    }

    renderSinglePhase(phase) {
        const bracketContainer = document.getElementById('bracket-visualization');
        const phaseTitle = {
            cuartos: 'Cuartos de Final',
            semifinal: 'Semifinal',
            final: 'Final'
        }[phase];
        
        const phaseSection = this.createPhaseSection(phase, phaseTitle);
        bracketContainer.appendChild(phaseSection);
    }

    createPhaseSection(phase, title) {
        const phaseDiv = document.createElement('div');
        phaseDiv.className = 'bracket-phase';
        
        const phaseTitle = document.createElement('h3');
        phaseTitle.textContent = title;
        phaseDiv.appendChild(phaseTitle);
        
        const matchesDiv = document.createElement('div');
        matchesDiv.className = 'bracket-matches';
        
        const matches = Object.entries(this.data[phase]);
        matches.forEach(([matchKey, matchData]) => {
            const matchElement = this.createMatchElement(matchKey, matchData, phase);
            matchesDiv.appendChild(matchElement);
        });
        
        phaseDiv.appendChild(matchesDiv);
        return phaseDiv;
    }

    createMatchElement(matchKey, matchData, phase) {
        const matchDiv = document.createElement('div');
        matchDiv.className = 'bracket-match-large glass';
        
        const winner = this.determineMatchWinner(matchData);
        const teams = [...new Set(matchData.map(row => row.EQUIPO))];
        
        matchDiv.innerHTML = `
            <div class="match-header">
                <h4>${this.formatMatchName(matchKey, phase)}</h4>
                <span class="match-winner">Ganador: ${winner || 'Por definir'}</span>
            </div>
            <div class="bracket-match-teams">
                ${teams.map(team => {
                    const teamStats = this.calculateTeamStatsInMatch(team, matchData);
                    const isWinner = team === winner;
                    return `
                        <div class="bracket-team ${isWinner ? 'winner' : ''}">
                            <img src="${this.getTeamLogo(team)}" alt="${team}" class="bracket-team-logo" onerror="this.src='/assets/logos/default_logo.png'">
                            <span class="bracket-team-name">${team}</span>
                            <span class="bracket-team-score">${teamStats.wins}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        matchDiv.addEventListener('click', () => {
            this.showMatchDetails(matchKey, matchData, phase);
        });
        
        return matchDiv;
    }

    showMatchDetails(matchKey, matchData, phase) {
        const winner = this.determineMatchWinner(matchData);
        const teams = [...new Set(matchData.map(row => row.EQUIPO))];
        
        const detailsContent = document.getElementById('match-details-content');
        detailsContent.innerHTML = `
            <div class="match-detail-header">
                <h4>${this.formatMatchName(matchKey, phase)}</h4>
                <p class="match-phase">${this.getPhaseName(phase)}</p>
                ${winner ? `<p class="match-winner-badge">Ganador: ${winner}</p>` : ''}
            </div>
            
            <div class="match-teams-detail">
                ${teams.map(team => {
                    const teamPlayers = this.getPlayersByTeamInMatch(team, matchData);
                    const teamStats = this.calculateTeamStatsInMatch(team, matchData);
                    const isWinner = team === winner;
                    
                    return `
                        <div class="match-team-detail ${isWinner ? 'winner' : ''}">
                            <div class="team-detail-header">
                                <img src="${this.getTeamLogo(team)}" alt="${team}" class="team-detail-logo" onerror="this.src='/assets/logos/default_logo.png'">
                                <div>
                                    <h5>${team}</h5>
                                    <p>Victorias en el match: ${teamStats.wins}</p>
                                </div>
                            </div>
                            <div class="team-players-detail">
                                <h6>Jugadores</h6>
                                ${teamPlayers.map(player => {
                                    const playerData = this.getPlayerDataInMatch(player, matchData);
                                    return `
                                        <div class="player-match-stats">
                                            <span class="player-name">${player}</span>
                                            <div class="player-match-numbers">
                                                <span>K: ${playerData.Eliminaciones}</span>
                                                <span>D: ${playerData.Muertes}</span>
                                                <span>A: ${playerData.Asistencias}</span>
                                                <span>Daño: ${parseInt(playerData['DÑO infligido']).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="match-stats-overview">
                <h5>Estadísticas del Match</h5>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-value">${matchData.length}</span>
                        <span class="stat-label">Filas de datos</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${teams.length}</span>
                        <span class="stat-label">Equipos</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${new Set(matchData.map(row => row.JUGADOR)).size}</span>
                        <span class="stat-label">Jugadores</span>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('match-details-panel').classList.add('active');
    }

    updatePresentationBracket() {
        const presentationBracket = document.getElementById('presentation-bracket');
        const finalMatches = Object.entries(this.data.final);
        
        if (finalMatches.length === 0) {
            presentationBracket.innerHTML = '<p>No hay datos de la final disponibles.</p>';
            return;
        }
        
        presentationBracket.innerHTML = `
            <div class="presentation-finals">
                <h3>Fase Final</h3>
                ${finalMatches.map(([matchKey, matchData]) => {
                    const winner = this.determineMatchWinner(matchData);
                    const teams = [...new Set(matchData.map(row => row.EQUIPO))];
                    
                    return `
                        <div class="presentation-match glass">
                            <h4>${this.formatMatchName(matchKey, 'final')}</h4>
                            <div class="presentation-teams">
                                ${teams.map(team => `
                                    <div class="presentation-team ${team === winner ? 'winner' : ''}">
                                        <img src="${this.getTeamLogo(team)}" alt="${team}" class="presentation-team-logo" onerror="this.src='/assets/logos/default_logo.png'">
                                        <span>${team}</span>
                                    </div>
                                `).join('')}
                            </div>
                            ${winner ? `<p class="presentation-winner">Ganador: ${winner}</p>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // Utility methods
    determineMatchWinner(matchData) {
        const winners = matchData.map(row => row.GANADOR).filter(winner => winner);
        
        if (winners.length === 0) return null;
        
        const winnerCount = {};
        winners.forEach(winner => {
            winnerCount[winner] = (winnerCount[winner] || 0) + 1;
        });
        
        let maxCount = 0;
        let matchWinner = null;
        for (const [team, count] of Object.entries(winnerCount)) {
            if (count > maxCount) {
                maxCount = count;
                matchWinner = team;
            }
        }
        
        return matchWinner;
    }

    formatMatchName(matchKey, phase) {
        const match = matchKey.match(/([QSF])(\d+)M(\d+)/);
        if (!match) return matchKey;
        
        const phaseCode = match[1];
        const bracketNum = match[2];
        const matchNum = match[3];
        
        const phaseNames = {
            'Q': 'Cuartos',
            'S': 'Semifinal',
            'F': 'Final'
        };
        
        return `${phaseNames[phaseCode] || 'Fase'} ${bracketNum} - Partido ${matchNum}`;
    }

    getPhaseName(phase) {
        const phaseNames = {
            cuartos: 'Cuartos de Final',
            semifinal: 'Semifinal',
            final: 'Final'
        };
        return phaseNames[phase] || phase;
    }

    calculateTeamStatsInMatch(teamName, matchData) {
        let wins = 0;
        const teamRows = matchData.filter(row => row.EQUIPO === teamName);
        
        // Count wins for this team in this match
        const winners = matchData.map(row => row.GANADOR).filter(winner => winner);
        const winnerCount = {};
        winners.forEach(winner => {
            winnerCount[winner] = (winnerCount[winner] || 0) + 1;
        });
        
        wins = winnerCount[teamName] || 0;
        
        return {
            wins: wins,
            playerCount: new Set(teamRows.map(row => row.JUGADOR)).size
        };
    }

    getPlayersByTeamInMatch(teamName, matchData) {
        const players = new Set();
        matchData.forEach(row => {
            if (row.EQUIPO === teamName && row.JUGADOR) {
                players.add(row.JUGADOR);
            }
        });
        return Array.from(players);
    }

    getPlayerDataInMatch(playerName, matchData) {
        for (const row of matchData) {
            if (row.JUGADOR === playerName) {
                return row;
            }
        }
        return null;
    }

    getTeamLogo(teamName) {
        const cleanName = teamName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `/assets/logos/${cleanName}.png`;
    }
}

// Initialize brackets page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BracketsPage();

});
