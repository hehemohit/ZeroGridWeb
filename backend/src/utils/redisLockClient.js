/**
 * ZeroGrid Backend Redis Lock Client
 * Manages atomic concurrency for field emergency response units (SET NX EX).
 * Provides graceful in-memory fallback simulation if ElastiCache cluster is unreachable.
 */

const Redis = require('ioredis');

const rawHost = process.env.REDIS_HOST || 'localhost';
const REDIS_HOST = rawHost.includes(':') ? rawHost.split(':')[0] : rawHost;
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const DEFAULT_TEAMS = [
  {
    team_id: 'TEAM_NDRF_ALPHA',
    name: 'NDRF Flood Rescue Alpha',
    category: 'FLOOD_RESCUE',
    base_location: 'Virar East Staging',
    capacity: 8,
    equipment: ['Zodiac Inflatable Boats', 'Thermal Drone', 'Dewatering Pumps']
  },
  {
    team_id: 'TEAM_NDRF_BRAVO',
    name: 'NDRF Rapid Evacuation Bravo',
    category: 'EVACUATION',
    base_location: 'Vasai West Depot',
    capacity: 12,
    equipment: ['High-Clearance Rescue Trucks', 'Lifejackets', 'Medical Kit']
  },
  {
    team_id: 'TEAM_PUMP_CREW_01',
    name: 'Municipal Dewatering Squad 01',
    category: 'DEWATERING',
    base_location: 'Ward 4 Pumping Station',
    capacity: 4,
    equipment: ['500-HP High-Volume Submersible Pumps', 'Discharge Conduits']
  },
  {
    team_id: 'TEAM_LINEMEN_SQUAD_04',
    name: 'MSEDCL High-Voltage Linemen',
    category: 'ELECTRICAL_GRID',
    base_location: 'Virar East 33kV Switchyard',
    capacity: 6,
    equipment: ['Dielectric Hot Sticks', 'Grounding Clamps', 'Megger Insulation Testers']
  },
  {
    team_id: 'TEAM_VASAI_RESCUE_02',
    name: 'Civil Defense Quick Response 02',
    category: 'PARAMEDIC_RESCUE',
    base_location: 'Sanjeevani Hospital Staging',
    capacity: 6,
    equipment: ['Ambulance Unit', 'Field Triage Kit', 'Emergency Defibrillator']
  }
];

class RedisLockManager {
  constructor() {
    this.client = null;
    this.isSimulation = false;
    this.inMemoryLocks = new Map(); // teamId -> { incidentId, expiresAt }
    this.initClient();
  }

  initClient() {
    try {
      const client = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD,
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Do not hang on retry loops
        lazyConnect: true
      });

      client.connect()
        .then(() => {
          console.log(`[ZeroGrid Redis] Connected to ElastiCache cluster at ${REDIS_HOST}:${REDIS_PORT}`);
          this.client = client;
          this.isSimulation = false;
        })
        .catch((err) => {
          console.warn(`[ZeroGrid Redis] ElastiCache unavailable (${err.message}). Using In-Memory Lock Simulator.`);
          this.isSimulation = true;
        });

      client.on('error', (err) => {
        if (!this.isSimulation) {
          console.warn(`[ZeroGrid Redis] Connection dropped (${err.message}). Switching to In-Memory Simulator.`);
          this.isSimulation = true;
        }
      });
    } catch (e) {
      this.isSimulation = true;
    }
  }

  /**
   * Atomically locks a team to an incident (SET NX EX)
   */
  async acquireTeamLock(teamId, incidentId, ttlSeconds = 1800) {
    const lockKey = `zerogrid:team:${teamId}:lock`;

    if (!this.isSimulation && this.client && this.client.status === 'ready') {
      try {
        const res = await this.client.set(lockKey, incidentId, 'EX', ttlSeconds, 'NX');
        if (res === 'OK') {
          return {
            success: true,
            teamId,
            state: 'ASSIGNED',
            incidentId,
            source: 'ELASTICACHE'
          };
        }
        const holder = await this.client.get(lockKey);
        return {
          success: false,
          teamId,
          state: 'ASSIGNED',
          currentIncident: holder,
          error: `Team ${teamId} is already committed to incident ${holder}`,
          source: 'ELASTICACHE'
        };
      } catch (err) {
        this.isSimulation = true;
      }
    }

    // In-Memory Simulation
    const now = Date.now();
    const existing = this.inMemoryLocks.get(teamId);
    if (existing && existing.expiresAt > now) {
      return {
        success: false,
        teamId,
        state: 'ASSIGNED',
        currentIncident: existing.incidentId,
        error: `Team ${teamId} is already committed to incident ${existing.incidentId}`,
        source: 'IN_MEMORY_SIMULATION'
      };
    }

    this.inMemoryLocks.set(teamId, {
      incidentId,
      expiresAt: now + ttlSeconds * 1000
    });

    return {
      success: true,
      teamId,
      state: 'ASSIGNED',
      incidentId,
      source: 'IN_MEMORY_SIMULATION'
    };
  }

  /**
   * Releases team lock back to IDLE
   */
  async releaseTeamLock(teamId) {
    const lockKey = `zerogrid:team:${teamId}:lock`;

    if (!this.isSimulation && this.client && this.client.status === 'ready') {
      try {
        await this.client.del(lockKey);
        return { success: true, teamId, state: 'IDLE', source: 'ELASTICACHE' };
      } catch (err) {
        this.isSimulation = true;
      }
    }

    this.inMemoryLocks.delete(teamId);
    return { success: true, teamId, state: 'IDLE', source: 'IN_MEMORY_SIMULATION' };
  }

  /**
   * Checks status of a specific team
   */
  async getTeamStatus(teamId) {
    const lockKey = `zerogrid:team:${teamId}:lock`;

    if (!this.isSimulation && this.client && this.client.status === 'ready') {
      try {
        const incidentId = await this.client.get(lockKey);
        return {
          teamId,
          state: incidentId ? 'ASSIGNED' : 'IDLE',
          activeIncidentId: incidentId || null,
          isAvailable: !incidentId
        };
      } catch (err) {
        this.isSimulation = true;
      }
    }

    const now = Date.now();
    const existing = this.inMemoryLocks.get(teamId);
    if (existing && existing.expiresAt > now) {
      return {
        teamId,
        state: 'ASSIGNED',
        activeIncidentId: existing.incidentId,
        isAvailable: false
      };
    }

    return {
      teamId,
      state: 'IDLE',
      activeIncidentId: null,
      isAvailable: true
    };
  }

  /**
   * Returns all teams with real-time atomic availability
   */
  async getAllTeamStatuses() {
    const results = [];
    for (const team of DEFAULT_TEAMS) {
      const status = await this.getTeamStatus(team.team_id);
      results.push({
        ...team,
        ...status
      });
    }
    return results;
  }
}

const redisLockManager = new RedisLockManager();

module.exports = {
  redisLockManager,
  DEFAULT_TEAMS
};
