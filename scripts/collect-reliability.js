/**
 * Collect Route Reliability Data
 *
 * Fetches GTFS-RT TripUpdate feeds from OC Transpo (JSON) and STO (protobuf),
 * computes delay deltas against scheduled stop_times, and upserts results
 * into the route_reliability table in Supabase.
 *
 * Runs every 5 minutes via GitHub Actions.
 */

const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const OC_KEY = process.env.OC_TRANSPO_API_KEY;

const OC_FEED_URL =
  'https://nextrip-public-api.azure-api.net/octranspo/gtfs-rt-tp/beta/v1/TripUpdates?format=json';
const STO_FEED_URL =
  'https://sto.ca/sites/default/files/opendata/gtfs_rt/TripUpdates.pb';

if (!SB_URL || !SB_KEY || !OC_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase helper
// ---------------------------------------------------------------------------

async function sbFetch(path, opts = {}) {
  const url = SB_URL + '/rest/v1/' + path;
  const headers = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  const r = await fetch(url, { ...opts, headers });
  if (!r.ok) {
    const text = await r.text();
    throw new Error('Supabase ' + r.status + ': ' + text);
  }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('json')) return r.json();
  return null;
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function timeToMins(t) {
  if (!t) return 9999;
  const p = t.split(':').map(Number);
  return p[0] * 60 + (p[1] || 0);
}

function buildRecords(uniquePreds, scheduleMap, todayStr, offsetHours, agency) {
  const records = [];
  let statsFromDelay = 0;
  let statsFromComputed = 0;

  for (const p of uniquePreds) {
    const schedTime = scheduleMap[p.stopId + '|' + p.tripId];
    if (!schedTime) continue;

    let deltaMin;
    if (p.delaySec !== null) {
      deltaMin = Math.round(p.delaySec / 6) / 10;
      statsFromDelay++;
    } else {
      const schedMins = timeToMins(schedTime);
      if (schedMins === 9999) continue;
      const schedH = Math.floor(schedMins / 60) % 24;
      const schedM = schedMins % 60;
      const schedS =
        schedTime.split(':').length >= 3
          ? parseInt(schedTime.split(':')[2] || 0)
          : 0;
      const schedStr =
        todayStr +
        'T' +
        String(schedH).padStart(2, '0') +
        ':' +
        String(schedM).padStart(2, '0') +
        ':' +
        String(schedS).padStart(2, '0') +
        'Z';
      let schedEpoch = new Date(schedStr).getTime() / 1000 + offsetHours * 3600;
      if (schedMins >= 1440) schedEpoch -= 86400;
      const deltaSec = p.predictedEpoch - schedEpoch;
      deltaMin = Math.round(deltaSec / 6) / 10;
      statsFromComputed++;
    }

    if (Math.abs(deltaMin) > 60) continue;

    records.push({
      route_id: p.routeId,
      stop_id: p.stopId,
      trip_id: p.tripId,
      scheduled_time: schedTime,
      delta_minutes: deltaMin,
      on_time: Math.abs(deltaMin) <= 3,
      recorded_date: todayStr,
      agency,
    });
  }

  console.log(
    '[' + agency + '] ' + records.length + ' records (fromDelay=' +
    statsFromDelay + ' fromComputed=' + statsFromComputed + ')'
  );
  return records;
}

async function lookupSchedules(uniquePreds, agency) {
  const tripIds = [...new Set(uniquePreds.map((p) => p.tripId))];
  const stopIds = new Set(uniquePreds.map((p) => p.stopId));
  const scheduleMap = {};
  const CHUNK = 20;

  for (let i = 0; i < tripIds.length; i += CHUNK) {
    const chunk = tripIds.slice(i, i + CHUNK);
    const inList = 'in.(' + chunk.map((id) => '"' + id + '"').join(',') + ')';
    try {
      const rows = await sbFetch(
        'stop_times?select=stop_id,trip_id,arrival_time&trip_id=' +
          encodeURIComponent(inList) +
          '&agency=eq.' + agency +
          '&limit=5000',
        { headers: { Accept: 'application/json' } }
      );
      for (const row of rows || []) {
        if (stopIds.has(String(row.stop_id))) {
          scheduleMap[row.stop_id + '|' + row.trip_id] = row.arrival_time;
        }
      }
    } catch (e) {
      console.warn('[' + agency + '] Schedule lookup error:', e.message);
    }
  }

  console.log('[' + agency + '] ' + Object.keys(scheduleMap).length + ' schedule matches');
  return scheduleMap;
}

async function upsertRecords(records, agency) {
  if (records.length === 0) return;
  const UP_CHUNK = 200;
  for (let i = 0; i < records.length; i += UP_CHUNK) {
    const chunk = records.slice(i, i + UP_CHUNK);
    try {
      await sbFetch('route_reliability', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(chunk),
      });
      console.log('[' + agency + '] Upserted ' + chunk.length + ' records');
    } catch (e) {
      try {
        await sbFetch('route_reliability', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: JSON.stringify(chunk),
        });
        console.log('[' + agency + '] Inserted ' + chunk.length + ' records (no dedup)');
      } catch (e2) {
        console.error('[' + agency + '] Insert failed:', e2.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// OC Transpo — JSON GTFS-RT feed
// ---------------------------------------------------------------------------

async function collectOC(now, todayStr, offsetHours) {
  console.log('[OC] Fetching GTFS-RT feed...');
  const r = await fetch(OC_FEED_URL, {
    headers: { 'Ocp-Apim-Subscription-Key': OC_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('GTFS-RT HTTP ' + r.status);
  const rtData = await r.json();
  const entities = rtData?.Entity || [];
  console.log('[OC] ' + entities.length + ' trip entities');
  if (entities.length === 0) return;

  const predictions = [];
  let statsHasDelay = 0;
  let statsComputed = 0;
  let statsSkipped = 0;

  for (const ent of entities) {
    const tu = ent.TripUpdate;
    if (!tu?.Trip) continue;
    const routeId = String(tu.Trip.RouteId || '');
    const tripId = String(tu.Trip.TripId || '');
    if (!routeId || !tripId) continue;

    for (const stu of tu.StopTimeUpdate || []) {
      const dep = stu.Departure;
      if (!dep) { statsSkipped++; continue; }

      const depTime = parseInt(dep.Time || 0);
      if (!depTime) { statsSkipped++; continue; }

      const delta = depTime - now;
      if (delta < -120 || delta > 600) continue;

      if (dep.HasDelay === true) {
        predictions.push({
          routeId, tripId,
          stopId: String(stu.StopId),
          delaySec: parseInt(dep.Delay || 0),
          source: 'hasDelay',
        });
        statsHasDelay++;
      } else {
        predictions.push({
          routeId, tripId,
          stopId: String(stu.StopId),
          predictedEpoch: depTime,
          delaySec: null,
          source: 'computed',
        });
        statsComputed++;
      }
    }
  }

  console.log(
    '[OC] ' + predictions.length + ' imminent predictions (hasDelay=' +
    statsHasDelay + ' computed=' + statsComputed + ' skipped=' + statsSkipped + ')'
  );
  if (predictions.length === 0) return;

  const dedupMap = new Map();
  for (const p of predictions) {
    const key = p.stopId + '|' + p.tripId;
    if (!dedupMap.has(key)) dedupMap.set(key, p);
  }
  const uniquePreds = [...dedupMap.values()];

  const scheduleMap = await lookupSchedules(uniquePreds, 'OC');
  const records = buildRecords(uniquePreds, scheduleMap, todayStr, offsetHours, 'OC');
  await upsertRecords(records, 'OC');
  console.log('[OC] Done — ' + records.length + ' records');
}

// ---------------------------------------------------------------------------
// STO — Protobuf GTFS-RT feed
// ---------------------------------------------------------------------------

async function collectSTO(now, todayStr, offsetHours) {
  console.log('[STO] Fetching GTFS-RT feed...');
  const r = await fetch(STO_FEED_URL, {
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('STO GTFS-RT HTTP ' + r.status);
  const buffer = await r.arrayBuffer();
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(buffer)
  );
  const entities = feed.entity || [];
  console.log('[STO] ' + entities.length + ' trip entities');
  if (entities.length === 0) return;

  const predictions = [];
  let statsHasDelay = 0;
  let statsComputed = 0;
  let statsSkipped = 0;

  for (const ent of entities) {
    const tu = ent.tripUpdate;
    if (!tu?.trip) continue;
    const routeId = String(tu.trip.routeId || '');
    const tripId = String(tu.trip.tripId || '');
    if (!routeId || !tripId) continue;

    for (const stu of tu.stopTimeUpdate || []) {
      const dep = stu.departure;
      if (!dep) { statsSkipped++; continue; }

      let depTime = dep.time;
      if (depTime && typeof depTime.toNumber === 'function') {
        depTime = depTime.toNumber();
      }
      depTime = Number(depTime || 0);
      if (!depTime) { statsSkipped++; continue; }

      const delta = depTime - now;
      if (delta < -120 || delta > 600) continue;

      const delaySec = dep.delay;
      if (delaySec != null && delaySec !== 0) {
        predictions.push({
          routeId, tripId,
          stopId: String(stu.stopId),
          delaySec: Number(delaySec),
          source: 'hasDelay',
        });
        statsHasDelay++;
      } else {
        predictions.push({
          routeId, tripId,
          stopId: String(stu.stopId),
          predictedEpoch: depTime,
          delaySec: null,
          source: 'computed',
        });
        statsComputed++;
      }
    }
  }

  console.log(
    '[STO] ' + predictions.length + ' imminent predictions (hasDelay=' +
    statsHasDelay + ' computed=' + statsComputed + ' skipped=' + statsSkipped + ')'
  );
  if (predictions.length === 0) return;

  const dedupMap = new Map();
  for (const p of predictions) {
    const key = p.stopId + '|' + p.tripId;
    if (!dedupMap.has(key)) dedupMap.set(key, p);
  }
  const uniquePreds = [...dedupMap.values()];

  const scheduleMap = await lookupSchedules(uniquePreds, 'STO');
  const records = buildRecords(uniquePreds, scheduleMap, todayStr, offsetHours, 'STO');
  await upsertRecords(records, 'STO');
  console.log('[STO] Done — ' + records.length + ' records');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const isDST = new Date()
    .toLocaleString('en-US', { timeZone: 'America/Toronto', timeZoneName: 'short' })
    .includes('EDT');
  const offsetHours = isDST ? 4 : 5;
  const todayStr = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
  });

  // Process OC Transpo
  try {
    await collectOC(now, todayStr, offsetHours);
  } catch (e) {
    console.error('[OC] Pipeline error:', e.message);
  }

  // Process STO
  try {
    await collectSTO(now, todayStr, offsetHours);
  } catch (e) {
    console.error('[STO] Pipeline error:', e.message);
  }
})();
