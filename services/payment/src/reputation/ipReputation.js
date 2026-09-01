const pool = require('../db/pool');

const CACHE_TTL_HOURS = 24;
const ABUSEIPDB_URL = 'https://api.abuseipdb.com/api/v2/check';

// Private/local IP ranges — AbuseIPDB rejects these, so skip lookups entirely
function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  const cleaned = ip.replace('::ffff:', ''); // normalize IPv4-mapped IPv6
  if (cleaned === '::1' || cleaned === '127.0.0.1' || cleaned === 'localhost') return true;
  if (/^10\./.test(cleaned)) return true;
  if (/^192\.168\./.test(cleaned)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(cleaned)) return true;
  return false;
}

async function getFromCache(ip) {
  const result = await pool.query(
    `SELECT * FROM ip_reputation_cache
     WHERE ip = $1 AND checked_at > now() - interval '${CACHE_TTL_HOURS} hours'`,
    [ip]
  );
  return result.rows[0] || null;
}

async function saveToCache(ip, data) {
  await pool.query(
    `INSERT INTO ip_reputation_cache (ip, abuse_score, is_vpn_or_proxy, country_code, isp, raw_response, checked_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (ip) DO UPDATE SET
       abuse_score = $2, is_vpn_or_proxy = $3, country_code = $4, isp = $5, raw_response = $6, checked_at = now()`,
    [ip, data.abuse_score, data.is_vpn_or_proxy, data.country_code, data.isp, data.raw_response]
  );
}

async function queryAbuseIPDB(ip) {
  const apiKey = process.env.ABUSEIPDB_API_KEY;
  if (!apiKey) {
    console.warn('ABUSEIPDB_API_KEY not set — skipping IP reputation lookup');
    return null;
  }

  try {
    const res = await fetch(`${ABUSEIPDB_URL}?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, {
      headers: { 'Key': apiKey, 'Accept': 'application/json' }
    });

    if (!res.ok) {
      console.error(`AbuseIPDB error: ${res.status}`);
      return null;
    }

    const json = await res.json();
    const d = json.data;

    return {
      abuse_score: d.abuseConfidenceScore,
      is_vpn_or_proxy: d.isTor || false, // AbuseIPDB free tier flags Tor; VPN/proxy needs paid tier
      country_code: d.countryCode,
      isp: d.isp,
      raw_response: json
    };
  } catch (err) {
    console.error('AbuseIPDB request failed:', err.message);
    return null;
  }
}

// Returns { abuse_score, is_vpn_or_proxy, country_code, isp } or null if unavailable/private IP
async function checkIp(ip) {
  if (isPrivateOrLocalIp(ip)) return null;

  const cached = await getFromCache(ip);
  if (cached) {
    return {
      abuse_score: cached.abuse_score,
      is_vpn_or_proxy: cached.is_vpn_or_proxy,
      country_code: cached.country_code,
      isp: cached.isp
    };
  }

  const fresh = await queryAbuseIPDB(ip);
  if (!fresh) return null;

  await saveToCache(ip, fresh);
  return fresh;
}

module.exports = { checkIp, isPrivateOrLocalIp };
