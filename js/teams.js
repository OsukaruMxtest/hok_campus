// Teams and Players Page
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
        
        this.init();
    }

    async init() {
        await this.loadAllData();
        this.processUniqueData();
        this.setupEventListeners();
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

    // Format number with comma as thousands separator
    formatNumber(n) {
        return Number(n).toLocaleString('en-US');
    }

    // Process unique teams and players, handling name changes
    processUniqueData() {
        this.allTeams.clear();
        this.allPlayers.clear();
        
        // Primera pasada: recolectar todos los nombres
        const allTeamNames = new Set();
        const allPlayerNames = new Set();
        
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(matchData => {
                matchData.forEach(row => {
                    if (row.EQUIPO) allTeamNames.add(row.EQUIPO);
                    if (row.JUGADOR) allPlayerNames.add(row.JUGADOR);
                });
            });
        });

        // Segunda pasada: usar los nombres más recientes (más frecuentes)
        const teamCount = {};
        const playerCount = {};
        
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(matchData => {
                matchData.forEach(row => {
                    if (row.EQUIPO) {
                        teamCount[row.EQUIPO] = (teamCount[row.EQUIPO] || 0) + 1;
                    }
                    if (row.JUGADOR) {
                        playerCount[row.JUGADOR] = (playerCount[row.JUGADOR] || 0) + 1;
                    }
                });
            });
        });

        // Para equipos: usar el nombre más frecuente
        Object.keys(teamCount).forEach(team => {
            this.allTeams.add(team);
        });

        // Para jugadores: usar el nombre más frecuente
        Object.keys(playerCount).forEach(player => {
            this.allPlayers.add(player);
        });

        this.filteredTeams = Array.from(this.allTeams);
        this.filteredPlayers = Array.from(this.allPlayers);
    }

    setupEventListeners() {
        // Team search
        document.getElementById('team-search').addEventListener('input', (e) => {
            this.filterTeamsAndPlayers(e.target.value);
        });

        // Presentation mode
        document.getElementById('presentation-mode-toggle').addEventListener('click', () => {
            this.togglePresentationMode();
        });

        // Navigation toggle
        document.getElementById('nav-toggle').addEventListener('click', () => {
            this.toggleNavigation();
        });

        // Close presentation mode on click
        document.getElementById('presentation-overlay').addEventListener('click', () => {
            this.togglePresentationMode();
        });
    }

    toggleNavigation() {
        document.querySelector('.nav-menu').classList.toggle('active');
    }

    togglePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        overlay.classList.toggle('active');
        
        if (overlay.classList.contains('active')) {
            this.updatePresentationTeams();
        }
    }

    filterTeamsAndPlayers(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        
        if (term === '') {
            this.filteredTeams = Array.from(this.allTeams);
            this.filteredPlayers = Array.from(this.allPlayers);
        } else {
            this.filteredTeams = Array.from(this.allTeams).filter(team => 
                team.toLowerCase().includes(term)
            );
            
            this.filteredPlayers = Array.from(this.allPlayers).filter(player => 
                player.toLowerCase().includes(term)
            );
        }
        
        this.displayFilteredResults();
    }

    displayAllTeams() {
        const teamsGrid = document.getElementById('teams-grid');
        teamsGrid.innerHTML = '';
        
        Array.from(this.allTeams).forEach(team => {
            const teamCard = this.createTeamCard(team);
            teamsGrid.appendChild(teamCard);
        });
    }

    displayFilteredResults() {
        const teamsGrid = document.getElementById('teams-grid');
        teamsGrid.innerHTML = '';
        
        if (this.filteredTeams.length === 0 && this.filteredPlayers.length === 0) {
            teamsGrid.innerHTML = '<p class="no-results">No se encontraron equipos o jugadores que coincidan con la búsqueda.</p>';
            return;
        }
        
        // Show teams first
        this.filteredTeams.forEach(team => {
            const teamCard = this.createTeamCard(team);
            teamsGrid.appendChild(teamCard);
        });
        
        // Then show individual players that match but aren't in filtered teams
        const playersWithoutTeams = this.filteredPlayers.filter(player => {
            const playerData = this.getPlayerData(player);
            return playerData && !this.filteredTeams.includes(playerData.EQUIPO);
        });
        
        playersWithoutTeams.forEach(player => {
            const playerCard = this.createPlayerCard(player);
            teamsGrid.appendChild(playerCard);
        });
    }

    createTeamCard(teamName) {
        const teamData = this.getTeamData(teamName);
        const teamPlayers = this.getPlayersByTeam(teamName);
        const teamStats = this.calculateTeamAccumulatedStats(teamName);
        
        const teamCard = document.createElement('div');
        teamCard.className = 'team-card glass fade-in';
        
        teamCard.innerHTML = `
            <div class="team-card-header">
                <img src="${this.getTeamLogo(teamName)}" alt="${teamName}" class="team-card-logo" onerror="this.src='/assets/logos/default_logo.png'">
                <h3 class="team-card-name">${teamName}</h3>
            </div>
            <div class="team-card-stats">
                <div class="team-stat">
                    <div class="team-stat-value">${this.getTeamWins(teamName)}</div>
                    <div class="team-stat-label">Victorias</div>
                </div>
                <div class="team-stat">
                    <div class="team-stat-value">${teamStats.matches}</div>
                    <div class="team-stat-label">Partidos</div>
                </div>
                <div class="team-stat">
                    <div class="team-stat-value">${this.calculateTeamKDA(teamName)}</div>
                    <div class="team-stat-label">KDA</div>
                </div>
                <div class="team-stat">
                    <div class="team-stat-value">${this.calculateTeamDamage(teamName)}</div>
                    <div class="team-stat-label">Daño/Promedio</div>
                </div>
                <div class="team-stat">
                    <div class="team-stat-value">${this.calculateTeamGold(teamName)}</div>
                    <div class="team-stat-label">Oro/Promedio</div>
                </div>
            </div>
            <div class="players-list">
                <h4>Jugadores (${teamPlayers.length})</h4>
                ${teamPlayers.slice(0, 3).map(player => this.createPlayerItem(player)).join('')}
                ${teamPlayers.length > 3 ? `<div class="more-players">+${teamPlayers.length - 3} más</div>` : ''}
            </div>
        `;
        
        teamCard.addEventListener('click', () => {
            this.showTeamDetail(teamName);
        });
        
        return teamCard;
    }

    createPlayerCard(playerName) {
        const playerData = this.getPlayerData(playerName);
        if (!playerData) return '';
        
        const playerStats = this.getPlayerAccumulatedStats(playerName);
        
        const playerCard = document.createElement('div');
        playerCard.className = 'team-card glass fade-in';
        
        playerCard.innerHTML = `
            <div class="team-card-header">
                <img src="${this.getPlayerImage(playerName)}" alt="${playerName}" class="team-card-logo" onerror="this.src='/assets/logos/default_logo.png'">
                <h3 class="team-card-name">${playerName}</h3>
            </div>
            <div class="team-card-stats">
                <div class="team-stat">
                    <div class="team-stat-value">${playerStats.matches}</div>
                    <div class="team-stat-label">Partidos</div>
                </div>
                <div class="team-stat">
                    <div class="team-stat-value">${playerStats.kills}</div>
                    <div class="team-stat-label">Eliminaciones</div>
                </div>
                <div class="team-stat">
                    <div class="team-stat-value">${playerStats.assists}</div>
                    <div class="team-stat-label">Asistencias</div>
                </div>
                <div class="team-stat">
                    <div class="team-stat-value">${this.formatNumber(Math.round(playerStats.avgDamage))}</div>
                    <div class="team-stat-label">Daño/Promedio</div>
                </div>
            </div>
            <div class="players-list">
                <h4>Equipo: ${playerData.EQUIPO}</h4>
                <div class="player-item">
                    <div class="player-name">${playerName}</div>
                    <div class="player-stats">
                        <div class="player-stat">K: ${playerData.Eliminaciones}</div>
                        <div class="player-stat">D: ${playerData.Muertes}</div>
                        <div class="player-stat">A: ${playerData.Asistencias}</div>
                    </div>
                </div>
            </div>
        `;
        
        playerCard.addEventListener('click', () => {
            this.showPlayerDetail(playerName);
        });
        
        return playerCard;
    }

    createPlayerItem(playerName) {
        const playerData = this.getPlayerData(playerName);
        if (!playerData) return '';
        
        return `
            <div class="player-item">
                <div class="player-name">${playerName}</div>
                <div class="player-stats">
                    <div class="player-stat">K: ${playerData.Eliminaciones}</div>
                    <div class="player-stat">D: ${playerData.Muertes}</div>
                    <div class="player-stat">A: ${playerData.Asistencias}</div>
                </div>
            </div>
        `;
    }

    showTeamDetail(teamName) {
        const teamData = this.getTeamData(teamName);
        const teamPlayers = this.getPlayersByTeam(teamName);
        const teamStats = this.calculateTeamAccumulatedStats(teamName);
        
        const playerDetailView = document.getElementById('player-detail-view');
        
        playerDetailView.innerHTML = `
            <div class="team-detail glass">
                <div class="team-detail-header">
                    <img src="${this.getTeamLogo(teamName)}" alt="${teamName}" class="team-detail-logo" onerror="this.src='/assets/logos/default_logo.png'">
                    <div>
                        <h2 class="team-detail-name">${teamName}</h2>
                        <p>Victorias: ${this.getTeamWins(teamName)} | Partidos: ${teamStats.matches}</p>
                    </div>
                </div>
                <div class="team-detail-stats">
                    <div class="detail-stats-grid">
                        <div class="detail-stat">
                            <div class="detail-stat-value">${teamStats.kills}</div>
                            <div class="detail-stat-label">Eliminaciones Totales</div>
                        </div>
                        <div class="detail-stat">
                            <div class="detail-stat-value">${teamStats.assists}</div>
                            <div class="detail-stat-label">Asistencias Totales</div>
                        </div>
                        <div class="detail-stat">
                            <div class="detail-stat-value">${this.calculateTeamKDA(teamName)}</div>
                            <div class="detail-stat-label">KDA Ratio</div>
                        </div>
                        <div class="detail-stat">
                            <div class="detail-stat-value">${this.formatNumber(Math.round(teamStats.avgDamage))}</div>
                            <div class="detail-stat-label">Daño Promedio</div>
                        </div>
                        <div class="detail-stat">
                            <div class="detail-stat-value">${this.formatNumber(Math.round(teamStats.avgGold))}</div>
                            <div class="detail-stat-label">Oro Promedio</div>
                        </div>
                        <div class="detail-stat">
                            <div class="detail-stat-value">${Math.round(teamStats.avgParticipation)}%</div>
                            <div class="detail-stat-label">Participación</div>
                        </div>
                    </div>
                </div>
                <div class="team-players-list">
                    <h3 class="team-players-title">Jugadores del Equipo</h3>
                    ${teamPlayers.map(player => {
                        const pData = this.getPlayerData(player);
                        const pStats = this.getPlayerAccumulatedStats(player);
                        const canvasId = `player-chart-${player.replace(/[^a-zA-Z0-9]/g, '-')}`;
                        return `
                            <div class="player-detail-item glass" data-player="${player}">
                                <div class="player-detail-header">
                                    <img src="${this.getPlayerImage(player)}" alt="${player}" class="player-detail-image" onerror="this.src='/assets/logos/default_logo.png'">
                                    <div>
                                        <h4>${player}</h4>
                                        <p>Partidos: ${pStats.matches} | KDA: ${((pStats.kills + pStats.assists) / Math.max(pStats.deaths, 1)).toFixed(2)}</p>
                                    </div>
                                </div>
                                <div class="player-detail-content">
                                    <div class="player-detail-stats">
                                        <div class="detail-stats-grid">
                                            <div class="detail-stat">
                                                <div class="detail-stat-value">${pStats.kills}</div>
                                                <div class="detail-stat-label">Eliminaciones</div>
                                            </div>
                                            <div class="detail-stat">
                                                <div class="detail-stat-value">${pStats.deaths}</div>
                                                <div class="detail-stat-label">Muertes</div>
                                            </div>
                                            <div class="detail-stat">
                                                <div class="detail-stat-value">${pStats.assists}</div>
                                                <div class="detail-stat-label">Asistencias</div>
                                            </div>
                                            <div class="detail-stat">
                                                <div class="detail-stat-value">${this.formatNumber(Math.round(pStats.avgDamage))}</div>
                                                <div class="detail-stat-label">Daño Promedio</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="player-mini-chart-container">
                                        <canvas id="${canvasId}" class="player-mini-chart"></canvas>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        
        // Add event listeners to player items
        playerDetailView.querySelectorAll('.player-detail-item').forEach(item => {
            item.addEventListener('click', () => {
                const playerName = item.dataset.player;
                this.showPlayerDetail(playerName);
            });
        });
        
        // Initialize mini charts for each player
        setTimeout(() => {
            teamPlayers.forEach(player => {
                const canvasId = `player-chart-${player.replace(/[^a-zA-Z0-9]/g, '-')}`;
                this.createPlayerRadarChart(canvasId, player, teamName);
            });
        }, 100);
        
        // Scroll to detail view
        playerDetailView.scrollIntoView({ behavior: 'smooth' });
    }

    calculatePlayerContribution(playerName, teamName) {
        const playerStats = this.getPlayerAccumulatedStats(playerName);
        const teamStats = this.calculateTeamAccumulatedStats(teamName);
        
        // Calcular el porcentaje de aporte del jugador en relación al equipo
        const killsPercent = teamStats.kills > 0 ? (playerStats.kills / teamStats.kills) * 100 : 0;
        const assistsPercent = teamStats.assists > 0 ? (playerStats.assists / teamStats.assists) * 100 : 0;
        const damagePercent = teamStats.avgDamage > 0 ? ((playerStats.avgDamage * playerStats.matches) / (teamStats.avgDamage * teamStats.matches)) * 100 : 0;
        
        return {
            kills: killsPercent,
            assists: assistsPercent,
            damage: damagePercent
        };
    }

    createPlayerRadarChart(canvasId, playerName, teamName) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    const contribution = this.calculatePlayerContribution(playerName, teamName);
    const playerStats = this.getPlayerAccumulatedStats(playerName);
    
    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Eliminaciones', 'Asistencias', 'Daño'],
            datasets: [{
                label: 'Aporte (%)',
                data: [
                    Math.round(contribution.kills * 10) / 10,
                    Math.round(contribution.assists * 10) / 10,
                    Math.round(contribution.damage * 10) / 10
                ],
                backgroundColor: 'rgba(227, 114, 242, 0.15)',
                borderColor: 'rgba(227, 114, 242, 0.8)',
                pointBackgroundColor: 'rgba(227, 114, 242, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(227, 114, 242, 1)',
                pointRadius: 2, // Reducido de 3
                pointHoverRadius: 3 // Reducido de 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        display: false,
                        stepSize: 25
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    angleLines: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    pointLabels: {
                        color: 'white',
                        font: {
                            size: 9, // Reducido de 11
                            family: 'Poppins',
                            weight: '400' // Reducido de 500
                        },
                        padding: 8 // Reducido de 12
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            const stats = [
                                `${playerStats.kills} eliminaciones`,
                                `${playerStats.assists} asistencias`, 
                                `${Math.round(playerStats.avgDamage)} daño`
                            ];
                            return `${context.parsed.r}% del equipo`;
                        },
                        afterLabel: function(context) {
                            const stats = [
                                `${playerStats.kills} eliminaciones`,
                                `${playerStats.assists} asistencias`, 
                                `${Math.round(playerStats.avgDamage)} daño`
                            ];
                            return stats[context.dataIndex];
                        }
                    }
                }
            },
            elements: {
                line: {
                    tension: 0.1,
                    borderWidth: 1.5 // Reducido de 2
                }
            }
        }
    });
}

    showPlayerDetail(playerName) {
        const playerData = this.getPlayerData(playerName);
        const playerStats = this.getPlayerAccumulatedStats(playerName);
        
        const playerDetailView = document.getElementById('player-detail-view');
        
        playerDetailView.innerHTML = `
    <div class="player-detail glass">
        <div class="player-detail-header">
            <img src="${this.getPlayerImage(playerName)}" alt="${playerName}" class="player-detail-image" onerror="this.src='/assets/logos/default_logo.png'">
            <div>
                <h2 class="player-detail-name">${playerName}</h2>
                <p>Equipo: ${playerData.EQUIPO} | Partidos: ${playerStats.matches}</p>
            </div>
        </div>
        <div class="player-detail-content">
            <div class="player-detail-stats">
                <div class="detail-stats-grid">
                    <div class="detail-stat">
                        <div class="detail-stat-value">${playerStats.kills}</div>
                        <div class="detail-stat-label">Eliminaciones</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-value">${playerStats.deaths}</div>
                        <div class="detail-stat-label">Muertes</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-value">${playerStats.assists}</div>
                        <div class="detail-stat-label">Asistencias</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-value">${((playerStats.kills + playerStats.assists) / Math.max(playerStats.deaths, 1)).toFixed(2)}</div>
                        <div class="detail-stat-label">KDA Ratio</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-value">${this.formatNumber(Math.round(playerStats.avgDamage))}</div>
                        <div class="detail-stat-label">Daño Promedio</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-value">${this.formatNumber(Math.round(playerStats.avgGold))}</div>
                        <div class="detail-stat-label">Oro Promedio</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-value">${Math.round(playerStats.avgParticipation)}%</div>
                        <div class="detail-stat-label">Participación</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-value">${Math.round(playerStats.avgCrowdControl)}</div>
                        <div class="detail-stat-label">Control de Masas</div>
                    </div>
                    <div class="detail-stat">
                        <div class="detail-stat-value">${Math.round(playerStats.avgTowerDamage)}</div>
                        <div class="detail-stat-label">Daño a Torres</div>
                    </div>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="player-radar-chart"></canvas>
            </div>
        </div>
    </div>
`;
        
        // Update radar chart
        setTimeout(() => {
            this.updatePlayerRadarChart(playerName);
        }, 100);
        
        // Scroll to detail view
        playerDetailView.scrollIntoView({ behavior: 'smooth' });
    }

    updatePlayerRadarChart(playerName) {
    const ctx = document.getElementById('player-radar-chart');
    if (!ctx) return;
    
    const playerStats = this.getPlayerAccumulatedStats(playerName);
    
    // Normalize stats for radar chart (0-100 scale)
    const normalizedStats = {
        kills: Math.min(playerStats.avgKills / 10 * 100, 100),
        damage: Math.min(playerStats.avgDamage / 30000 * 100, 100),
        gold: Math.min(playerStats.avgGold / 15000 * 100, 100),
        participation: playerStats.avgParticipation,
        crowdControl: Math.min(playerStats.avgCrowdControl / 100 * 100, 100),
        towerDamage: Math.min(playerStats.avgTowerDamage / 5000 * 100, 100)
    };
    
    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Eliminaciones', 'Daño', 'Oro', 'Participación', 'Control de Masas', 'Daño a Torres'],
            datasets: [{
                label: playerName,
                data: [
                    normalizedStats.kills,
                    normalizedStats.damage,
                    normalizedStats.gold,
                    normalizedStats.participation,
                    normalizedStats.crowdControl,
                    normalizedStats.towerDamage
                ],
                backgroundColor: 'rgba(227, 114, 242, 0.2)',
                borderColor: 'rgba(227, 114, 242, 1)',
                pointBackgroundColor: 'rgba(227, 114, 242, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(227, 114, 242, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true, // Cambiado de false a true
            scales: {
                r: {
                    angleLines: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    pointLabels: {
                        color: 'white',
                        font: {
                            family: 'Poppins',
                            size: 11 // Tamaño ajustado para el nuevo tamaño
                        }
                    },
                    ticks: {
                        color: 'white',
                        backdropColor: 'transparent',
                        showLabelBackdrop: false
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: 'white',
                        font: {
                            family: 'Poppins'
                        }
                    }
                }
            }
        }
    });
}

    updatePresentationTeams() {
        const presentationTeams = document.getElementById('presentation-teams');
        const topTeams = Array.from(this.allTeams).slice(0, 6); // Show top 6 teams
        
        presentationTeams.innerHTML = `
            <div class="presentation-teams-grid">
                ${topTeams.map(team => {
                    const stats = this.calculateTeamAccumulatedStats(team);
                    return `
                        <div class="presentation-team glass">
                            <img src="${this.getTeamLogo(team)}" alt="${team}" class="presentation-team-logo" onerror="this.src='/assets/logos/default_logo.png'">
                            <h3>${team}</h3>
                            <p>Victorias: ${this.getTeamWins(team)}</p>
                            <div class="presentation-team-stats">
                                <span>KDA: ${this.calculateTeamKDA(team)}</span>
                                <span>Daño: ${this.formatNumber(Math.round(stats.avgDamage))}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // Utility methods
    getTeamData(teamName) {
        for (const phase of Object.values(this.data)) {
            for (const match of Object.values(phase)) {
                for (const row of match) {
                    if (row.EQUIPO === teamName) {
                        return row;
                    }
                }
            }
        }
        return null;
    }

    getPlayerData(playerName) {
        for (const phase of Object.values(this.data)) {
            for (const match of Object.values(phase)) {
                for (const row of match) {
                    if (row.JUGADOR === playerName) {
                        return row;
                    }
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
                    if (row.EQUIPO === teamName && row.JUGADOR) {
                        players.add(row.JUGADOR);
                    }
                });
            });
        });
        return Array.from(players);
    }

    getTeamLogo(teamName) {
        const cleanName = teamName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `/assets/logos/${cleanName}.png`;
    }

    getPlayerImage(playerName) {
        const cleanName = playerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `/assets/players/${cleanName}.png`;
    }

    getTeamWins(teamName) {
        let wins = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                const winners = match.map(row => row.GANADOR).filter(winner => winner);
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
                
                if (matchWinner === teamName) {
                    wins++;
                }
            });
        });
        return wins;
    }

    calculateTeamAccumulatedStats(teamName) {
        let matches = 0;
        let kills = 0;
        let deaths = 0;
        let assists = 0;
        let totalDamage = 0;
        let totalGold = 0;
        let totalParticipation = 0;
        let totalCrowdControl = 0;
        let totalTowerDamage = 0;
        
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                let teamInMatch = false;
                let matchKills = 0;
                let matchDamage = 0;
                let matchGold = 0;
                let matchParticipation = 0;
                let matchCrowdControl = 0;
                let matchTowerDamage = 0;
                
                match.forEach(row => {
                    if (row.EQUIPO === teamName) {
                        matchKills += parseInt(row.Eliminaciones) || 0;
                        deaths += parseInt(row.Muertes) || 0;
                        assists += parseInt(row.Asistencias) || 0;
                        matchDamage += parseInt(row['DÑO infligido']) || 0;
                        matchGold += parseInt(row['Oro total']) || 0;
                        matchParticipation += parseInt(row.Participación) || 0;
                        matchCrowdControl += parseInt(row['Control de masas']) || 0;
                        matchTowerDamage += parseInt(row['DÑO a las torres']) || 0;
                        teamInMatch = true;
                    }
                });
                
                if (teamInMatch) {
                    matches++;
                    kills += matchKills;
                    totalDamage += matchDamage;
                    totalGold += matchGold;
                    totalParticipation += matchParticipation / 5;
                    totalCrowdControl += matchCrowdControl / 5;
                    totalTowerDamage += matchTowerDamage / 5;
                }
            });
        });
        
        if (matches === 0) {
            return {
                matches: 0,
                kills: 0,
                deaths: 0,
                assists: 0,
                avgKills: 0,
                avgDamage: 0,
                avgGold: 0,
                avgParticipation: 0,
                avgCrowdControl: 0,
                avgTowerDamage: 0
            };
        }
        
        return {
            matches: matches,
            kills: kills,
            deaths: deaths,
            assists: assists,
            avgKills: kills / matches,
            avgDamage: totalDamage / matches,
            avgGold: totalGold / matches,
            avgParticipation: totalParticipation / matches,
            avgCrowdControl: totalCrowdControl / matches,
            avgTowerDamage: totalTowerDamage / matches
        };
    }

    getPlayerAccumulatedStats(playerName) {
        let matches = 0;
        let kills = 0;
        let deaths = 0;
        let assists = 0;
        let totalDamage = 0;
        let totalGold = 0;
        let totalParticipation = 0;
        let totalCrowdControl = 0;
        let totalTowerDamage = 0;
        
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                let playerInMatch = false;
                
                match.forEach(row => {
                    if (row.JUGADOR === playerName) {
                        kills += parseInt(row.Eliminaciones) || 0;
                        deaths += parseInt(row.Muertes) || 0;
                        assists += parseInt(row.Asistencias) || 0;
                        totalDamage += parseInt(row['DÑO infligido']) || 0;
                        totalGold += parseInt(row['Oro total']) || 0;
                        totalParticipation += parseInt(row.Participación) || 0;
                        totalCrowdControl += parseInt(row['Control de masas']) || 0;
                        totalTowerDamage += parseInt(row['DÑO a las torres']) || 0;
                        playerInMatch = true;
                    }
                });
                
                if (playerInMatch) matches++;
            });
        });
        
        if (matches === 0) {
            return {
                matches: 0,
                kills: 0,
                deaths: 0,
                assists: 0,
                avgKills: 0,
                avgDamage: 0,
                avgGold: 0,
                avgParticipation: 0,
                avgCrowdControl: 0,
                avgTowerDamage: 0
            };
        }
        
        return {
            matches: matches,
            kills: kills,
            deaths: deaths,
            assists: assists,
            avgKills: kills / matches,
            avgDamage: totalDamage / matches,
            avgGold: totalGold / matches,
            avgParticipation: totalParticipation / matches,
            avgCrowdControl: totalCrowdControl / matches,
            avgTowerDamage: totalTowerDamage / matches
        };
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
}

// Initialize teams page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TeamsPage();

});
