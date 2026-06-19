(function () {
  'use strict';

  var CONFIG = {};

  // ============================================================
  //  GENERAL
  // ============================================================
  CONFIG.general = {
    id: 'hok_ultrachaos',
    name: 'Honor of Kings: Ultra Chaos',
    mainMode: 'Ultra Chaos 5v5',
    fallbackMode: 'Standard 5v5',
    format: 'Single Elimination · Bo3',
    totalTeams: 16,
    playersPerTeam: 5,
    optionalSubstitute: true
  };

  // ============================================================
  //  PRODUCCIÓN
  // ============================================================
  CONFIG.production = {
    leagueOpsLead: 'TBC',
    streamingChannels: ['Facebook', 'TikTok', 'YouTube'],
    host: 'TBC',
    voiceActors: 'TBC',
    technicalTeam: 'TBC',
    hokTeam: 'Antonio León',
    showStartTimeMX: '6:00 PM',
    discordChannel: 'TBC',
    prizePool: 'Four Infinix smartphones for the champion team (TBC)'
  };

  // ============================================================
  //  UI – rutas de assets y resolución de presentación
  // ============================================================
  CONFIG.ui = {
    backgroundImage: '../assets/background.png',
    defaultLogo: 'assets/logos/default_logo.png',
    logo: 'assets/logo.png',
    presentationResolution: {
      width: 1920,
      height: 1080
    },
    teamColors: [
      '#E63946',
      '#3A86FF',
      '#2EC4B6',
      '#FFBE0B',
      '#8338EC',
      '#FB5607',
      '#06D6A0',
      '#FF70A6'
    ]
  };

  // ============================================================
  //  FASES
  // ============================================================
  // day1_qualifiers y cuartos son alias que apuntan a la misma fase
  // y comparten la misma carpeta y archivos.
  CONFIG.phases = {
    day1_qualifiers: {
      id: 'day1_qualifiers',
      label: 'Day 1 Qualifiers',
      day: 1,
      mode: 'Ultra Chaos 5v5',
      format: 'Single Elimination',
      matchFormat: 'Bo3',
      totalSeries: 4,
      folder: 'data/cuartos/',
      enabled: true
    },
    cuartos: {
      id: 'cuartos',
      label: 'Day 1 Qualifiers',
      day: 1,
      mode: 'Ultra Chaos 5v5',
      format: 'Single Elimination',
      matchFormat: 'Bo3',
      totalSeries: 4,
      folder: 'data/cuartos/',
      enabled: true
    },
    semifinal: {
      id: 'semifinal',
      label: 'Semifinals',
      day: 2,
      mode: 'Ultra Chaos 5v5',
      format: 'Single Elimination',
      matchFormat: 'Bo3',
      totalSeries: 2,
      folder: 'data/semifinal/',
      enabled: true
    },
    final: {
      id: 'final',
      label: 'Final',
      day: 2,
      mode: 'Ultra Chaos 5v5',
      format: 'Single Elimination',
      matchFormat: 'Bo3',
      totalSeries: 1,
      folder: 'data/final/',
      enabled: true
    }
  };

  // ============================================================
  //  DEFAULTS
  // ============================================================
  CONFIG.defaults = {
    phase: 'cuartos'
  };

  // ============================================================
  //  MÉTRICAS POR MODO DE JUEGO
  // ============================================================
  CONFIG.statsModes = {
    modo_5v5: false,
    modo_chaos: true
  };

  CONFIG.statMetrics = {
    modo_5v5: [
      {
        key: 'participation',
        label: 'Participación',
        format: 'percentage',
        aggregation: 'average'
      },
      {
        key: 'crowdControl',
        label: 'Control de masas',
        format: 'number',
        aggregation: 'average'
      },
      {
        key: 'towerDamage',
        label: 'Daño a las torres',
        format: 'number',
        aggregation: 'sum'
      },
      {
        key: 'kills',
        label: 'Eliminaciones',
        format: 'number',
        aggregation: 'sum'
      },
      {
        key: 'deaths',
        label: 'Muertes',
        format: 'number',
        aggregation: 'sum'
      },
      {
        key: 'assists',
        label: 'Asistencias',
        format: 'number',
        aggregation: 'sum'
      },
      {
        key: 'gold',
        label: 'Oro',
        format: 'number',
        aggregation: 'sum'
      }
    ],
    modo_chaos: [
      {
        key: 'heroDamageDealt',
        label: 'Daño infligido a héroes',
        format: 'number',
        aggregation: 'sum'
      },
      {
        key: 'heroDamageTaken',
        label: 'Daño recibido de héroes',
        format: 'number',
        aggregation: 'sum'
      },
      {
        key: 'goldPercentage',
        label: 'Porcentaje de oro',
        format: 'percentage',
        aggregation: 'average'
      },
      {
        key: 'teamFightPresence',
        label: 'Presencia en peleas en equipo',
        format: 'percentage',
        aggregation: 'average'
      }
    ]
  };

  // ============================================================
  //  ARCHIVOS CSV POR FASE
  // ============================================================
  CONFIG.files = {
    day1_qualifiers: [
      'Q1M1.csv', 'Q1M2.csv', 'Q1M3.csv',
      'Q2M1.csv', 'Q2M2.csv', 'Q2M3.csv',
      'Q3M1.csv', 'Q3M2.csv', 'Q3M3.csv',
      'Q4M1.csv', 'Q4M2.csv', 'Q4M3.csv'
    ],
    cuartos: [
      'Q1M1.csv', 'Q1M2.csv', 'Q1M3.csv',
      'Q2M1.csv', 'Q2M2.csv', 'Q2M3.csv',
      'Q3M1.csv', 'Q3M2.csv', 'Q3M3.csv',
      'Q4M1.csv', 'Q4M2.csv', 'Q4M3.csv'
    ],
    semifinal: [
      'SF1M1.csv', 'SF1M2.csv', 'SF1M3.csv',
      'SF2M1.csv', 'SF2M2.csv', 'SF2M3.csv'
    ],
    final: [
      'FM1.csv', 'FM2.csv', 'FM3.csv'
    ]
  };

  // ============================================================
  //  ALIAS DE CAMPOS CSV (sin cambios)
  // ============================================================
  CONFIG.csvFields = {
    team: ['EQUIPO', 'Equipo', 'Team'],
    player: ['JUGADOR', 'Jugador', 'Player'],
    kills: ['Eliminaciones', 'eliminaciones', 'Kills'],
    deaths: ['Muertes', 'muertes', 'Deaths'],
    assists: ['Asistencias', 'Asistencia', 'asistencia', 'Assists'],
    gold: ['Oro', 'oro', 'Oro total', 'Gold'],
    heroDamageDealt: [
      'Daño infligido a héroes', 'Daño inflingido a héroes',
      'DÑO infligido', 'Daño infligido', 'Dano infligido',
      'Damage Dealt', 'Hero Damage Dealt'
    ],
    heroDamageTaken: [
      'Daño recibido de héroes', 'DÑO recibido',
      'Daño recibido', 'Dano recibido',
      'Damage Taken', 'Hero Damage Taken'
    ],
    goldPercentage: [
      'Porcentaje de oro', 'Porcentaje de Oro',
      '% de oro', '% de Oro', 'Gold Percentage'
    ],
    teamFightPresence: [
      'Presencia en peleas en equipo', 'Presencia en Peleas en Equipo',
      'Presencia en peleas', 'Presencia en Peleas', 'Team Fight Presence'
    ],
    participation: ['Participación', 'Participacion', 'Participation'],
    winner: ['GANADOR', 'Ganador', 'Winner'],
    crowdControl: ['Control de masas', 'Control de Masas', 'Crowd Control'],
    towerDamage: [
      'DÑO a las torres', 'DÑO a Torres',
      'Daño a las torres', 'Daño a Torres',
      'Dano a las torres', 'Dano a Torres',
      'Tower Damage'
    ]
  };

  // ============================================================
  //  BRACKET – Llave desde cuartos
  // ============================================================
  CONFIG.bracket = {
    initialRound: 'cuartos',
    totalTeams: 8,
    thirdPlaceEnabled: false,
    source: {
      provider: 'googlePublishedCsv',
      publishedId: '2PACX-1vS4xR8_pBQDVH3djlyFnMCjQ06smfvSK75xykdZdMFXTdzSv4BkMio0ZZDAa0aAT4mNiyqRd62VI0bI',
      gid: '1545050009',
      refreshMs: 300000
    },
    rounds: {
      cuartos: {
        id: 'cuartos',
        label: 'Cuartos',
        matches: 4,
        bestOf: 3,
        winThreshold: 2
      },
      semifinal: {
        id: 'semifinal',
        label: 'Semifinal',
        matches: 2,
        bestOf: 3,
        winThreshold: 2
      },
      final: {
        id: 'final',
        label: 'Final',
        matches: 1,
        bestOf: 3,
        winThreshold: 2
      },
      third_place: {
        id: 'third_place',
        label: 'Tercer puesto',
        matches: 1,
        bestOf: 3,
        winThreshold: 2,
        optional: true
      }
    }
  };

  // ============================================================
  //  HELPERS
  // ============================================================
  CONFIG.helpers = {

    // ----- helpers existentes -----
    getPhase: function (phaseId) {
      return CONFIG.phases[phaseId] || null;
    },
    isPhaseEnabled: function (phaseId) {
      var phase = this.getPhase(phaseId);
      return !!(phase && phase.enabled);
    },
    getPhaseFolder: function (phaseId) {
      var phase = CONFIG.phases[phaseId];
      return (phase && phase.folder) ? phase.folder : '';
    },
    getPhaseFiles: function (phaseId) {
      return CONFIG.files[phaseId] || [];
    },
    getPhaseFilePaths: function (phaseId) {
      var folder = this.getPhaseFolder(phaseId);
      var files = this.getPhaseFiles(phaseId);
      if (!folder || !files.length) return [];
      return files.map(function (file) {
        return folder + file;
      });
    },
    getCsvFieldAliases: function (fieldKey) {
      return CONFIG.csvFields[fieldKey] || [];
    },
    getCsvValue: function (row, fieldKey) {
      var aliases = CONFIG.csvFields[fieldKey] || [];
      if (!row || !aliases.length) return null;
      for (var i = 0; i < aliases.length; i++) {
        var fieldName = aliases[i];
        if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
          var rawValue = row[fieldName];
          if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
            return null;
          }
          return rawValue;
        }
      }
      return null;
    },
    getNumericCsvValue: function (row, fieldKey) {
      var rawValue = this.getCsvValue(row, fieldKey);
      if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
        return null;
      }
      var normalizedValue = String(rawValue)
        .replace(/,/g, '')
        .replace('%', '')
        .trim();
      var numericValue = Number(normalizedValue);
      if (!Number.isFinite(numericValue)) {
        return null;
      }
      return numericValue;
    },

    // ----- nuevos helpers para bracket -----
    getBracketRound: function (roundId) {
      return CONFIG.bracket.rounds[roundId] || null;
    },
    getBracketRoundLabel: function (roundId) {
      var round = this.getBracketRound(roundId);
      return round ? round.label : null;
    },
    getBracketBestOf: function (roundId) {
      var round = this.getBracketRound(roundId);
      return round ? round.bestOf : null;
    },
    getBracketWinThreshold: function (roundId) {
      var round = this.getBracketRound(roundId);
      return round ? round.winThreshold : null;
    },
    getDefaultLogoPath: function () {
      return CONFIG.ui.defaultLogo;
    },
    normalizeAssetPath: function (path) {
      if (!path) return '';
      return path.indexOf('../') === 0 ? path.slice(3) : path;
    },

    // ----- nuevo helper para colores de equipos -----
    getTeamColor: function (teamName, teamList) {
      var colors = CONFIG.ui.teamColors || [];
      var index = Array.isArray(teamList) ? teamList.indexOf(teamName) : -1;
      if (index < 0) index = 0;
      return colors[index % colors.length];
    },

    // ----- nuevo helper para métricas habilitadas -----
    getEnabledStatMetrics: function () {
      var metrics = [];
      var fiveEnabled = window.isModo5v5Enabled ? window.isModo5v5Enabled() : false;
      var chaosEnabled = window.isModoChaosEnabled ? window.isModoChaosEnabled() : false;

      if (fiveEnabled) {
        metrics = metrics.concat(CONFIG.statMetrics.modo_5v5 || []);
      }
      if (chaosEnabled) {
        metrics = metrics.concat(CONFIG.statMetrics.modo_chaos || []);
      }
      return metrics;
    }
  };

  // ============================================================
  //  FUNCIONES GLOBALES DE ESTADO DE MODOS
  // ============================================================
  window.isModo5v5Enabled = function () {
    return window.TOURNAMENT_CONFIG?.statsModes?.modo_5v5 === true;
  };

  window.isModoChaosEnabled = function () {
    return window.TOURNAMENT_CONFIG?.statsModes?.modo_chaos === true;
  };

  // ============================================================
  //  VALIDACIÓN NO DESTRUCTIVA
  // ============================================================
  (function validateConfig() {
    var warnings = [];

    // Verificar que cada fase tenga folder y files
    var phases = CONFIG.phases;
    for (var phaseId in phases) {
      if (Object.prototype.hasOwnProperty.call(phases, phaseId)) {
        var phase = phases[phaseId];
        var folder = phase.folder;
        var files = CONFIG.files[phaseId];
        if (!folder) {
          warnings.push('La fase "' + phaseId + '" no tiene definida una carpeta (folder).');
        }
        if (!files || !files.length) {
          warnings.push('La fase "' + phaseId + '" no tiene archivos CSV definidos (files).');
        }
      }
    }

    // Validar coherencia entre general.totalTeams y bracket.totalTeams
    // Se omite porque el bracket visible comienza después de una clasificación previa.

    // Validar que final.matchFormat coincida con bracket.rounds.final.bestOf
    var finalPhase = CONFIG.phases.final;
    var finalRound = CONFIG.bracket.rounds.final;
    if (finalPhase && finalRound) {
      var phaseMatchFormat = finalPhase.matchFormat;
      var roundBestOf = finalRound.bestOf;
      if (phaseMatchFormat) {
        var expectedBo = 'Bo' + roundBestOf;
        if (phaseMatchFormat !== expectedBo) {
          warnings.push(
            'La fase final tiene matchFormat "' + phaseMatchFormat + '" pero bracket.rounds.final.bestOf es ' +
            roundBestOf + ' (esperado "' + expectedBo + '"). Se recomienda que coincidan.'
          );
        }
      }
    }

    // Validar que la final tenga al menos 3 archivos para Bo3
    var finalFiles = CONFIG.files.final;
    if (finalFiles && finalFiles.length < 3) {
      warnings.push(
        'La final tiene solo ' + finalFiles.length + ' archivos CSV, pero se esperan al menos 3 para un Bo3 ' +
        '(ya que pueden necesitarse hasta 3 partidas).'
      );
    }

    if (warnings.length) {
      if (typeof console !== 'undefined') {
        console.warn('[TOURNAMENT_CONFIG] Advertencias de configuración:');
        warnings.forEach(function (msg) {
          console.warn(' - ' + msg);
        });
      }
    }
  })();

  // ============================================================
  //  EXPOSICIÓN GLOBAL
  // ============================================================
  window.TOURNAMENT_CONFIG = CONFIG;

  if (typeof console !== 'undefined') {
    console.log('[TOURNAMENT_CONFIG] Loaded:', CONFIG.general.name);
  }

})();