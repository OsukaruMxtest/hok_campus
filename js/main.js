// Main Dashboard Application
class HonorOfKingsDashboard {
    constructor() {
        this.data = {
            cuartos: {},
            semifinal: {},
            final: {}
        };
        this.currentPhase = 'cuartos';
        this.currentBracket = '';
        this.currentFilters = {
            team: 'all',
            player: 'all'
        };
        this.charts = {};
        this.featuredPlayersByPhase = {};
        this.bestTeam = null;
        this.uniqueTeams = new Set();
        this.uniquePlayers = new Set();
        this.playerNameMapping = {}; // Para manejar cambios de nombre
        this.teamNameMapping = {}; // Para manejar cambios de nombre de equipos
        this.init();
    }
    // Initialize the dashboard
    init() {
        this.setupEventListeners();
        this.loadAllData()
            .then(() => {
                this.processUniqueData();
                this.populateFilters();
                this.updateBracket();
                this.updateContent();
                this.updateCharts();
                this.determineFeaturedPlayersByPhase();
                this.determineBestTeam();
            })
            .catch(error => {
                console.error('Error loading data:', error);
                this.showError('Error al cargar los datos del torneo');
            });
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
        const phasePath = `data/${phase}/`;
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
        // In a real implementation, we would fetch the directory listing
        // For now, we'll use a predefined list based on the phase
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
    // Format number with comma as thousands separator
    formatNumber(n) {
        return Number(n).toLocaleString('en-US');
    }
    // Process unique teams and players, handling name changes
    processUniqueData() {
        this.uniqueTeams.clear();
        this.uniquePlayers.clear();
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
        // Segunda pasada: usar los nombres más recientes
        // Para equipos: asumimos que el nombre más común es el actual
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
            this.uniqueTeams.add(team);
        });
        // Para jugadores: usar el nombre más frecuente
        Object.keys(playerCount).forEach(player => {
            this.uniquePlayers.add(player);
        });
    }
    // Setup event listeners
    setupEventListeners() {
        // Phase selection
        document.getElementById('phase-select').addEventListener('change', (e) => {
            this.currentPhase = e.target.value;
            this.currentBracket = '';
            this.updateBracket();
            this.updateContent();
            this.updateCharts();
        });
        // Bracket selection
        document.getElementById('bracket-select').addEventListener('change', (e) => {
            this.currentBracket = e.target.value;
            this.updateContent();
            this.updateCharts();
        });
        // Team filter
        document.getElementById('team-select').addEventListener('change', (e) => {
            this.currentFilters.team = e.target.value;
            this.updatePlayerFilter();
        });
        // Player filter
        document.getElementById('player-select').addEventListener('change', (e) => {
            this.currentFilters.player = e.target.value;
        });
        // Apply filters
        document.getElementById('apply-filters').addEventListener('click', () => {
            this.updateContent();
            this.updateCharts();
            this.closeFilters();
        });
        // Reset filters
        document.getElementById('reset-filters').addEventListener('click', () => {
            this.resetFilters();
        });
        // Toggle filters panel
        document.getElementById('toggle-filters').addEventListener('click', () => {
            this.toggleFilters();
        });
        document.getElementById('close-filters').addEventListener('click', () => {
            this.closeFilters();
        });
        // Toggle sidebar
        document.getElementById('toggle-sidebar').addEventListener('click', () => {
            this.toggleSidebar();
        });
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
        // Close detail panel
        document.getElementById('close-detail').addEventListener('click', () => {
            this.closeDetailPanel();
        });
    }
    // Toggle navigation menu
    toggleNavigation() {
        document.querySelector('.nav-menu').classList.toggle('active');
    }
    // Toggle filters panel
    toggleFilters() {
        document.getElementById('filters-panel').classList.toggle('active');
    }
    closeFilters() {
        document.getElementById('filters-panel').classList.remove('active');
    }
    // Toggle sidebar
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('toggle-sidebar');
        if (sidebar.style.display === 'none') {
            sidebar.style.display = 'block';
            toggleBtn.textContent = 'Ocultar Bracket';
        } else {
            sidebar.style.display = 'none';
            toggleBtn.textContent = 'Mostrar Bracket';
        }
    }
    // Toggle presentation mode
    togglePresentationMode() {
        const overlay = document.getElementById('presentation-overlay');
        overlay.classList.toggle('active');
        if (overlay.classList.contains('active')) {
            this.updatePresentationStats();
        }
    }
    // Show detail panel
    showDetailPanel(content, title = 'Detalles') {
        document.getElementById('detail-title').textContent = title;
        document.getElementById('detail-content').innerHTML = content;
        document.getElementById('detail-panel').classList.add('active');
    }
    // Close detail panel
    closeDetailPanel() {
        document.getElementById('detail-panel').classList.remove('active');
    }
    // Populate filter dropdowns
    populateFilters() {
        this.populateBracketFilter();
        this.populateTeamFilter();
        this.populatePlayerFilter();
    }
    // Populate bracket filter
    populateBracketFilter() {
        const bracketSelect = document.getElementById('bracket-select');
        bracketSelect.innerHTML = '<option value="all">Todas las llaves</option>';
        const brackets = Object.keys(this.data[this.currentPhase]);
        brackets.forEach(bracket => {
            const option = document.createElement('option');
            option.value = bracket;
            option.textContent = this.formatBracketName(bracket);
            bracketSelect.appendChild(option);
        });
        if (brackets.length > 0 && !this.currentBracket) {
            this.currentBracket = brackets[0];
            bracketSelect.value = this.currentBracket;
        }
    }
    // Populate team filter
    populateTeamFilter() {
        const teamSelect = document.getElementById('team-select');
        teamSelect.innerHTML = '<option value="all">Todos los equipos</option>';
        const teams = this.getAllTeams();
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            teamSelect.appendChild(option);
        });
    }
    // Populate player filter
    populatePlayerFilter() {
        const playerSelect = document.getElementById('player-select');
        playerSelect.innerHTML = '<option value="all">Todos los jugadores</option>';
        const players = this.getAllPlayers();
        players.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            option.textContent = player;
            playerSelect.appendChild(option);
        });
    }
    // Update player filter based on team selection
    updatePlayerFilter() {
        const playerSelect = document.getElementById('player-select');
        playerSelect.innerHTML = '<option value="all">Todos los jugadores</option>';
        let players = [];
        if (this.currentFilters.team === 'all') {
            players = this.getAllPlayers();
        } else {
            players = this.getPlayersByTeam(this.currentFilters.team);
        }
        players.forEach(player => {
            const option = document.createElement('option');
            option.value = player;
            option.textContent = player;
            playerSelect.appendChild(option);
        });
    }
    // Reset all filters
    resetFilters() {
        this.currentFilters = {
            team: 'all',
            player: 'all'
        };
        document.getElementById('team-select').value = 'all';
        document.getElementById('player-select').value = 'all';
        this.updatePlayerFilter();
    }
    // Group brackets by their series (Q1, Q2, S1, S2, etc.)
    groupBrackets() {
        const brackets = Object.keys(this.data[this.currentPhase]);
        const groups = {};
        brackets.forEach(bracket => {
            // Extract group identifier (Q1, Q2, S1, S2, F)
            let groupKey;
            if (bracket.startsWith('Q')) {
                groupKey = bracket.substring(0, 2); // Q1, Q2, etc.
            } else if (bracket.startsWith('S')) {
                groupKey = bracket.substring(0, 2); // S1, S2
            } else if (bracket.startsWith('F')) {
                groupKey = 'F'; // All finals in one group
            } else {
                groupKey = bracket; // Fallback
            }
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(bracket);
        });
        return groups;
    }
    // Update bracket display
    updateBracket() {
        const bracketContainer = document.getElementById('bracket');
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
    }
    // Create bracket container for a group
    createBracketContainerForGroup(groupKey, brackets) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'bracket-group glass';
        // Create group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'bracket-group-header';
        const groupTitle = document.createElement('h3');
        groupTitle.className = 'bracket-group-title';
        groupTitle.textContent = this.formatGroupName(groupKey);
        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.textContent = '+';
        groupHeader.appendChild(groupTitle);
        groupHeader.appendChild(expandIcon);
        // Create matches container (initially hidden)
        const matchesContainer = document.createElement('div');
        matchesContainer.className = 'bracket-matches-container';
        matchesContainer.style.display = 'none';
        // Add matches to the container
        brackets.forEach(bracket => {
            const matchElement = this.createMatchElement(bracket);
            matchesContainer.appendChild(matchElement);
        });
        // Toggle expand/collapse on header click
        groupHeader.addEventListener('click', () => {
            const isExpanded = matchesContainer.style.display === 'block';
            matchesContainer.style.display = isExpanded ? 'none' : 'block';
            expandIcon.textContent = isExpanded ? '+' : '−';
            groupDiv.classList.toggle('expanded', !isExpanded);
        });
        groupDiv.appendChild(groupHeader);
        groupDiv.appendChild(matchesContainer);
        return groupDiv;
    }
    // Create individual match element
    createMatchElement(bracketName) {
        const bracketData = this.data[this.currentPhase][bracketName];
        const matchDiv = document.createElement('div');
        matchDiv.className = 'bracket-match-item';
        if (this.currentBracket === bracketName) {
            matchDiv.classList.add('active');
        }
        matchDiv.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent group toggle
            this.currentBracket = bracketName;
            this.updateContent();
            this.updateCharts();
            this.highlightActiveBracket();
        });
        // Determine winner
        const winner = this.determineMatchWinner(bracketData);
        // Get unique teams (using current names)
        const teams = [...new Set(bracketData.map(row => row.EQUIPO))];
        let matchInfo = '';
        if (teams.length === 2) {
            matchInfo = `
                <div class="match-teams">
                    ${teams.map(team => `
                        <div class="team ${team === winner ? 'winner' : ''}">
                            <img src="${this.getTeamLogo(team)}" alt="${team}" class="team-logo" onerror="this.src='/assets/logos/default_logo.png'">
                            <span class="team-name">${team}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="match-info">
                    ${this.formatBracketName(bracketName)}
                </div>
            `;
        } else {
            matchInfo = '<p>Datos incompletos</p>';
        }
        matchDiv.innerHTML = matchInfo;
        return matchDiv;
    }
    // Format group name for display
    formatGroupName(groupKey) {
        const groupNames = {
            'Q1': 'Cuartos de Final 1',
            'Q2': 'Cuartos de Final 2', 
            'Q3': 'Cuartos de Final 3',
            'Q4': 'Cuartos de Final 4',
            'S1': 'Semifinal 1',
            'S2': 'Semifinal 2',
            'F': 'Final'
        };
        return groupNames[groupKey] || groupKey;
    }
    // Highlight active bracket
    highlightActiveBracket() {
        const bracketMatches = document.querySelectorAll('.bracket-match-item');
        bracketMatches.forEach(match => {
            match.classList.remove('active');
        });
        if (this.currentBracket) {
            const activeMatch = Array.from(bracketMatches).find(match => {
                return match.querySelector('.match-info').textContent === this.formatBracketName(this.currentBracket);
            });
            if (activeMatch) {
                activeMatch.classList.add('active');
            }
        }
    }
    // Update main content
    updateContent() {
        this.updateBreadcrumb();
        this.updateFeaturedPlayersByPhase();
        this.updateStatsCards();
        this.updateTeamsDisplay();
    }
    // Update breadcrumb
    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        let breadcrumbText = 'Inicio';
        if (this.currentPhase) {
            const phaseNames = {
                cuartos: 'Cuartos de Final',
                semifinal: 'Semifinal',
                final: 'Final'
            };
            breadcrumbText += ` > ${phaseNames[this.currentPhase]}`;
            if (this.currentBracket && this.currentBracket !== 'all') {
                breadcrumbText += ` > ${this.formatBracketName(this.currentBracket)}`;
            }
        }
        breadcrumb.textContent = breadcrumbText;
    }
    // Update featured players by phase
    updateFeaturedPlayersByPhase() {
        const container = document.getElementById('featured-players-container');
        if (Object.keys(this.featuredPlayersByPhase).length === 0) {
            container.innerHTML = '<p>No hay jugadores destacados disponibles.</p>';
            return;
        }
        let html = '';
        Object.entries(this.featuredPlayersByPhase).forEach(([phase, playerData]) => {
            if (playerData) {
                const phaseNames = {
                    cuartos: 'Cuartos de Final',
                    semifinal: 'Semifinal',
                    final: 'Final'
                };
                html += `
                    <div class="featured-phase-player glass fade-in">
                        <img src="${this.getPlayerImage(playerData.name)}" alt="${playerData.name}" class="featured-phase-player-image" onerror="this.src='/assets/logos/default_logo.png'">
                        <div class="featured-phase-player-info">
                            <h3 class="featured-phase-player-name">${playerData.name}</h3>
                            <div class="featured-phase-player-phase">${phaseNames[phase]}</div>
                            <div class="featured-phase-player-stats">
                                <div class="featured-phase-stat">
                                    <div class="featured-phase-stat-value">${playerData.stats.kills}</div>
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
    // Update stats cards
    updateStatsCards() {
        const statsContainer = document.getElementById('stats-cards');
        const stats = this.calculateTournamentStats();
        statsContainer.innerHTML = `
            <div class="stat-card glass fade-in">
                <div class="stat-value">${stats.totalMatches}</div>
                <div class="stat-label">Partidos Jugados</div>
            </div>
            <div class="stat-card glass fade-in">
                <div class="stat-value">${stats.totalTeams}</div>
                <div class="stat-label">Equipos</div>
            </div>
            <div class="stat-card glass fade-in">
                <div class="stat-value">${stats.totalPlayers}</div>
                <div class="stat-label">Jugadores</div>
            </div>
            <div class="stat-card glass fade-in">
                <div class="stat-value">${stats.avgKills}</div>
                <div class="stat-label">Eliminaciones/Promedio</div>
            </div>
            <div class="stat-card glass fade-in">
                <div class="stat-value">${stats.avgDamage}</div>
                <div class="stat-label">Daño/Promedio</div>
            </div>
            <div class="stat-card glass fade-in">
                <div class="stat-value">${stats.highestKills}</div>
                <div class="stat-label">Mayor Eliminaciones</div>
            </div>
        `;
    }
    // Update teams display
    updateTeamsDisplay() {
        const teamsContainer = document.getElementById('teams-container');
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
    // Create team card
    createTeamCard(teamName) {
        const teamData = this.getTeamData(teamName);
        const teamPlayers = this.getPlayersByTeam(teamName);
        const teamCard = document.createElement('div');
        teamCard.className = 'team-card glass fade-in';
        teamCard.addEventListener('click', () => {
            this.showTeamDetail(teamName);
        });
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
                <h4>Jugadores</h4>
                ${teamPlayers.map(player => this.createPlayerItem(player)).join('')}
            </div>
        `;
        // Add event listeners for player expansion
        teamCard.querySelectorAll('.player-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerName = item.dataset.player;
                this.showPlayerDetail(playerName);
            });
        });
        return teamCard;
    }
    // Create player item
    createPlayerItem(playerName) {
        const playerData = this.getPlayerData(playerName);
        if (!playerData) return '';
        return `
            <div class="player-item" data-player="${playerName}">
                <div class="player-name">${playerName}</div>
                <div class="player-stats">
                    <div class="player-stat">K: ${playerData.Eliminaciones}</div>
                    <div class="player-stat">D: ${playerData.Muertes}</div>
                    <div class="player-stat">A: ${playerData.Asistencias}</div>
                </div>
            </div>
        `;
    }
    // Show team detail
    showTeamDetail(teamName) {
        const teamData = this.getTeamData(teamName);
        const teamPlayers = this.getPlayersByTeam(teamName);
        const teamStats = this.calculateTeamAccumulatedStats(teamName);
        const content = `
            <div class="team-detail glass">
                <div class="team-detail-header">
                    <img src="${this.getTeamLogo(teamName)}" alt="${teamName}" class="team-detail-logo" onerror="this.src='/assets/logos/default_logo.png'">
                    <div>
                        <h3 class="team-detail-name">${teamName}</h3>
                        <p>Victorias: ${this.getTeamWins(teamName)}</p>
                    </div>
                </div>
                <div class="team-detail-stats">
                    <div class="detail-stats-grid">
                        <div class="detail-stat">
                            <div class="detail-stat-value">${teamStats.matches}</div>
                            <div class="detail-stat-label">Partidos</div>
                        </div>
                        <div class="detail-stat">
                            <div class="detail-stat-value">${teamStats.kills}</div>
                            <div class="detail-stat-label">Eliminaciones</div>
                        </div>
                        <div class="detail-stat">
                            <div class="detail-stat-value">${teamStats.assists}</div>
                            <div class="detail-stat-label">Asistencias</div>
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
                    <h4 class="team-players-title">Jugadores del Equipo</h4>
                    ${teamPlayers.map(player => `
                        <div class="player-item" data-player="${player}">
                            <div class="player-name">${player}</div>
                            <div class="player-stats">
                                <div class="player-stat">K: ${this.getPlayerData(player).Eliminaciones}</div>
                                <div class="player-stat">D: ${this.getPlayerData(player).Muertes}</div>
                                <div class="player-stat">A: ${this.getPlayerData(player).Asistencias}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        this.showDetailPanel(content, `Equipo: ${teamName}`);
        // Add event listeners for player items in detail panel
        document.querySelectorAll('#detail-content .player-item').forEach(item => {
            item.addEventListener('click', () => {
                const playerName = item.dataset.player;
                this.showPlayerDetail(playerName);
            });
        });
    }
    // Show player detail
    showPlayerDetail(playerName) {
        const playerData = this.getPlayerData(playerName);
        const playerStats = this.getPlayerAccumulatedStats(playerName);
        const content = `
            <div class="player-detail glass">
                <div class="player-detail-header">
                    <img src="${this.getPlayerImage(playerName)}" alt="${playerName}" class="player-detail-image" onerror="this.src='/assets/logos/default_logo.png'">
                    <div>
                        <h3 class="player-detail-name">${playerName}</h3>
                        <p>Equipo: ${playerData.EQUIPO}</p>
                    </div>
                </div>
                <div class="player-detail-stats">
                    <div class="detail-stats-grid">
                        <div class="detail-stat">
                            <div class="detail-stat-value">${playerStats.matches}</div>
                            <div class="detail-stat-label">Partidos</div>
                        </div>
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
        `;
        this.showDetailPanel(content, `Jugador: ${playerName}`);
        // Update player radar chart after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.updatePlayerRadarChart(playerName);
        }, 100);
    }
    // Update player radar chart
    updatePlayerRadarChart(playerName) {
        const ctx = document.getElementById('player-radar-chart').getContext('2d');
        // Destroy existing chart if it exists
        if (this.charts.playerRadar) {
            this.charts.playerRadar.destroy();
        }
        
        const playerStats = this.getPlayerAccumulatedStats(playerName);
        
        // Obtener todos los jugadores para calcular máximos relativos
        const allPlayers = this.getAllPlayers();
        const allStats = allPlayers.map(p => this.getPlayerAccumulatedStats(p));
        
        // Calcular máximos dinámicos basados en todos los jugadores
        const maxKills = Math.max(...allStats.map(s => s.avgKills), 10); // Mínimo 10
        const maxDamage = Math.max(...allStats.map(s => s.avgDamage), 30000); // Mínimo 30k
        const maxGold = Math.max(...allStats.map(s => s.avgGold), 15000); // Mínimo 15k
        const maxCrowdControl = Math.max(...allStats.map(s => s.avgCrowdControl), 100);
        const maxTowerDamage = Math.max(...allStats.map(s => s.avgTowerDamage), 5000);
        
        // Normalizar sin límite artificial de 100
        const normalizedStats = {
            kills: (playerStats.avgKills / maxKills) * 100,
            damage: (playerStats.avgDamage / maxDamage) * 100,
            gold: (playerStats.avgGold / maxGold) * 100,
            participation: playerStats.avgParticipation, // Ya está en porcentaje
            crowdControl: (playerStats.avgCrowdControl / maxCrowdControl) * 100,
            towerDamage: (playerStats.avgTowerDamage / maxTowerDamage) * 100
        };

        this.charts.playerRadar = new Chart(ctx, {
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
                        suggestedMin: 0,
                        angleLines: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            lineWidth: 1
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        pointLabels: {
                            color: 'white',
                            font: {
                                family: 'Poppins',
                                size: 12
                            },
                            padding: 10
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            backdropColor: 'transparent',
                            showLabelBackdrop: false,
                            stepSize: 25,
                            callback: (value) => `${value}%`
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false // Ocultar leyenda en el panel de detalles
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const statName = context.label;
                                const rawValue = context.parsed.r;
                                let realValue;
                                
                                switch(statName) {
                                    case 'Eliminaciones':
                                        realValue = playerStats.avgKills.toFixed(1);
                                        return `${statName}: ${realValue} (máx: ${maxKills.toFixed(1)})`;
                                    case 'Daño':
                                        realValue = this.formatNumber(Math.round(playerStats.avgDamage));
                                        return `${statName}: ${realValue} (máx: ${this.formatNumber(Math.round(maxDamage))})`;
                                    case 'Oro':
                                        realValue = this.formatNumber(Math.round(playerStats.avgGold));
                                        return `${statName}: ${realValue} (máx: ${this.formatNumber(Math.round(maxGold))})`;
                                    case 'Participación':
                                        return `${statName}: ${playerStats.avgParticipation.toFixed(1)}%`;
                                    case 'Control de Masas':
                                        realValue = playerStats.avgCrowdControl.toFixed(1);
                                        return `${statName}: ${realValue} (máx: ${maxCrowdControl.toFixed(1)})`;
                                    case 'Daño a Torres':
                                        realValue = this.formatNumber(Math.round(playerStats.avgTowerDamage));
                                        return `${statName}: ${realValue} (máx: ${this.formatNumber(Math.round(maxTowerDamage))})`;
                                    default:
                                        return `${statName}: ${rawValue.toFixed(1)}%`;
                                }
                            }
                        },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(227, 114, 242, 1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
    }
    // Update charts
    updateCharts() {
        this.updateRadarChart();
        this.updateBarChart();
        this.updatePieChart();
    }
    // Update radar chart
    updateRadarChart() {
        const ctx = document.getElementById('radar-chart').getContext('2d');
        // Destroy existing chart if it exists
        if (this.charts.radar) {
            this.charts.radar.destroy();
        }

        const teams = this.getFilteredTeams();
        if (teams.length === 0) {
            return;
        }
        
        // Calcular estadísticas para todos los equipos para normalización
        const allTeams = this.getAllTeams();
        const allTeamStats = allTeams.map(team => this.calculateTeamAccumulatedStats(team));
        
        // Encontrar valores máximos globales
        const maxKills = Math.max(...allTeamStats.map(s => s.avgKills), 50);
        const maxDamage = Math.max(...allTeamStats.map(s => s.avgDamage), 30000);
        const maxGold = Math.max(...allTeamStats.map(s => s.avgGold), 15000);
        const maxParticipation = Math.max(...allTeamStats.map(s => s.avgParticipation), 80);
        const maxCrowdControl = Math.max(...allTeamStats.map(s => s.avgCrowdControl), 100);
        
        const teamStats = teams.map(team => {
            const stats = this.calculateTeamAccumulatedStats(team);
            return {
                label: team,
                data: [
                    (stats.avgKills / maxKills) * 100,
                    (stats.avgDamage / maxDamage) * 100,
                    (stats.avgGold / maxGold) * 100,
                    stats.avgParticipation, // Ya está en porcentaje
                    (stats.avgCrowdControl / maxCrowdControl) * 100
                ],
                borderColor: this.getTeamColor(team),
                backgroundColor: this.getTeamColor(team, 0.15),
                borderWidth: 2,
                pointBackgroundColor: this.getTeamColor(team),
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            };
        });

        this.charts.radar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Eliminaciones', 'Daño', 'Oro', 'Participación', 'Control de Masas'],
                datasets: teamStats
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        suggestedMin: 0,
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
                                size: 12
                            }
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            backdropColor: 'transparent',
                            showLabelBackdrop: false,
                            stepSize: 25,
                            callback: (value) => `${value}%`
                        }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'white',
                            font: {
                                family: 'Poppins',
                                size: 12
                            },
                            padding: 15,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        },
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const teamName = context.dataset.label;
                                const statName = context.label;
                                const normalizedValue = context.parsed.r;
                                const stats = this.calculateTeamAccumulatedStats(teamName);
                                
                                let realValue, maxValue;
                                switch(statName) {
                                    case 'Eliminaciones':
                                        realValue = stats.avgKills.toFixed(1);
                                        maxValue = maxKills.toFixed(1);
                                        return `${teamName} - ${statName}: ${realValue} (máx: ${maxValue})`;
                                    case 'Daño':
                                        realValue = this.formatNumber(Math.round(stats.avgDamage));
                                        maxValue = this.formatNumber(Math.round(maxDamage));
                                        return `${teamName} - ${statName}: ${realValue} (máx: ${maxValue})`;
                                    case 'Oro':
                                        realValue = this.formatNumber(Math.round(stats.avgGold));
                                        maxValue = this.formatNumber(Math.round(maxGold));
                                        return `${teamName} - ${statName}: ${realValue} (máx: ${maxValue})`;
                                    case 'Participación':
                                        return `${teamName} - ${statName}: ${stats.avgParticipation.toFixed(1)}%`;
                                    case 'Control de Masas':
                                        realValue = stats.avgCrowdControl.toFixed(1);
                                        maxValue = maxCrowdControl.toFixed(1);
                                        return `${teamName} - ${statName}: ${realValue} (máx: ${maxValue})`;
                                    default:
                                        return `${teamName} - ${statName}: ${normalizedValue.toFixed(1)}%`;
                                }
                            }
                        },
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        borderWidth: 1,
                        padding: 10
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
    }
    // Update bar chart
    updateBarChart() {
        const ctx = document.getElementById('bar-chart').getContext('2d');
        // Destroy existing chart if it exists
        if (this.charts.bar) {
            this.charts.bar.destroy();
        }
        const players = this.getFilteredPlayers();
        if (players.length === 0) {
            return;
        }
        // Limit to top 10 players by kills for better visualization
        const topPlayers = players
            .map(player => {
                const data = this.getPlayerData(player);
                return {
                    name: player,
                    kills: parseInt(data.Eliminaciones) || 0,
                    damage: parseInt(data['DÑO infligido']) || 0,
                    gold: parseInt(data['Oro total']) || 0
                };
            })
            .sort((a, b) => b.kills - a.kills)
            .slice(0, 10);
        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topPlayers.map(p => p.name),
                datasets: [
                    {
                        label: 'Eliminaciones',
                        data: topPlayers.map(p => p.kills),
                        backgroundColor: 'rgba(227, 114, 242, 0.7)',
                        borderColor: 'rgba(227, 114, 242, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Daño',
                        data: topPlayers.map(p => p.damage),
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
                            callback: (value) => {
                                if (value >= 1000) {
                                    return (value / 1000).toFixed(1) + 'K';
                                }
                                return value;
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
                                const value = context.parsed.y;
                                return `${context.dataset.label}: ${this.formatNumber(value)}`;
                            }
                        }
                    }
                }
            }
        });
    }
    // Update pie chart
    updatePieChart() {
        const ctx = document.getElementById('pie-chart').getContext('2d');
        // Destroy existing chart if it exists
        if (this.charts.pie) {
            this.charts.pie.destroy();
        }
        const teams = this.getFilteredTeams();
        if (teams.length === 0) {
            return;
        }
        const teamParticipation = teams.map(team => {
            return {
                label: team,
                data: this.calculateTeamParticipation(team),
                color: this.getTeamColor(team)
            };
        });
        // Generar colores distintos para cada equipo
        const distinctColors = this.generateDistinctColors(teamParticipation.length);
        this.charts.pie = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: teamParticipation.map(t => t.label),
                datasets: [{
                    data: teamParticipation.map(t => t.data),
                    backgroundColor: distinctColors,
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
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
    // Generate distinct colors using HSL color space
    generateDistinctColors(n) {
        const colors = [];
        const hueStep = 360 / n;
        for (let i = 0; i < n; i++) {
            const hue = i * hueStep;
            // Usar saturación y luminosidad fijas para colores vibrantes pero legibles
            const saturation = 70 + Math.random() * 20; // 70-90%
            const lightness = 50 + Math.random() * 10; // 50-60%
            colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
        }
        return colors;
    }
    // Update presentation stats
    updatePresentationStats() {
        const presentationStats = document.getElementById('presentation-stats');
        const stats = this.calculateTournamentStats();
        presentationStats.innerHTML = `
            <div class="presentation-stat glass">
                <div class="presentation-stat-value">${stats.totalMatches}</div>
                <div class="presentation-stat-label">Partidos</div>
            </div>
            <div class="presentation-stat glass">
                <div class="presentation-stat-value">${stats.totalTeams}</div>
                <div class="presentation-stat-label">Equipos</div>
            </div>
            <div class="presentation-stat glass">
                <div class="presentation-stat-value">${stats.totalPlayers}</div>
                <div class="presentation-stat-label">Jugadores</div>
            </div>
        `;
        // Add best team to presentation
        if (this.bestTeam) {
            const bestTeamContainer = document.getElementById('best-team-presentation');
            const teamStats = this.calculateTeamAccumulatedStats(this.bestTeam.name);
            bestTeamContainer.innerHTML = `
                <h2 class="best-team-title">Mejor Equipo del Torneo</h2>
                <div class="best-team-info">
                    <img src="${this.getTeamLogo(this.bestTeam.name)}" alt="${this.bestTeam.name}" class="best-team-logo" onerror="this.src='/assets/logos/default_logo.png'">
                    <div class="best-team-details">
                        <h3>${this.bestTeam.name}</h3>
                        <p>Victorias: ${this.bestTeam.wins}</p>
                        <div class="best-team-stats">
                            <div class="detail-stat">
                                <div class="detail-stat-value">${teamStats.kills}</div>
                                <div class="detail-stat-label">Eliminaciones</div>
                            </div>
                            <div class="detail-stat">
                                <div class="detail-stat-value">${this.formatNumber(Math.round(teamStats.avgDamage))}</div>
                                <div class="detail-stat-label">Daño Promedio</div>
                            </div>
                            <div class="detail-stat">
                                <div class="detail-stat-value">${Math.round(teamStats.avgParticipation)}%</div>
                                <div class="detail-stat-label">Participación</div>
                            </div>
                            <div class="detail-stat">
                                <div class="detail-stat-value">${this.calculateTeamKDA(this.bestTeam.name)}</div>
                                <div class="detail-stat-label">KDA</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    // Determine featured players by phase
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
                        bestPlayer = {
                            name: player,
                            stats: playerStats
                        };
                    }
                }
            });
            this.featuredPlayersByPhase[phase] = bestPlayer;
        });
    }
    // Determine best team
    determineBestTeam() {
        const teams = this.getAllTeams();
        let bestTeam = null;
        let bestScore = 0;
        teams.forEach(team => {
            const wins = this.getTeamWins(team);
            const teamStats = this.calculateTeamAccumulatedStats(team);
            // Simple scoring: wins + average performance
            const score = wins * 10 + teamStats.avgKills + teamStats.avgDamage / 1000;
            if (score > bestScore) {
                bestScore = score;
                bestTeam = {
                    name: team,
                    wins: wins,
                    score: score
                };
            }
        });
        this.bestTeam = bestTeam;
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
        let totalDamage = 0;
        let totalParticipation = 0;
        let matchCount = 0;
        Object.values(this.data[phase]).forEach(match => {
            let playerInMatch = false;
            match.forEach(row => {
                if (row.JUGADOR === playerName) {
                    totalKills += parseInt(row.Eliminaciones) || 0;
                    totalDamage += parseInt(row['DÑO infligido']) || 0;
                    totalParticipation += parseInt(row.Participación) || 0;
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
    // Calculate player score for ranking
    calculatePlayerScore(stats) {
        return (stats.kills * 2) + (stats.damage / 1000) + (stats.participation * 0.5);
    }
    // Format bracket name for display
    formatBracketName(bracketFileName) {
        // Extract phase and match info from filename
        const match = bracketFileName.match(/([QSF])(\d*)M(\d+)/);
        if (!match) return bracketFileName;
        const phaseCode = match[1];
        const bracketNum = match[2] || '';
        const matchNum = match[3];
        const phaseNames = {
            'Q': 'Cuartos',
            'S': 'Semifinal',
            'F': 'Final'
        };
        return `${phaseNames[phaseCode] || 'Fase'} ${bracketNum} - Partido ${matchNum}`;
    }
    // Determine match winner
    determineMatchWinner(matchData) {
        const winners = matchData.map(row => row.GANADOR).filter(winner => winner);
        if (winners.length === 0) return null;
        // Count occurrences of each winner
        const winnerCount = {};
        winners.forEach(winner => {
            winnerCount[winner] = (winnerCount[winner] || 0) + 1;
        });
        // Find the winner with the most occurrences
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
    // Get all teams (using current names only)
    getAllTeams() {
        return Array.from(this.uniqueTeams);
    }
    // Get all players (using current names only)
    getAllPlayers() {
        return Array.from(this.uniquePlayers);
    }
    // Get players by team
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
    // Get filtered teams based on current filters
    getFilteredTeams() {
        let teams = this.getAllTeams();
        if (this.currentBracket && this.currentBracket !== 'all') {
            const bracketData = this.data[this.currentPhase][this.currentBracket];
            if (bracketData) {
                const bracketTeams = new Set(bracketData.map(row => row.EQUIPO));
                teams = teams.filter(team => bracketTeams.has(team));
            }
        }
        return teams;
    }
    // Get filtered players based on current filters
    getFilteredPlayers() {
        let players = this.getAllPlayers();
        if (this.currentFilters.team !== 'all') {
            players = players.filter(player => {
                const playerData = this.getPlayerData(player);
                return playerData && playerData.EQUIPO === this.currentFilters.team;
            });
        }
        if (this.currentBracket && this.currentBracket !== 'all') {
            const bracketData = this.data[this.currentPhase][this.currentBracket];
            if (bracketData) {
                const bracketPlayers = new Set(bracketData.map(row => row.JUGADOR));
                players = players.filter(player => bracketPlayers.has(player));
            }
        }
        return players;
    }
    // Get team data (returns first occurrence)
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
    // Get player data (returns first occurrence)
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
    // Get team logo path
    getTeamLogo(teamName) {
        // Simple logo path generation
        const cleanName = teamName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `/assets/logos/${cleanName}.png`;
    }
    // Get player image path
    getPlayerImage(playerName) {
        // Player images should be stored in /assets/players/
        const cleanName = playerName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return `/assets/players/${cleanName}.png`;
    }
    // Get team color
    getTeamColor(teamName, alpha = 1) {
        // Generate a consistent color based on team name
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
    // Calculate tournament statistics
    calculateTournamentStats() {
        let totalMatches = 0;
        Object.values(this.data).forEach(phase => {
            totalMatches += Object.keys(phase).length;
        });
        const teams = this.getAllTeams();
        const players = this.getAllPlayers();
        let totalKills = 0;
        let totalDamage = 0;
        let highestKills = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                match.forEach(row => {
                    const kills = parseInt(row.Eliminaciones) || 0;
                    const damage = parseInt(row['DÑO infligido']) || 0;
                    totalKills += kills;
                    totalDamage += damage;
                    if (kills > highestKills) {
                        highestKills = kills;
                    }
                });
            });
        });
        return {
            totalMatches: totalMatches,
            totalTeams: teams.length,
            totalPlayers: players.length,
            avgKills: Math.round(totalKills / totalMatches) || 0,
            avgDamage: Math.round(totalDamage / totalMatches) || 0,
            highestKills: highestKills
        };
    }
    // Calculate team accumulated stats
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
                    totalParticipation += matchParticipation / 5; // Average per player
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
    // Get player accumulated stats
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
    // Calculate team wins
    getTeamWins(teamName) {
        let wins = 0;
        Object.values(this.data).forEach(phase => {
            Object.values(phase).forEach(match => {
                const winner = this.determineMatchWinner(match);
                if (winner === teamName) {
                    wins++;
                }
            });
        });
        return wins;
    }
    // Calculate team KDA
    calculateTeamKDA(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        if (stats.matches === 0) return '0.00';
        const kda = (stats.kills + stats.assists) / Math.max(stats.deaths, 1);
        return kda.toFixed(2);
    }
    // Calculate team damage
    calculateTeamDamage(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        if (stats.matches === 0) return '0';
        return this.formatNumber(Math.round(stats.avgDamage));
    }
    // Calculate team gold
    calculateTeamGold(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        if (stats.matches === 0) return '0';
        return this.formatNumber(Math.round(stats.avgGold));
    }
    // Calculate team radar data - NO SE USA MÁS, REEMPLAZADO POR NORMALIZACIÓN DINÁMICA
    calculateTeamRadarData(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        return [
            stats.avgKills,
            stats.avgDamage,
            stats.avgGold,
            stats.avgParticipation,
            stats.avgCrowdControl
        ];
    }
    // Calculate team participation
    calculateTeamParticipation(teamName) {
        const stats = this.calculateTeamAccumulatedStats(teamName);
        return stats.avgParticipation;
    }
    // Show error message
    showError(message) {
        // Simple error display
        alert(message);
    }
}
// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new HonorOfKingsDashboard();
});
// Fallback for missing team logos
window.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && e.target.src.includes('/assets/logos/')) {
        e.target.src = '/assets/logos/default_logo.png';
    }

}, true);
