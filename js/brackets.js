// Brackets Page - Tournament Bracket with Google Sheets integration
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // CONSTANTES
    // ============================================================

    var ALLOWED_CONTAINERS = ['left_R3', 'right_R3', 'left_R4', 'right_R4', 'center_R5', 'center_R6'];
    var ROUND_CONFIG = {
        'R3': { label: 'Cuartos', checksCount: 3, winThreshold: 2 },
        'R4': { label: 'Semifinal', checksCount: 3, winThreshold: 2 },
        'R5': { label: 'Final', checksCount: 3, winThreshold: 2 },
        'R6': { label: 'Tercer Puesto', checksCount: 3, winThreshold: 2 }
    };

    // ============================================================
    // INYECCIÓN DE ESTILOS CON ANIMACIÓN DE FLOTACIÓN Y LOGOS
    // ============================================================

    (function injectStyles() {
        if (document.getElementById('hok-brackets-styles')) return;
        var style = document.createElement('style');
        style.id = 'hok-brackets-styles';
        style.textContent = `
            .hok-win-game-icon {
                display: inline-block;
                width: 28px;
                height: 28px;
                margin-left: 6px;
                vertical-align: middle;
                animation: hok-float 2s ease-in-out infinite;
            }
            @keyframes hok-float {
                0% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
                100% { transform: translateY(0); }
            }
            @media (prefers-reduced-motion: reduce) {
                .hok-win-game-icon {
                    animation: none;
                }
            }
            .hok-winner-icon.r5,
            .hok-winner-icon.r6 {
                font-size: 1.5rem;
                margin-left: 6px;
                vertical-align: middle;
            }
            .hok-winner-icon.r5 {
                color: #FFD700;
            }
            .hok-winner-icon.r6 {
                color: #CD7F32;
            }
            .presentation-bracket-clone .hok-win-game-icon {
                width: 24px;
                height: 24px;
            }
            /* Estilos para logos de equipos en bracket */
            .hok-team-logo {
                width: 28px;
                height: 28px;
                margin-right: 6px;
                vertical-align: middle;
                border-radius: 50%;
                object-fit: cover;
                background-color: rgba(255,255,255,0.1);
                flex-shrink: 0;
            }
            .hok-team {
                display: flex;
                align-items: center;
                gap: 4px;
                flex-wrap: wrap;
            }
            .hok-team .team-name {
                margin-right: 2px;
            }
        `;
        document.head.appendChild(style);
    })();

    // ============================================================
    // HELPERS PARA LOGOS DE EQUIPOS (centralizados)
    // ============================================================

    /**
     * Obtiene los candidatos de logo para un equipo usando la configuración centralizada.
     * @param {string} teamName
     * @returns {string[]} Arreglo de rutas de imagen (o [default] si no hay configuración)
     */
    function getTeamLogoCandidates(teamName) {
        var config = window.TOURNAMENT_CONFIG;
        if (config && config.helpers && typeof config.helpers.getTeamLogoCandidates === 'function') {
            return config.helpers.getTeamLogoCandidates(teamName);
        }
        // Fallback local: usar default
        return ['assets/logos/default_logo.png'];
    }

    /**
     * Obtiene el primer candidato de logo para un equipo.
     * @param {string} teamName
     * @returns {string} Ruta del primer candidato o default.
     */
    function getTeamLogo(teamName) {
        if (!teamName || teamName === 'PENDIENTE') {
            return 'assets/logos/default_logo.png';
        }
        var candidates = getTeamLogoCandidates(teamName);
        return candidates && candidates.length > 0 ? candidates[0] : 'assets/logos/default_logo.png';
    }

    /**
     * Función de fallback por extensiones para imágenes de equipo.
     * Se llama desde el evento onerror de la imagen.
     * @param {HTMLImageElement} imgElement
     * @param {string} teamName
     */
    function applyTeamLogoFallback(imgElement, teamName) {
        if (!imgElement) return;

        // Si el equipo es PENDIENTE, ya debería tener default y no llamar a esta función.
        // Pero por seguridad, si se llama, asignar default y quitar onerror.
        if (teamName === 'PENDIENTE') {
            imgElement.src = 'assets/logos/default_logo.png';
            imgElement.onerror = null;
            return;
        }

        var config = window.TOURNAMENT_CONFIG;
        if (!config || !config.helpers || typeof config.helpers.getTeamLogoCandidates !== 'function') {
            imgElement.src = 'assets/logos/default_logo.png';
            imgElement.onerror = null;
            return;
        }

        var candidates = config.helpers.getTeamLogoCandidates(teamName);
        if (!candidates || candidates.length === 0) {
            imgElement.src = 'assets/logos/default_logo.png';
            imgElement.onerror = null;
            return;
        }

        // Leer índice actual; si no existe o es 0, empezar en 1 (porque el primer candidato ya se usó)
        var currentIndex = parseInt(imgElement.dataset.logoRetryIndex);
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
        // El onerror seguirá llamando a esta función
    }

    // ============================================================
    // VARIABLES DE ESTADO
    // ============================================================

    var refreshInterval = null;
    var isLoading = false;
    var presentationActive = false;
    var lastFocusedElement = null;

    // ============================================================
    // CONFIGURACION
    // ============================================================

    function getConfig() {
        var source =
            window.TOURNAMENT_CONFIG &&
            window.TOURNAMENT_CONFIG.bracket &&
            window.TOURNAMENT_CONFIG.bracket.source;

        if (!source) {
            throw new Error(
                'window.TOURNAMENT_CONFIG.bracket.source no esta definido.'
            );
        }

        if (source.provider !== 'googlePublishedCsv') {
            throw new Error(
                'provider debe ser "googlePublishedCsv". Valor actual: ' +
                String(source.provider)
            );
        }

        if (!source.publishedId) {
            throw new Error(
                'publishedId es obligatorio en TOURNAMENT_CONFIG.bracket.source.'
            );
        }

        if (
            source.gid === undefined ||
            source.gid === null ||
            source.gid === ''
        ) {
            throw new Error(
                'gid es obligatorio en TOURNAMENT_CONFIG.bracket.source.'
            );
        }

        if (
            typeof source.refreshMs !== 'number' ||
            !Number.isFinite(source.refreshMs) ||
            source.refreshMs < 0
        ) {
            throw new Error(
                'refreshMs debe ser un numero finito mayor o igual a 0.'
            );
        }

        return source;
    }

    // ============================================================
    // UTILIDADES
    // ============================================================

    function getContainerId(side, round) {
        return side + '_' + round;
    }

    function getMatchId(side, round, llave) {
        return side + '_' + round + '_' + llave;
    }

    function isValidRound(round) {
        return round in ROUND_CONFIG;
    }

    function isValidContainer(containerId) {
        return ALLOWED_CONTAINERS.indexOf(containerId) !== -1;
    }

    function getWinThreshold(round) {
        return ROUND_CONFIG[round] ? ROUND_CONFIG[round].winThreshold : 2;
    }

    function getChecksCount(round) {
        return ROUND_CONFIG[round] ? ROUND_CONFIG[round].checksCount : 3;
    }

    function parseCheckValue(val) {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
            var lower = val.trim().toLowerCase();
            return lower === 'true' || lower === '1';
        }
        return false;
    }

    function encontrarPartido(container, matchId) {
        var matches = container.querySelectorAll('.hok-match');
        for (var i = 0; i < matches.length; i++) {
            if (matches[i].dataset.matchId === matchId) {
                return matches[i];
            }
        }
        return null;
    }

    function limpiarClasesPosicion(element) {
        var classList = element.classList;
        var toRemove = [];
        for (var i = 0; i < classList.length; i++) {
            var cls = classList[i];
            if (/^hok-match-R[3-6]-\d+$/.test(cls)) {
                toRemove.push(cls);
            }
        }
        for (var j = 0; j < toRemove.length; j++) {
            classList.remove(toRemove[j]);
        }
    }

    function asignarClasePosicion(matchDiv, round, llave) {
        limpiarClasesPosicion(matchDiv);
        var className = 'hok-match-' + round + '-' + llave;
        matchDiv.classList.add(className);
    }

    // ============================================================
    // PARSER CSV ROBUSTO
    // ============================================================

    function parseCSV(text) {
        var rows = [];
        var row = [];
        var cell = '';
        var inQuotes = false;
        var i = 0;

        text = String(text || '').replace(/^\uFEFF/, '');

        while (i < text.length) {
            var char = text.charAt(i);
            var nextChar = text.charAt(i + 1);

            if (inQuotes) {
                if (char === '"') {
                    if (nextChar === '"') {
                        cell += '"';
                        i += 2;
                        continue;
                    }

                    inQuotes = false;
                } else {
                    cell += char;
                }
            } else if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(cell);
                cell = '';
            } else if (char === '\r' || char === '\n') {
                row.push(cell);
                rows.push(row);

                row = [];
                cell = '';

                if (char === '\r' && nextChar === '\n') {
                    i += 1;
                }
            } else {
                cell += char;
            }

            i += 1;
        }

        if (cell !== '' || row.length > 0) {
            row.push(cell);
            rows.push(row);
        }

        return rows.filter(function (csvRow) {
            return csvRow.some(function (value) {
                return String(value).trim() !== '';
            });
        });
    }

    // ============================================================
    // FUNCIONES DE GOOGLE PUBLISHED CSV
    // ============================================================

    async function obtenerDatosDeSheets(config) {
        var url =
            'https://docs.google.com/spreadsheets/d/e/' +
            encodeURIComponent(config.publishedId) +
            '/pub?gid=' + encodeURIComponent(config.gid) +
            '&single=true&output=csv';

        var response = await fetch(url, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error('Error HTTP ' + response.status);
        }

        var text = await response.text();
        var rows = parseCSV(text);

        if (!rows || rows.length === 0) {
            throw new Error(
                'La hoja esta vacia o no se encontraron datos.'
            );
        }

        return rows;
    }

    function procesarDatosPartidos(rows) {
        var result = {};

        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            if (!row || row.length < 2) continue;

            var identifier = row[0] ? String(row[0]).trim() : '';
            var parts = identifier.split('_');
            if (parts.length !== 2) continue;

            var side = parts[0];
            var round = parts[1];

            if (!isValidRound(round)) continue;

            var containerId = getContainerId(side, round);
            if (!isValidContainer(containerId)) continue;

            var bracketConfig =
                window.TOURNAMENT_CONFIG &&
                window.TOURNAMENT_CONFIG.bracket;

            if (
                containerId === 'center_R6' &&
                bracketConfig &&
                bracketConfig.thirdPlaceEnabled === false
            ) {
                continue;
            }

            var llaveStr = row[1] ? String(row[1]).trim() : '';
            if (llaveStr === '') continue;
            var llaveNum = Number(llaveStr);
            if (!Number.isInteger(llaveNum) || llaveNum < 0) {
                console.warn('Fila ' + (r + 2) + ': llave invalida (' + llaveStr + '), se omite.');
                continue;
            }
            var llave = llaveNum;

            var matchId = getMatchId(side, round, llave);

            var checksCount = getChecksCount(round);

            var team1Name = row[2] ? String(row[2]).trim() : 'PENDIENTE';
            var team1Checks = [];
            for (var i = 0; i < checksCount; i++) {
                var val = (row[3 + i] !== undefined) ? row[3 + i] : false;
                team1Checks.push(parseCheckValue(val));
            }

            var team2Name = row[8] ? String(row[8]).trim() : 'PENDIENTE';
            var team2Checks = [];
            for (var j = 0; j < checksCount; j++) {
                var val2 = (row[9 + j] !== undefined) ? row[9 + j] : false;
                team2Checks.push(parseCheckValue(val2));
            }

            result[matchId] = {
                side: side,
                round: round,
                llave: llave,
                team1: {
                    nombre: team1Name,
                    checks: team1Checks,
                    round: round
                },
                team2: {
                    nombre: team2Name,
                    checks: team2Checks,
                    round: round
                }
            };
        }

        return result;
    }

    // ============================================================
    // RENDERIZADO
    // ============================================================

    function esGanador(teamData, round) {
        if (!teamData || !Array.isArray(teamData.checks)) return false;
        var wins = 0;
        for (var i = 0; i < teamData.checks.length; i++) {
            if (teamData.checks[i] === true) wins++;
        }
        var threshold = getWinThreshold(round);
        return wins >= threshold;
    }

    function crearEquipo(teamData, options) {
        var isWinner = options.isWinner || false;
        var isRunnerUp = options.isRunnerUp || false;
        var round = options.round || 'R3';

        var teamDiv = document.createElement('div');
        teamDiv.className = 'hok-team';

        if (isWinner) {
            teamDiv.classList.add('winner');
        }

        var teamName = teamData.nombre || 'PENDIENTE';
        var logoSrc;

        // Para PENDIENTE: usar default directamente y no intentar fallback
        if (teamName === 'PENDIENTE') {
            logoSrc = 'assets/logos/default_logo.png';
        } else {
            logoSrc = getTeamLogo(teamName);
        }

        var img = document.createElement('img');
        img.className = 'hok-team-logo';
        img.src = logoSrc;
        img.alt = teamName;
        img.setAttribute('aria-hidden', 'true');

        if (teamName === 'PENDIENTE') {
            // No gestionar fallback, usar default y desactivar onerror
            img.onerror = function() {
                this.src = 'assets/logos/default_logo.png';
                this.onerror = null;
            };
        } else {
            // Configurar fallback por extensiones
            img.dataset.logoManaged = 'team';
            img.dataset.logoRetryIndex = '1';
            img.onerror = function() {
                // Usar la función global applyTeamLogoFallback
                applyTeamLogoFallback(this, teamName);
            };
        }

        teamDiv.appendChild(img);

        var nameSpan = document.createElement('span');
        nameSpan.className = 'team-name';
        nameSpan.textContent = teamData.nombre || 'PENDIENTE';
        teamDiv.appendChild(nameSpan);

        var checksCount = getChecksCount(round);
        var killsContainer = document.createElement('div');
        killsContainer.className = 'hok-kills-container';
        var checks = teamData.checks || [];
        for (var i = 0; i < checksCount; i++) {
            var marker = document.createElement('span');
            marker.className = 'hok-kill-marked';
            if (i < checks.length && checks[i] === true) {
                marker.classList.add('hok-kill-active');
            }
            killsContainer.appendChild(marker);
        }
        teamDiv.appendChild(killsContainer);

        // Añadir icono de ganador
        if (isWinner) {
            if (round === 'R3' || round === 'R4') {
                var imgWin = document.createElement('img');
                imgWin.src = 'assets/win.png';
                imgWin.alt = '';
                imgWin.setAttribute('aria-hidden', 'true');
                imgWin.className = 'hok-win-game-icon';
                teamDiv.appendChild(imgWin);
            } else if (round === 'R5') {
                var finalWinnerImg = document.createElement('img');
                finalWinnerImg.src = 'assets/winner.png';
                finalWinnerImg.alt = '';
                finalWinnerImg.setAttribute('aria-hidden', 'true');
                finalWinnerImg.className = 'hok-final-winner-icon';

                finalWinnerImg.addEventListener('error', function () {
                    var fallback = document.createElement('span');
                    fallback.className = 'hok-winner-icon r5';
                    fallback.textContent = '\uD83C\uDFC6';

                    if (finalWinnerImg.parentNode) {
                        finalWinnerImg.parentNode.replaceChild(fallback, finalWinnerImg);
                    }
                });

                teamDiv.appendChild(finalWinnerImg);
            } else if (round === 'R6') {
                var iconSpan2 = document.createElement('span');
                iconSpan2.className = 'hok-winner-icon r6';
                iconSpan2.textContent = '\uD83E\uDD49';
                teamDiv.appendChild(iconSpan2);
            }
        } else if (isRunnerUp && round === 'R5') {
            var runnerSpan = document.createElement('span');
            runnerSpan.className = 'hok-winner-icon r6';
            runnerSpan.textContent = '\uD83E\uDD48';
            teamDiv.appendChild(runnerSpan);
        }

        return teamDiv;
    }

    function renderizarBracket(matchesData) {
        // Limpiar partidos obsoletos en cada contenedor
        for (var c = 0; c < ALLOWED_CONTAINERS.length; c++) {
            var containerId = ALLOWED_CONTAINERS[c];
            var container = document.getElementById(containerId);
            if (!container) continue;

            var existingMatchElements = container.querySelectorAll('.hok-match');

            var newIds = {};
            var matchKeys = Object.keys(matchesData);
            for (var k = 0; k < matchKeys.length; k++) {
                var match = matchesData[matchKeys[k]];
                var cId = getContainerId(match.side, match.round);
                if (cId === containerId) {
                    newIds[matchKeys[k]] = true;
                }
            }

            for (var e2 = 0; e2 < existingMatchElements.length; e2++) {
                var el = existingMatchElements[e2];
                var id2 = el.dataset.matchId;
                if (id2 && !newIds[id2]) {
                    el.remove();
                }
            }
        }

        // Agrupar por contenedor
        var grouped = {};
        var keys = Object.keys(matchesData);
        for (var k2 = 0; k2 < keys.length; k2++) {
            var matchItem = matchesData[keys[k2]];
            var containerId2 = getContainerId(matchItem.side, matchItem.round);
            if (!grouped[containerId2]) grouped[containerId2] = [];
            grouped[containerId2].push(matchItem);
        }

        var containerIds = Object.keys(grouped);
        for (var g = 0; g < containerIds.length; g++) {
            var cId2 = containerIds[g];
            var container2 = document.getElementById(cId2);
            if (!container2) continue;

            var matches = grouped[cId2];
            matches.sort(function(a, b) { return a.llave - b.llave; });

            for (var m = 0; m < matches.length; m++) {
                var match = matches[m];
                var matchId = getMatchId(match.side, match.round, match.llave);

                var matchDiv = encontrarPartido(container2, matchId);

                if (!matchDiv) {
                    matchDiv = document.createElement('div');
                    matchDiv.className = 'hok-match';
                    matchDiv.dataset.matchId = matchId;
                    asignarClasePosicion(matchDiv, match.round, match.llave);
                    container2.appendChild(matchDiv);
                } else {
                    asignarClasePosicion(matchDiv, match.round, match.llave);
                    matchDiv.replaceChildren();
                }

                var team1Winner = esGanador(match.team1, match.round);
                var team2Winner = esGanador(match.team2, match.round);

                if (team1Winner && team2Winner) {
                    console.warn('Ambos equipos son ganadores en el partido ' + matchId + '. No se marcara ganador.');
                    var team1El = crearEquipo(match.team1, { isWinner: false, isRunnerUp: false, round: match.round });
                    var team2El = crearEquipo(match.team2, { isWinner: false, isRunnerUp: false, round: match.round });
                    matchDiv.appendChild(team1El);
                    matchDiv.appendChild(team2El);
                } else {
                    var isRunnerUp1 = false;
                    var isRunnerUp2 = false;
                    if (match.round === 'R5') {
                        if (team1Winner && !team2Winner) {
                            isRunnerUp2 = true;
                        } else if (team2Winner && !team1Winner) {
                            isRunnerUp1 = true;
                        }
                    }
                    var team1El2 = crearEquipo(match.team1, { isWinner: team1Winner, isRunnerUp: isRunnerUp1, round: match.round });
                    var team2El2 = crearEquipo(match.team2, { isWinner: team2Winner, isRunnerUp: isRunnerUp2, round: match.round });
                    matchDiv.appendChild(team1El2);
                    matchDiv.appendChild(team2El2);
                }
            }
        }
    }

    // ============================================================
    // ESTADO Y MENSAJES
    // ============================================================

    function mostrarEstadoCarga() {
        var pageArea = document.querySelector('.hok-brackets-page');
        var loader = document.getElementById('bracket-loader');
        var container = document.getElementById('bracket-container');
        var statusDiv = document.getElementById('bracket-status');
        var reloadBtn = document.getElementById('reload-bracket-data');

        if (pageArea) {
            pageArea.classList.add('is-loading');
            pageArea.setAttribute('aria-busy', 'true');
        }

        if (loader) {
            loader.classList.remove('is-hidden');
            loader.setAttribute('aria-hidden', 'false');
        }

        if (container) {
            container.classList.add('is-hidden');
        }

        if (reloadBtn) {
            reloadBtn.disabled = true;
        }

        if (statusDiv) {
            statusDiv.textContent = 'Cargando llaves...';
            statusDiv.classList.remove('error');
            statusDiv.classList.remove('is-hidden');
        }
    }

    function mostrarEstadoExito() {
        var pageArea = document.querySelector('.hok-brackets-page');
        var loader = document.getElementById('bracket-loader');
        var container = document.getElementById('bracket-container');
        var statusDiv = document.getElementById('bracket-status');
        var reloadBtn = document.getElementById('reload-bracket-data');

        if (pageArea) {
            pageArea.classList.remove('is-loading');
            pageArea.setAttribute('aria-busy', 'false');
        }

        if (loader) {
            loader.classList.add('is-hidden');
            loader.setAttribute('aria-hidden', 'true');
        }

        if (container) {
            container.classList.remove('is-hidden');
        }

        if (reloadBtn) {
            reloadBtn.disabled = false;
        }

        if (statusDiv) {
            statusDiv.classList.add('is-hidden');
            statusDiv.classList.remove('error');
        }
    }

    function mostrarEstadoError(mensaje) {
        var pageArea = document.querySelector('.hok-brackets-page');
        var loader = document.getElementById('bracket-loader');
        var container = document.getElementById('bracket-container');
        var statusDiv = document.getElementById('bracket-status');
        var reloadBtn = document.getElementById('reload-bracket-data');

        if (pageArea) {
            pageArea.classList.remove('is-loading');
            pageArea.setAttribute('aria-busy', 'false');
        }

        if (loader) {
            loader.classList.add('is-hidden');
            loader.setAttribute('aria-hidden', 'true');
        }

        if (container) {
            container.classList.add('is-hidden');
        }

        if (reloadBtn) {
            reloadBtn.disabled = false;
        }

        if (statusDiv) {
            statusDiv.textContent = mensaje;
            statusDiv.classList.add('error');
            statusDiv.classList.remove('is-hidden');
        }
    }

    // ============================================================
    // CARGA PRINCIPAL
    // ============================================================

    async function cargarBracket() {
        if (isLoading) return;
        isLoading = true;

        mostrarEstadoCarga();

        try {
            var config = getConfig();

            var rows = await obtenerDatosDeSheets(config);
            var matchesData = procesarDatosPartidos(rows);

            if (Object.keys(matchesData).length === 0) {
                throw new Error('No se encontraron partidos para las rondas permitidas (R3, R4, R5, R6).');
            }

            renderizarBracket(matchesData);
            mostrarEstadoExito();

        } catch (error) {
            console.error('Error al cargar bracket:', error);
            mostrarEstadoError('Error al cargar datos: ' + error.message);
        } finally {
            isLoading = false;
        }
    }

    // ============================================================
    // ACTUALIZACION AUTOMATICA
    // ============================================================

    function configurarActualizacionAutomatica() {
        try {
            var config = getConfig();

            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }

            if (config.refreshMs > 0) {
                refreshInterval = setInterval(cargarBracket, config.refreshMs);
            }
        } catch (err) {
            console.error('[brackets.js] Error al configurar actualizacion automatica:', err.message);
        }
    }

    // ============================================================
    // MODO PRESENTACION
    // ============================================================

    function abrirPresentacion() {
        var overlay = document.getElementById('presentation-overlay');
        var toggleBtn = document.getElementById('presentation-mode-toggle');

        if (!overlay) return;

        lastFocusedElement = document.activeElement;

        var presentationBracket = document.getElementById('presentation-bracket');
        if (presentationBracket) {
            presentationBracket.replaceChildren();
            var mainBracket = document.getElementById('bracket-container');

            if (mainBracket) {
                var hasMatches = mainBracket.querySelector('.hok-match') !== null;
                if (hasMatches) {
                    var clone = mainBracket.cloneNode(true);
                    clone.removeAttribute('id');
                    var allElements = clone.querySelectorAll('[id]');
                    for (var i = 0; i < allElements.length; i++) {
                        allElements[i].removeAttribute('id');
                    }
                    clone.classList.remove('is-hidden');
                    clone.classList.add('presentation-bracket-clone');
                    presentationBracket.appendChild(clone);
                } else {
                    var msg = document.createElement('p');
                    msg.textContent = 'No hay datos de bracket para mostrar.';
                    presentationBracket.appendChild(msg);
                }
            } else {
                var msg2 = document.createElement('p');
                msg2.textContent = 'No hay datos de bracket para mostrar.';
                presentationBracket.appendChild(msg2);
            }
        }

        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('presentation-active');

        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'true');
        }

        presentationActive = true;
        overlay.focus();
    }

    function cerrarPresentacion() {
        var overlay = document.getElementById('presentation-overlay');
        var toggleBtn = document.getElementById('presentation-mode-toggle');

        if (!overlay) return;

        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('presentation-active');

        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'false');
        }

        presentationActive = false;

        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    }

    function togglePresentacion() {
        if (presentationActive) {
            cerrarPresentacion();
        } else {
            abrirPresentacion();
        }
    }

    // ============================================================
    // NAVEGACION MOVIL
    // ============================================================

    function initMobileNav() {
        var navToggle = document.getElementById('nav-toggle');
        var navMenu = document.getElementById('nav-menu');

        if (!navToggle || !navMenu) return;

        navToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            var isOpen = navMenu.classList.toggle('active');
            navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        var links = navMenu.querySelectorAll('a');
        for (var i = 0; i < links.length; i++) {
            links[i].addEventListener('click', function() {
                navMenu.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        }

        document.addEventListener('click', function(e) {
            if (navMenu.classList.contains('active')) {
                var navContainer = navMenu.closest('.nav-container');
                if (navContainer && !navContainer.contains(e.target)) {
                    navMenu.classList.remove('active');
                    navToggle.setAttribute('aria-expanded', 'false');
                }
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // ============================================================
    // EVENTOS E INICIALIZACION
    // ============================================================

    function setupEventListeners() {
        var reloadBtn = document.getElementById('reload-bracket-data');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', function() {
                cargarBracket();
            });
        }

        var presentationToggle = document.getElementById('presentation-mode-toggle');
        if (presentationToggle) {
            presentationToggle.addEventListener('click', togglePresentacion);
        }

        var overlay = document.getElementById('presentation-overlay');
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) {
                    cerrarPresentacion();
                }
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && presentationActive) {
                cerrarPresentacion();
            }
        });

        initMobileNav();
    }

    function aplicarConfiguracionTercerPuesto() {
        var bracketConfig =
            window.TOURNAMENT_CONFIG &&
            window.TOURNAMENT_CONFIG.bracket;

        var thirdPlaceContainer =
            document.getElementById('center_R6');

        if (!thirdPlaceContainer) {
            return;
        }

        var isEnabled =
            !bracketConfig ||
            bracketConfig.thirdPlaceEnabled !== false;

        thirdPlaceContainer.classList.toggle(
            'is-hidden',
            !isEnabled
        );
    }

    function iniciar() {
        setupEventListeners();
        aplicarConfiguracionTercerPuesto();
        configurarActualizacionAutomatica();
        cargarBracket();
    }

    // ============================================================
    // INICIO
    // ============================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

})();