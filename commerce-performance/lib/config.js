// Managed by PerfAgent - regenerated on every export. Put your own helpers in other files.
//
// Every exported tests/<test>/loadtest.js imports this file. It reads
// config/<PERF_ENV>.json and applies the PERF_TIER to the test's options:
//   smoke  1 virtual user per journey for a short time; only error budgets apply
//   load   the approved plan's load, optionally scaled ("scale": 0.5 = half)
// Budgets in the config (k6 thresholds by metric) replace the plan's budget for
// that metric. A "tests" entry overrides budgets or tiers for one test.

const NAME = /^[A-Za-z0-9_-]+$/;
const ERROR_BUDGETS = ['errors', 'http_req_failed', 'checks'];

export const DEFAULT_TIERS = {
  smoke: { vus: 1, duration: '30s', budgets: 'errors-only' },
  load: { scale: 1, budgets: 'all' },
};

export function environmentName() {
  const name = __ENV.PERF_ENV || 'dev';
  if (!NAME.test(name)) {
    throw new Error(`PERF_ENV "${name}" is not a valid environment name (letters, numbers, - and _ only)`);
  }
  return name;
}

export function parseConfig(text, name) {
  if (text === null || text === undefined) {
    return {};
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch (e) {
    throw new Error(`config/${name}.json is not valid JSON: ${e.message}`);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`config/${name}.json must hold a JSON object`);
  }
  return config;
}

function testSettings(config) {
  const test = __ENV.PERF_TEST || '';
  const tests = config.tests || {};
  const own = NAME.test(test) ? tests[test] : null;
  return own && typeof own === 'object' ? own : {};
}

export function tierSettings(config) {
  const name = String(__ENV.PERF_TIER || 'load').toLowerCase();
  const tiers = Object.assign({}, DEFAULT_TIERS, config.tiers || {});
  if (!tiers[name]) {
    throw new Error(`Unknown PERF_TIER "${name}". Use one of: ${Object.keys(tiers).join(', ')}`);
  }
  const own = (testSettings(config).tiers || {})[name] || {};
  return Object.assign({ name: name }, tiers[name], own);
}

function scaled(value, factor) {
  if (typeof value !== 'number') {
    return value;
  }
  return value > 0 ? Math.max(1, Math.ceil(value * factor)) : value;
}

export function applyFrameworkConfig(options, config) {
  const tier = tierSettings(config);
  const budgets = Object.assign({}, config.budgets || {}, testSettings(config).budgets || {});
  const thresholds = Object.assign({}, options.thresholds || {}, budgets);
  if (tier.budgets === 'errors-only') {
    for (const key of Object.keys(thresholds)) {
      if (ERROR_BUDGETS.indexOf(key.split('{')[0]) < 0) {
        delete thresholds[key];
      }
    }
  }
  options.thresholds = thresholds;

  const scenarios = options.scenarios || {};
  for (const key of Object.keys(scenarios)) {
    const scenario = scenarios[key];
    if (tier.vus) {
      scenarios[key] = {
        executor: 'constant-vus',
        vus: Number(tier.vus),
        duration: String(tier.duration || '30s'),
        exec: scenario.exec,
        gracefulStop: scenario.gracefulStop || '30s',
      };
      continue;
    }
    const factor = Number(tier.scale === undefined ? 1 : tier.scale);
    if (!(factor > 0)) {
      throw new Error(`Tier "${tier.name}" needs a "scale" greater than 0`);
    }
    if (factor === 1) {
      continue;
    }
    for (const field of ['vus', 'preAllocatedVUs', 'maxVUs', 'startVUs', 'rate', 'startRate']) {
      if (field in scenario) {
        scenario[field] = scaled(scenario[field], factor);
      }
    }
    if (scenario.executor === 'shared-iterations') {
      scenario.iterations = scaled(scenario.iterations, factor);
    }
    for (const stage of scenario.stages || []) {
      stage.target = scaled(stage.target, factor);
    }
  }
  return options;
}
