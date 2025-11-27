// Statistics Page
class StatsPage {
    constructor() {
        this.data = {
            cuartos: {},
            semifinal: {},
            final: {}
        };
        this.currentPhase = 'all';
        this.charts = {};
        this.uniqueTeams = new Set();
        this.uniquePlayers = new Set();
        
        this.init();
    }

    async init() {
        await this.loadAllData();
        this.processUniqueData();
        this.setupEventListeners();
        this.updateStatsTables();
        this.updateCharts();
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
        const phasePath = `/data/${phase}/`;
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

    // Process unique teams and players
    processUniqueData() {
        this.uniqueTeams.clear();
        this.uniquePlayers.clear();
        
        // Collect all unique names
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(matchData => {
                matchData.forEach(row => {
                    if (row.EQUIPO) this.uniqueTeams.add(row.EQUIPO);
                    if (row.JUGADOR) this.uniquePlayers.add(row.JUGADOR);
                });
            });
        });
    }

    setupEventListeners() {
        // Phase filter
        document.getElementById('stats-phase-filter').addEventListener('change', (e) => {
            this.currentPhase = e.target.value;
            this.updateStatsTables();
            this.updateCharts();
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
            this.updatePresentationStats();
        }
    }

    updateStatsTables() {
        this.updateTeamStatsTable();
        this.updatePlayerStatsTable();
    }

    updateTeamStatsTable() {
        const tableBody = document.querySelector('#team-stats-table tbody');
        const teams = Array.from(this.uniqueTeams);
        const teamStats = teams.map(team => this.calculateTeamStats(team));
        
        // Sort by wins descending
        teamStats.sort((a, b) => b.wins - a.wins);
        
        tableBody.innerHTML = teamStats.map(team => `
            <tr>
                <td>${team.name}</td>
                <td>${team.matches}</td>
                <td>${team.wins}</td>
                <td>${team.kda}</td>
                <td>${this.formatNumber(team.totalDamage)}</td>  <!-- TOTAL damage -->
                <td>${this.formatNumber(team.totalGold)}</td>    <!-- TOTAL gold -->
                <td>${team.avgParticipation.toFixed(1)}%</td>
            </tr>
        `).join('');
    }

    updatePlayerStatsTable() {
        const tableBody = document.querySelector('#player-stats-table tbody');
        const players = Array.from(this.uniquePlayers);
        const playerStats = players.map(player => this.calculatePlayerStats(player));
        
        // Sort by KDA descending
        playerStats.sort((a, b) => b.kda - a.kda);
        
        // Show top 20 players
        const topPlayers = playerStats.slice(0, 20);
        
        tableBody.innerHTML = topPlayers.map(player => `
            <tr>
                <td>${player.name}</td>
                <td>${player.team}</td>
                <td>${player.kda}</td>
                <td>${player.kills}</td>
                <td>${player.deaths}</td>
                <td>${player.assists}</td>
                <td>${this.formatNumber(player.totalDamage)}</td>  <!-- TOTAL damage -->
                <td>${this.formatNumber(player.totalGold)}</td>    <!-- TOTAL gold -->
            </tr>
        `).join('');
    }

    updateCharts() {
        this.updateKDAChart();
        this.updatePerformanceChart();
        this.updateDamageComparisonChart();
        this.updateGoldEfficiencyChart();
    }

    updateKDAChart() {
        const ctx = document.getElementById('kda-chart').getContext('2d');
        
        if (this.charts.kda) {
            this.charts.kda.destroy();
        }
        
        const teams = Array.from(this.uniqueTeams);
        const teamStats = teams.map(team => this.calculateTeamStats(team));
        
        // Sort by KDA and take top 8
        teamStats.sort((a, b) => b.kda - a.kda);
        const topTeams = teamStats.slice(0, 8);
        
        this.charts.kda = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topTeams.map(team => team.name),
                datasets: [{
                    label: 'KDA Ratio',
                    data: topTeams.map(team => team.kda),
                    backgroundColor: 'rgba(227, 114, 242, 0.7)',
                    borderColor: 'rgba(227, 114, 242, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                family: 'Poppins'
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                family: 'Poppins'
                            }
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
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `KDA: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    updatePerformanceChart() {
        const ctx = document.getElementById('performance-chart').getContext('2d');
        
        if (this.charts.performance) {
            this.charts.performance.destroy();
        }
        
        const phases = ['cuartos', 'semifinal', 'final'];
        const teams = Array.from(this.uniqueTeams).slice(0, 4); // Top 4 teams
        
        const datasets = teams.map(team => {
            const phaseData = phases.map(phase => {
                const stats = this.calculateTeamStatsForPhase(team, phase);
                return stats.totalDamage; // VALOR TOTAL de daño
            });
            
            return {
                label: team,
                data: phaseData,
                borderColor: this.getTeamColor(team),
                backgroundColor: this.getTeamColor(team, 0.1),
                tension: 0.4
            };
        });
        
        this.charts.performance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Cuartos', 'Semifinal', 'Final'],
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                family: 'Poppins'
                            },
                            callback: (value) => this.formatNumber(value)
                        },
                        title: {
                            display: true,
                            text: 'Daño Total',
                            color: 'white'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                family: 'Poppins'
                            }
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
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Daño Total: ${this.formatNumber(context.parsed.y)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    updateDamageComparisonChart() {
        const ctx = document.getElementById('damage-comparison-chart').getContext('2d');
        
        if (this.charts.damage) {
            this.charts.damage.destroy();
        }
        
        const teams = Array.from(this.uniqueTeams);
        const teamStats = teams.map(team => this.calculateTeamStats(team));
        
        // Sort by total damage and take top 6
        teamStats.sort((a, b) => b.totalDamage - a.totalDamage);
        const topTeams = teamStats.slice(0, 6);
        
        this.charts.damage = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topTeams.map(team => team.name),
                datasets: [
                    {
                        label: 'Daño Total',
                        data: topTeams.map(team => team.totalDamage),
                        backgroundColor: 'rgba(227, 114, 242, 0.7)',
                        borderColor: 'rgba(227, 114, 242, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Oro Total',
                        data: topTeams.map(team => team.totalGold),
                        backgroundColor: 'rgba(119, 185, 242, 0.7)',
                        borderColor: 'rgba(119, 185, 242, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                family: 'Poppins'
                            },
                            callback: (value) => this.formatNumber(value)
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                family: 'Poppins'
                            }
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
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${this.formatNumber(context.parsed.y)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    updateGoldEfficiencyChart() {
        const ctx = document.getElementById('gold-efficiency-chart').getContext('2d');
        
        if (this.charts.gold) {
            this.charts.gold.destroy();
        }
        
        const teams = Array.from(this.uniqueTeams);
        const teamStats = teams.map(team => {
            const stats = this.calculateTeamStats(team);
            const efficiency = stats.totalDamage / Math.max(stats.totalGold, 1); // Usar totales
            return { name: team, efficiency: efficiency };
        });
        
        // Sort by efficiency and take top 8
        teamStats.sort((a, b) => b.efficiency - a.efficiency);
        const topTeams = teamStats.slice(0, 8);
        
        this.charts.gold = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topTeams.map(team => team.name),
                datasets: [{
                    label: 'Eficiencia de Oro (Daño/Oro)',
                    data: topTeams.map(team => team.efficiency.toFixed(2)),
                    backgroundColor: 'rgba(242, 237, 160, 0.7)',
                    borderColor: 'rgba(242, 237, 160, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                family: 'Poppins'
                            },
                            callback: (value) => value.toFixed(2)
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                family: 'Poppins'
                            }
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
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Eficiencia: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    updatePresentationStats() {
        const presentationTables = document.getElementById('presentation-stats-tables');
        const teams = Array.from(this.uniqueTeams).slice(0, 3); // Top 3 teams
        const players = Array.from(this.uniquePlayers).slice(0, 5); // Top 5 players
        
        presentationTables.innerHTML = `
            <div class="presentation-teams">
                <h3>Top 3 Equipos</h3>
                ${teams.map(team => {
                    const stats = this.calculateTeamStats(team);
                    return `
                        <div class="presentation-team-stat glass">
                            <h4>${team}</h4>
                            <p>Victorias: ${stats.wins} | KDA: ${stats.kda}</p>
                            <p>Daño Total: ${this.formatNumber(stats.totalDamage)}</p>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="presentation-players">
                <h3>Top 5 Jugadores</h3>
                ${players.map(player => {
                    const stats = this.calculatePlayerStats(player);
                    return `
                        <div class="presentation-player-stat glass">
                            <h4>${player}</h4>
                            <p>KDA: ${stats.kda} | Eliminaciones: ${stats.kills}</p>
                            <p>Daño Total: ${this.formatNumber(stats.totalDamage)}</p>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // Utility methods
    calculateTeamStats(teamName) {
        let matches = 0;
        let wins = 0;
        let kills = 0;
        let deaths = 0;
        let assists = 0;
        let totalDamage = 0;
        let totalGold = 0;
        let totalParticipationPoints = 0; // Suma de puntos de participación
        
        Object.values(this.data).forEach(phase => {
            if (this.currentPhase !== 'all' && this.currentPhase !== phase) return;
            
            Object.values(phase).forEach(match => {
                let teamInMatch = false;
                let matchKills = 0;
                let matchDeaths = 0;
                let matchAssists = 0;
                let matchDamage = 0;
                let matchGold = 0;
                let matchParticipationPoints = 0;
                
                // Get match winner (most frequent winner value)
                const winners = match.map(row => row.GANADOR).filter(winner => winner);
                if (winners.length > 0) {
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
                    
                    if (matchWinner === teamName) wins++;
                }
                
                match.forEach(row => {
                    if (row.EQUIPO === teamName) {
                        matchKills += parseInt(row.Eliminaciones) || 0;
                        matchDeaths += parseInt(row.Muertes) || 0;
                        matchAssists += parseInt(row.Asistencias) || 0;
                        matchDamage += parseInt(row['DÑO infligido']) || 0;
                        matchGold += parseInt(row['Oro total']) || 0;
                        
                        // Corrección: Participación es un porcentaje por partido
                        const participation = parseFloat(row.Participación) || 0;
                        matchParticipationPoints += participation;
                        
                        teamInMatch = true;
                    }
                });
                
                if (teamInMatch) {
                    matches++;
                    kills += matchKills;
                    deaths += matchDeaths;
                    assists += matchAssists;
                    totalDamage += matchDamage;
                    totalGold += matchGold;
                    totalParticipationPoints += matchParticipationPoints;
                }
            });
        });
        
        const kda = matches > 0 ? ((kills + assists) / Math.max(deaths, 1)).toFixed(2) : '0.00';
        const avgParticipation = matches > 0 ? totalParticipationPoints / matches : 0;
        
        return {
            name: teamName,
            matches: matches,
            wins: wins,
            kills: kills,
            deaths: deaths,
            assists: assists,
            kda: kda,
            totalDamage: totalDamage,       // VALOR TOTAL
            totalGold: totalGold,           // VALOR TOTAL
            avgParticipation: avgParticipation
        };
    }

    calculateTeamStatsForPhase(teamName, phase) {
        let matches = 0;
        let kills = 0;
        let deaths = 0;
        let assists = 0;
        let totalDamage = 0;
        let totalGold = 0;
        
        if (!this.data[phase]) return {
            matches: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            totalDamage: 0,
            totalGold: 0,
            avgParticipation: 0
        };
        
        Object.values(this.data[phase]).forEach(match => {
            let teamInMatch = false;
            let matchKills = 0;
            let matchDeaths = 0;
            let matchAssists = 0;
            let matchDamage = 0;
            let matchGold = 0;
            
            match.forEach(row => {
                if (row.EQUIPO === teamName) {
                    matchKills += parseInt(row.Eliminaciones) || 0;
                    matchDeaths += parseInt(row.Muertes) || 0;
                    matchAssists += parseInt(row.Asistencias) || 0;
                    matchDamage += parseInt(row['DÑO infligido']) || 0;
                    matchGold += parseInt(row['Oro total']) || 0;
                    teamInMatch = true;
                }
            });
            
            if (teamInMatch) {
                matches++;
                kills += matchKills;
                deaths += matchDeaths;
                assists += matchAssists;
                totalDamage += matchDamage;
                totalGold += matchGold;
            }
        });
        
        return {
            matches: matches,
            kills: kills,
            deaths: deaths,
            assists: assists,
            totalDamage: totalDamage,  // VALOR TOTAL
            totalGold: totalGold       // VALOR TOTAL
        };
    }

    calculatePlayerStats(playerName) {
        let matches = 0;
        let kills = 0;
        let deaths = 0;
        let assists = 0;
        let totalDamage = 0;
        let totalGold = 0;
        let team = '';
        
        Object.values(this.data).forEach(phase => {
            if (this.currentPhase !== 'all' && this.currentPhase !== phase) return;
            
            Object.values(phase).forEach(match => {
                let playerInMatch = false;
                
                match.forEach(row => {
                    if (row.JUGADOR === playerName) {
                        kills += parseInt(row.Eliminaciones) || 0;
                        deaths += parseInt(row.Muertes) || 0;
                        assists += parseInt(row.Asistencias) || 0;
                        totalDamage += parseInt(row['DÑO infligido']) || 0;
                        totalGold += parseInt(row['Oro total']) || 0;
                        team = row.EQUIPO;
                        playerInMatch = true;
                    }
                });
                
                if (playerInMatch) matches++;
            });
        });
        
        const kda = matches > 0 ? ((kills + assists) / Math.max(deaths, 1)).toFixed(2) : '0.00';
        
        return {
            name: playerName,
            team: team,
            matches: matches,
            kills: kills,
            deaths: deaths,
            assists: assists,
            kda: kda,
            totalDamage: totalDamage,  // VALOR TOTAL
            totalGold: totalGold       // VALOR TOTAL
        };
    }

    getTeamColor(teamName, alpha = 1) {
        const colors = [
            `rgba(227, 114, 242, ${alpha})`,
            `rgba(114, 94, 242, ${alpha})`,
            `rgba(119, 185, 242, ${alpha})`,
            `rgba(242, 237, 160, ${alpha})`,
            `rgba(75, 50, 166, ${alpha})`
        ];
        
        let hash = 0;
        for (let i = 0; i < teamName.length; i++) {
            hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    }
}

// Initialize stats page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new StatsPage();
});